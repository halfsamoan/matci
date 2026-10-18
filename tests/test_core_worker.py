import copy
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from matci.demo import DemoCollector, load_replay
from matci.model import MAX_LINE_BYTES, new_id, utc_now
from matci.store import Store, WorkerLocked, current_uid
from matci.worker import Worker, decode_line, ProtocolError


class FakeCollector:
    def __init__(self, uid):
        self.uid, self.now, self.available = uid, 1000, 10000

    def sample(self, session_id):
        return {'schema_version': 1, 'type': 'snapshot', 'mode': 'live', 'sample_id': new_id(),
                'session_id': session_id, 'sampled_at': utc_now(), 'monotonic_ms': self.now,
                'boot_id': 'test-boot', 'health': 'ok',
                'memory': {'total_bytes': 100000, 'available_bytes': self.available, 'used_ratio': 0.9,
                           'definition': 'MemTotal minus MemAvailable', 'observed_monotonic_ms': self.now, 'age_ms': 0},
                'pressure': {'some_avg10': None, 'full_avg10': None, 'availability': 'unavailable'},
                'processes': [{'uid': self.uid, 'pid': 10, 'start_ticks': 200, 'comm': 'chrome',
                               'metric_kind': 'pss', 'memory_bytes': 1024, 'coverage': 'complete',
                               'cpu_fraction_one_core': 0, 'has_work_descendants': False,
                               'identity_observed_monotonic_ms': self.now,
                               'metric_observed_monotonic_ms': self.now, 'metric_age_ms': 0}],
                'warnings': ['TEST_ONLY'], 'truncated': False}


class WorkerContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / 'state')
        self.addCleanup(self.store.close)
        self.collector = FakeCollector(self.store.uid)
        self.worker = Worker(self.collector, self.store, 'live', clock=lambda: self.collector.now)
        self.snapshot = self.worker.sample()

    def message(self, kind, **fields):
        return dict(schema_version=1, type=kind, request_id=new_id(),
                    session_id=self.worker.session_id, **fields)

    def send(self, message):
        return self.worker.handle_line(json.dumps(message).encode())

    def view(self, **fields):
        message = self.message('record_app_view', sample_id=self.snapshot['sample_id'], apps=[{
            'app_id': 'browser.desktop', 'process_keys': [{'uid': self.store.uid, 'pid': 10, 'start_ticks': 200}],
            'classification': 'candidate', 'reason_code': 'USER_REVIEW_REQUIRED'}], user_protected_app_ids=[])
        message.update(fields)
        return message

    def receipt(self, **fields):
        message = self.message('record_receipt', sample_id=self.snapshot['sample_id'], mode='live',
                               action_id=new_id(), status='requested', items=[{'app_id': 'browser.desktop',
                               'result': 'requested', 'reason_code': 'USER_SELECTED'}])
        message.update(fields)
        return message

    def test_authoritative_app_bytes_and_builtin_mirror(self):
        ack = self.send(self.view())
        self.assertEqual(ack['type'], 'ack')
        self.assertEqual(ack['apps'][0]['memory_bytes'], 1024)
        self.assertEqual(ack['apps'][0]['classification'], 'candidate')
        self.assertGreater(self.store.connection.execute("SELECT count(*) FROM protection_rules WHERE source='builtin' AND protected=1").fetchone()[0], 10)

    def test_record_receipt_derived_delta_can_be_negative(self):
        self.send(self.view())
        requested = self.receipt(available_before=999999999)
        ack = self.send(requested)
        self.assertEqual(ack['type'], 'ack')
        self.assertEqual(ack['receipt']['available_before'], 10000)
        self.collector.now += 1000
        self.collector.available = 9000
        after = self.worker.sample()
        completed = self.receipt(action_id=requested['action_id'], status='completed', after_sample_id=after['sample_id'],
                                 items=[{'app_id': 'browser.desktop', 'result': 'window_closed', 'reason_code': 'WINDOWS_CLOSED'}],
                                 available_after=7777777, observed_delta=666666)
        ack = self.send(completed)
        self.assertEqual(ack['status'], 'completed')
        self.assertEqual(ack['receipt']['observed_delta'], -1000)
        summary = json.loads((self.store.directory / 'history-summary.json').read_text())
        self.assertEqual(summary['receipts'][0]['observed_delta'], -1000)
        self.assertNotIn('comm', json.dumps(summary))

    def test_duplicate_requests_idempotent_but_payload_reuse_rejected(self):
        message = self.view()
        first = self.send(message)
        self.assertEqual(first, self.send(message))
        message['apps'][0]['reason_code'] = 'OTHER'
        self.assertEqual(self.send(message)['code'], 'REQUEST_ID_REUSED')
        self.assertEqual(self.store.connection.execute('SELECT count(*) FROM app_observations').fetchone()[0], 1)

    def test_session_version_unknown_command_and_raw_strings_rejected(self):
        for change, code in (({'session_id': 'old'}, 'SESSION_MISMATCH'),
                             ({'schema_version': True}, 'SCHEMA_VERSION'),
                             ({'type': 'kill'}, 'COMMAND_NOT_SUPPORTED')):
            message = self.view()
            message.update(change)
            self.assertEqual(self.send(message)['code'], code)
        message = self.view()
        message['apps'][0]['reason_code'] = 'secret command --arg'
        error = self.send(message)
        self.assertEqual(error['code'], 'APP_CLASSIFICATION')
        self.assertNotIn('secret', json.dumps(error))

    def test_stale_sample_and_pid_start_uid_are_rejected(self):
        for key, value in (('pid', 0), ('start_ticks', 201), ('uid', self.store.uid + 1), ('pid', True)):
            message = self.view()
            message['apps'][0]['process_keys'][0][key] = value
            self.assertEqual(self.send(message)['type'], 'error')
        self.worker.sample()
        self.assertEqual(self.send(self.view())['code'], 'STALE_SAMPLE')

    def test_cross_app_and_within_app_duplicate_process_keys_rejected(self):
        message = self.view()
        message['apps'].append(copy.deepcopy(message['apps'][0]))
        message['apps'][1]['app_id'] = 'other.desktop'
        self.assertEqual(self.send(message)['code'], 'DUPLICATE_PROCESS_KEY')
        message = self.view()
        message['apps'][0]['process_keys'] *= 2
        self.assertEqual(self.send(message)['code'], 'DUPLICATE_PROCESS_KEY')

    def test_protected_and_unmapped_cannot_start_receipt(self):
        for update in ({'user_protected_app_ids': ['browser.desktop']},
                       {'apps': [{'app_id': 'browser.desktop', 'process_keys': [], 'classification': 'candidate', 'reason_code': 'USER_SELECTED'}]}):
            self.send(self.view(**update))
            self.assertEqual(self.send(self.receipt())['code'], 'APP_PROTECTED_OR_UNMAPPED')

    def test_builtin_process_protection_overrides_claim(self):
        self.worker.current_sample['processes'][0]['comm'] = 'node'
        ack = self.send(self.view())
        self.assertEqual(ack['apps'][0]['classification'], 'protected')
        self.assertEqual(self.send(self.receipt())['code'], 'APP_PROTECTED_OR_UNMAPPED')

    def test_partial_process_coverage_never_claims_candidate(self):
        self.worker.current_sample['truncated'] = True
        ack = self.send(self.view())
        self.assertEqual(ack['apps'][0]['classification'], 'unknown')
        self.assertEqual(self.send(self.receipt())['code'], 'APP_PROTECTED_OR_UNMAPPED')

    def test_app_view_extra_bytes_or_oversized_lists_rejected(self):
        message = self.view()
        message['apps'][0]['memory_bytes'] = 1000000000
        self.assertEqual(self.send(message)['code'], 'APP_FIELDS')
        self.assertEqual(self.send(self.view(user_protected_app_ids=['x'] * 101))['code'], 'PROTECTION_LIST')

    def test_requested_ack_requires_fresh_sample(self):
        self.send(self.view())
        self.collector.now += 5001
        self.assertEqual(self.send(self.receipt())['code'], 'STALE_SAMPLE')
        self.assertEqual(self.store.connection.execute('SELECT count(*) FROM action_receipts').fetchone()[0], 0)

    def test_state_regression_targets_and_false_completion_rejected(self):
        self.send(self.view())
        requested = self.receipt()
        self.send(requested)
        self.assertEqual(self.send(self.receipt(action_id=requested['action_id'], status='completed'))['code'], 'COMPLETION_NOT_OBSERVED')
        changed = self.receipt(action_id=requested['action_id'], status='observing')
        changed['items'][0]['app_id'] = 'other.desktop'
        self.assertEqual(self.send(changed)['code'], 'RECEIPT_TARGET_CHANGED')
        self.send(self.receipt(action_id=requested['action_id'], status='observing'))
        self.assertEqual(self.send(self.receipt(action_id=requested['action_id']))['code'], 'RECEIPT_STATE_REGRESSION')

    def test_completed_requires_current_after_sample(self):
        self.send(self.view())
        requested = self.receipt()
        self.send(requested)
        final = self.receipt(action_id=requested['action_id'], status='completed',
                             items=[{'app_id': 'browser.desktop', 'result': 'window_closed', 'reason_code': 'WINDOWS_CLOSED'}])
        self.assertEqual(self.send(final)['code'], 'AFTER_SAMPLE_REQUIRED')

    def test_midflight_restart_marks_interrupted_without_retry(self):
        self.send(self.view())
        requested = self.receipt()
        self.send(requested)
        directory = self.store.directory
        self.store.close()
        self.store = Store(directory)
        self.addCleanup(self.store.close)
        receipt = self.store.receipt(requested['action_id'])
        self.assertEqual(receipt['status'], 'partial')
        self.assertEqual(receipt['items'][0]['reason_code'], 'INTERRUPTED')

    def test_malformed_input_never_echoes_and_never_crashes(self):
        for line in (b'not json secret', b'[]', b'{"x":1,"x":2}', b'{"x":NaN}',
                     b'\xff', b'x' * (MAX_LINE_BYTES + 1)):
            response = self.worker.handle_line(line)
            self.assertEqual(response['type'], 'error')
            self.assertNotIn('secret', json.dumps(response))
        message = self.view()
        message['apps'][0]['classification'] = []
        self.assertEqual(self.send(message)['type'], 'error')

    def test_single_worker_lock(self):
        with self.assertRaises(WorkerLocked):
            Store(self.store.directory)

    def test_foreign_owner_database_and_future_schema_refused(self):
        directory = self.store.directory
        self.store.connection.execute('UPDATE protection_rules SET owner_uid=?', (self.store.uid + 1,))
        self.store.connection.commit()
        self.store.close()
        with self.assertRaisesRegex(ValueError, 'CROSS_UID_DATABASE'):
            Store(directory)
        connection = sqlite3.connect(directory / 'state.db')
        connection.execute('PRAGMA user_version=99')
        connection.close()
        with self.assertRaisesRegex(ValueError, 'UNSUPPORTED_SCHEMA'):
            Store(directory)

    def test_retention_samples_receipts_and_private_files(self):
        self.store.connection.execute("UPDATE memory_samples SET created_at='2000-01-01T00:00:00Z'")
        self.store.connection.commit()
        self.store.prune()
        self.assertEqual(self.store.connection.execute('SELECT count(*) FROM memory_samples').fetchone()[0], 0)
        if os.name != 'nt':
            self.assertEqual(self.store.directory.stat().st_mode & 0o777, 0o700)
            for path in self.store.directory.iterdir():
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_receipt_retention_30_days_and_1000_limit(self):
        now = utc_now()
        rows = [(f'retained-{index:04}', self.store.uid, now, now, 'live', 'completed') for index in range(1001)]
        rows.append(('expired', self.store.uid, '2000-01-01T00:00:00Z', now, 'live', 'completed'))
        with self.store.connection:
            self.store.connection.executemany('''INSERT INTO action_receipts
                (id,owner_uid,created_at,updated_at,mode,status) VALUES(?,?,?,?,?,?)''', rows)
        self.store.prune()
        self.assertIsNone(self.store.receipt('expired'))
        self.assertEqual(self.store.connection.execute('SELECT count(*) FROM action_receipts').fetchone()[0], 1000)
        self.store.write_summary()
        summary = json.loads((self.store.directory / 'history-summary.json').read_text())
        self.assertEqual(len(summary['receipts']), 100)

    def test_summary_respects_native_128_kib_reader_bound(self):
        now = utc_now()
        with self.store.connection:
            for index in range(15):
                action = f'large-{index}'
                self.store.connection.execute('''INSERT INTO action_receipts
                    (id,owner_uid,created_at,updated_at,mode,status) VALUES(?,?,?,?,'live','partial')''',
                    (action, self.store.uid, now, now))
                self.store.connection.executemany('''INSERT INTO action_items
                    (id,action_id,owner_uid,created_at,updated_at,app_id,result,reason_code)
                    VALUES(?,?,?,?,?,?,'still_running',?)''',
                    [(new_id(), action, self.store.uid, now, now, f'app-{item}-' + 'x' * 110,
                      'R' * 64) for item in range(100)])
        self.store.write_summary()
        target = self.store.directory / 'history-summary.json'
        self.assertLessEqual(target.stat().st_size, 120 * 1024)
        summary = json.loads(target.read_text())
        self.assertGreater(len(summary['receipts']), 0)
        self.assertLess(len(summary['receipts']), 15)

    @unittest.skipIf(os.name == 'nt', 'POSIX filesystem contract')
    def test_symlink_state_database_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'target').touch()
            (root / 'state.db').symlink_to(root / 'target')
            with self.assertRaisesRegex(ValueError, 'STATE_SYMLINK'):
                Store(root)


class DemoCliTests(unittest.TestCase):
    def test_demo_is_explicit_synthetic_and_actions_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            try:
                worker = Worker(DemoCollector(store.uid), store, 'demo')
                snapshot = worker.sample()
                self.assertEqual(snapshot['mode'], 'demo')
                self.assertIn('SYNTHETIC_DATA', snapshot['warnings'])
                message = {'schema_version': 1, 'type': 'record_receipt', 'request_id': new_id(),
                           'session_id': worker.session_id, 'sample_id': snapshot['sample_id'], 'mode': 'demo'}
                self.assertEqual(worker.handle_line(json.dumps(message).encode())['code'], 'LIVE_ACTIONS_ONLY')
            finally:
                store.close()

    def test_cli_once_demo_and_windows_live_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, '-m', 'matci', '--once', '--mode', 'demo', '--state-dir', directory],
                                    capture_output=True, check=True, timeout=10)
            snapshot = json.loads(result.stdout)
            self.assertEqual(snapshot['type'], 'snapshot')
            self.assertEqual(snapshot['mode'], 'demo')
        if os.name == 'nt':
            result = subprocess.run([sys.executable, '-m', 'matci', '--once', '--mode', 'live'], capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(json.loads(result.stdout)['code'], 'LIVE_REQUIRES_LINUX')

    def test_cli_watch_request_ack_and_eof_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            child = subprocess.Popen([sys.executable, '-m', 'matci', '--watch', '--mode', 'demo', '--state-dir', directory],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                snapshot = json.loads(child.stdout.readline())
                request = {'schema_version': 1, 'type': 'sample_now', 'request_id': 'test-request', 'session_id': snapshot['session_id']}
                child.stdin.write(json.dumps(request).encode() + b'\n')
                child.stdin.flush()
                response = json.loads(child.stdout.readline())
                self.assertEqual(response['request_id'], 'test-request')
                child.stdin.close()
                self.assertEqual(child.wait(timeout=10), 0)
            finally:
                if child.poll() is None:
                    child.terminate()
                    child.wait(timeout=5)
                for stream in (child.stdin, child.stdout, child.stderr):
                    stream.close()

    def test_replay_cannot_pass_raw_argv_and_requires_valid_metrics(self):
        fixture = Path(__file__).resolve().parents[1] / 'data/demo-snapshots.json'
        frames = load_replay(fixture)
        self.assertEqual(len(frames), 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'replay.json'
            frame = json.loads(fixture.read_text())[0]
            frame['processes'][0]['argv'] = 'private-secret-command'
            path.write_text(json.dumps(frame))
            self.assertNotIn('private-secret', json.dumps(load_replay(path)))
            frame['memory']['available_bytes'] = -1
            path.write_text(json.dumps(frame))
            with self.assertRaises(ValueError):
                load_replay(path)


if __name__ == '__main__':
    unittest.main()
