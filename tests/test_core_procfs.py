import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from matci import procfs as procfs_module
from matci.policy import aggregate, aggregate_members, classify, tree_members
from matci.procfs import ProcCollector, parse_meminfo, parse_pressure, parse_stat, parse_status_uid
from matci.store import Store
from matci.worker import Worker


def stat_line(pid, comm='chrome', ppid=1, ticks=100, start=200, pages=50):
    fields = ['S', str(ppid)] + ['0'] * 20
    fields[11], fields[12], fields[19], fields[21] = str(ticks), '0', str(start), str(pages)
    return f'{pid} ({comm}) ' + ' '.join(fields)


class ProcFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'meminfo').write_text('MemTotal: 1024 kB\nMemAvailable: 256 kB\n')
        (self.root / 'sys/kernel/random').mkdir(parents=True)
        (self.root / 'sys/kernel/random/boot_id').write_text('fixture-boot')
        self.now = 1000
        self.collector = ProcCollector(self.root, uid=1000, clock=lambda: self.now,
                                       page_size=4096, clock_ticks=100,
                                       hwmon_root=self.root / 'hwmon')

    def process(self, pid=10, uid=1000, comm='chrome', ppid=1, ticks=100, start=200, pages=50, pss=True):
        directory = self.root / str(pid)
        directory.mkdir(exist_ok=True)
        (directory / 'status').write_text(f'Uid:\t{uid}\t{uid}\t{uid}\t{uid}\n')
        (directory / 'stat').write_text(stat_line(pid, comm, ppid, ticks, start, pages))
        if pss:
            (directory / 'smaps_rollup').write_text('Pss: 123 kB\n')
        else:
            (directory / 'smaps_rollup').write_text('Pss: unavailable\n')
        return directory

    def sample(self):
        return self.collector.sample('fixture-session')

    def test_same_uid_only_and_optional_psi(self):
        self.process()
        self.process(pid=11, uid=1001)
        sample = self.sample()
        self.assertEqual([p['pid'] for p in sample['processes']], [10])
        self.assertEqual(sample['health'], 'ok')
        self.assertEqual(sample['pressure']['availability'], 'unavailable')
        self.assertEqual(sample['processes'][0]['memory_bytes'], 123 * 1024)
        self.assertIsNone(sample['processes'][0]['cpu_fraction_one_core'])

    def test_full_and_light_samples_include_optional_hardware_readings(self):
        chip = self.root / 'hwmon' / 'hwmon0'
        chip.mkdir(parents=True)
        (chip / 'name').write_text('k10temp')
        (chip / 'temp1_label').write_text('Tctl')
        (chip / 'temp1_input').write_text('60625')
        fan = self.root / 'hwmon' / 'hwmon1'
        fan.mkdir()
        (fan / 'name').write_text('asus')
        (fan / 'fan1_label').write_text('cpu_fan')
        (fan / 'fan1_input').write_text('3300')
        expected = {'cpu_temperature_c': 60.625, 'cpu_fan_rpm': 3300}
        self.assertEqual(self.sample()['hardware'], expected)
        self.assertEqual(self.collector.sample_light('fixture-session')['hardware'], expected)

    def test_rss_fallback_and_pss_age(self):
        self.process()
        self.process(pid=11, pss=False)
        sample = self.sample()
        self.assertEqual(sample['processes'][1]['metric_kind'], 'rss')
        self.assertEqual(sample['processes'][1]['memory_bytes'], 50 * 4096)
        self.now += 5000
        self.process(ticks=110)
        later = self.sample()['processes'][0]
        self.assertEqual(later['metric_age_ms'], 5000)
        self.assertEqual(later['metric_observed_monotonic_ms'], 1000)
        self.assertAlmostEqual(later['cpu_fraction_one_core'], 0.02)

    def test_pid_reuse_resets_cpu_and_metric_cache(self):
        self.process()
        self.sample()
        self.now += 5000
        directory = self.process(start=201, pss=False)
        process = self.sample()['processes'][0]
        self.assertIsNone(process['cpu_fraction_one_core'])
        self.assertEqual(process['metric_kind'], 'rss')
        self.assertEqual(process['metric_age_ms'], 0)

    def test_reboot_resets_cpu_baseline(self):
        self.process()
        self.sample()
        self.now += 5000
        self.process(ticks=500)
        (self.root / 'sys/kernel/random/boot_id').write_text('fixture-other-boot')
        self.assertIsNone(self.sample()['processes'][0]['cpu_fraction_one_core'])

    def test_running_development_child_protects_ancestor(self):
        self.process()
        self.process(pid=11, comm='node', ppid=10)
        process = self.sample()['processes'][0]
        self.assertTrue(process['has_work_descendants'])
        self.assertEqual(classify('chrome.desktop', [process], requested_classification='candidate'),
                         ('protected', 'WORK_DESCENDANT'))

    def test_busy_same_binary_helper_does_not_lock_its_app(self):
        # Firefox: main -> forkserver -> content process, all one binary; a busy tab is not outside work.
        for pid, ppid in ((10, 1), (11, 10), (12, 11)):
            directory = self.process(pid=pid, comm='firefox', ppid=ppid)
            (directory / 'exe').symlink_to('/snap/firefox/current/usr/lib/firefox/firefox')
        self.sample()
        self.now += 1000
        (self.root / '12' / 'stat').write_text(stat_line(12, 'firefox', 11, ticks=200))
        processes = {p['pid']: p for p in self.sample()['processes']}
        self.assertFalse(processes[10]['has_work_descendants'])
        self.assertFalse(processes[11]['has_work_descendants'])
        # A different binary doing the work (an agent or compiler) still protects the app.
        directory = self.process(pid=13, comm='helper', ppid=10)
        (directory / 'exe').symlink_to('/usr/bin/python3')
        self.sample()
        self.now += 1000
        (self.root / '13' / 'stat').write_text(stat_line(13, 'helper', 10, ticks=200))
        self.assertTrue({p['pid']: p for p in self.sample()['processes']}[10]['has_work_descendants'])

    def test_disappearing_process_is_skipped_and_sample_complete(self):
        directory = self.process()
        (directory / 'stat').unlink()
        sample = self.sample()
        self.assertEqual(sample['health'], 'ok')
        self.assertNotIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])
        self.assertEqual(sample['processes'], [])

    def test_pid_reuse_during_scan_is_skipped(self):
        directory = self.process()
        original = procfs_module.read_text
        stat_reads = 0

        def reused_stat(path, limit=128 * 1024):
            nonlocal stat_reads
            if path == directory / 'stat':
                stat_reads += 1
                if stat_reads == 2:
                    return stat_line(10, start=201)
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=reused_stat):
            sample = self.sample()
        self.assertEqual(sample['health'], 'ok')
        self.assertNotIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])
        self.assertEqual(sample['processes'], [])

    def test_process_lookup_during_recheck_is_skipped(self):
        directory = self.process()
        original = procfs_module.read_text
        stat_reads = 0

        def vanished_stat(path, limit=128 * 1024):
            nonlocal stat_reads
            if path == directory / 'stat':
                stat_reads += 1
                if stat_reads == 2:
                    raise ProcessLookupError()
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=vanished_stat):
            sample = self.sample()
        self.assertEqual(sample['health'], 'ok')
        self.assertNotIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])
        self.assertEqual(sample['processes'], [])

    def test_permission_error_stays_partial(self):
        directory = self.process()
        original = procfs_module.read_text

        def inaccessible_status(path, limit=128 * 1024):
            if path == directory / 'status':
                raise PermissionError()
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=inaccessible_status):
            sample = self.sample()
        self.assertEqual(sample['health'], 'partial')
        self.assertIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])

    def test_uid_change_stays_partial(self):
        directory = self.process()
        original = procfs_module.read_text
        status_reads = 0

        def changed_uid(path, limit=128 * 1024):
            nonlocal status_reads
            if path == directory / 'status':
                status_reads += 1
                if status_reads == 2:
                    return 'Uid:\t2000\t2000\t2000\t2000\n'
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=changed_uid):
            sample = self.sample()
        self.assertEqual(sample['health'], 'partial')
        self.assertIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])
        self.assertEqual(sample['processes'], [])

    def test_missing_memory_has_null_observation_age(self):
        (self.root / 'meminfo').unlink()
        sample = self.sample()
        self.assertEqual(sample['health'], 'error')
        self.assertIsNone(sample['memory']['available_bytes'])
        self.assertIsNone(sample['memory']['observed_monotonic_ms'])
        self.assertIsNone(sample['memory']['age_ms'])

    def test_process_limit_and_metric_budget(self):
        for pid in range(1, 259):
            self.process(pid=pid)
        sample = self.sample()
        self.assertEqual(len(sample['processes']), 256)
        self.assertTrue(sample['truncated'])
        self.assertEqual(sum(p['metric_kind'] == 'pss' for p in sample['processes']), procfs_module.PSS_BUDGET)

    def test_pss_budget_prefers_largest_rss(self):
        budget = procfs_module.PSS_BUDGET
        for pid in range(10, 16 + budget):
            self.process(pid=pid, pages=1000 - pid)
        sample = self.sample()
        pss_pids = {process['pid'] for process in sample['processes'] if process['metric_kind'] == 'pss'}
        self.assertEqual(pss_pids, set(range(10, 10 + budget)))

    def test_pss_budget_limit_per_sample(self):
        for pid in range(10, 20 + procfs_module.PSS_BUDGET):
            self.process(pid=pid, pages=1000 - pid)
        original = procfs_module.read_text
        smaps_reads = 0

        def count_smaps(path, limit=128 * 1024):
            nonlocal smaps_reads
            if path.name == 'smaps_rollup':
                smaps_reads += 1
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=count_smaps):
            self.sample()
        self.assertLessEqual(smaps_reads, procfs_module.PSS_BUDGET)

    def test_pss_cache_ttl_30s(self):
        self.process()
        original = procfs_module.read_text
        smaps_reads = 0

        def count_smaps(path, limit=128 * 1024):
            nonlocal smaps_reads
            if path.name == 'smaps_rollup':
                smaps_reads += 1
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=count_smaps):
            first = self.sample()['processes'][0]
            self.now += 29999
            fresh = self.sample()['processes'][0]
            self.now += 1
            renewed = self.sample()['processes'][0]
        self.assertEqual(smaps_reads, 2)
        self.assertEqual(fresh['metric_age_ms'], 29999)
        self.assertEqual(renewed['metric_age_ms'], 0)
        self.assertEqual(first['metric_kind'], 'pss')

    def test_pss_permission_failure_cached_60s(self):
        directory = self.process()
        original = procfs_module.read_text
        smaps_reads = 0

        def deny_smaps(path, limit=128 * 1024):
            nonlocal smaps_reads
            if path == directory / 'smaps_rollup':
                smaps_reads += 1
                raise PermissionError()
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=deny_smaps):
            first = self.sample()
            self.now += 59999
            cached_failure = self.sample()
            self.now += 1
            retried = self.sample()
        self.assertEqual(smaps_reads, 2)
        for sample in (first, cached_failure, retried):
            self.assertEqual(sample['health'], 'ok')
            self.assertEqual(sample['processes'][0]['metric_kind'], 'rss')

    def test_pss_vanished_during_smaps_dropped(self):
        directory = self.process()
        original = procfs_module.read_text

        def vanish_smaps(path, limit=128 * 1024):
            if path == directory / 'smaps_rollup':
                raise FileNotFoundError()
            return original(path, limit)

        with patch('matci.procfs.read_text', side_effect=vanish_smaps):
            sample = self.sample()
        self.assertEqual(sample['health'], 'ok')
        self.assertNotIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])
        self.assertEqual(sample['processes'], [])

    def test_pss_cache_pruned_for_gone_processes(self):
        directory = self.process()
        self.sample()
        self.assertEqual(len(self.collector.pss_cache), 1)
        import shutil
        shutil.rmtree(directory)
        self.now += 5050
        sample = self.sample()
        self.assertEqual(sample['health'], 'ok')
        self.assertEqual(self.collector.pss_cache, {})
        self.assertEqual(self.collector.pss_fail_cache, {})

    def test_light_sample_reads_only_system_files(self):
        self.process()
        with patch.object(Path, 'iterdir', side_effect=AssertionError('process list must not be scanned')):
            sample = self.collector.sample_light('fixture-session')
        self.assertEqual(sample['processes'], [])
        self.assertFalse(sample['truncated'])
        self.assertIn('PROCESS_DETAIL_PAUSED', sample['warnings'])
        self.assertEqual(sample['health'], 'partial')

    def test_cpu_baseline_cleared_after_light_period(self):
        self.process()
        store = Store(self.root / 'state', uid=1000)
        self.addCleanup(store.close)
        worker = Worker(self.collector, store, 'live')
        first = worker.sample()
        self.assertIsNone(first['processes'][0]['cpu_fraction_one_core'])
        self.assertTrue(self.collector.previous)

        def command(detail, request_id):
            return worker.handle_line(json.dumps({'schema_version': 1, 'type': 'set_detail',
                'request_id': request_id, 'session_id': worker.session_id, 'detail': detail}).encode())

        self.now += 1000
        light = command(False, 'detail-off')
        self.assertIn('PROCESS_DETAIL_PAUSED', light['warnings'])
        self.assertEqual(self.collector.previous, {})
        self.now += 1000
        resumed = command(True, 'detail-on')
        self.assertIsNone(resumed['processes'][0]['cpu_fraction_one_core'])


class ParserPolicyTests(unittest.TestCase):
    def test_meminfo_missing_invalid_and_zero(self):
        for text in ('MemTotal: 1 kB', 'MemTotal: 0 kB\nMemAvailable: 0 kB',
                     'MemTotal: 1 kB\nMemAvailable: 2 kB', 'MemTotal: 1 kB\nMemAvailable: -1 kB',
                     'MemTotal: 1 kB\nMemAvailable: 0 kB\nMemAvailable: 0 kB'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_meminfo(text)

    def test_stat_parentheses_and_no_raw_command(self):
        process = parse_stat(stat_line(10, 'a ) (b\n'))
        self.assertEqual(process['comm'], 'a ) (b')
        self.assertEqual(process['start_ticks'], 200)
        self.assertEqual(process['cpu_ticks'], 100)
        self.assertEqual(parse_stat(stat_line(10, '/path/chrome'))['comm'], 'chrome')
        for line in ('0 (zero) S', '10 (broken', stat_line(-1), stat_line(1, pages=-1)):
            with self.assertRaises(ValueError):
                parse_stat(line)

    def test_pressure_partial_absent_and_invalid(self):
        self.assertEqual(parse_pressure('some avg10=0.00 avg60=1.2 total=0')['some_avg10'], 0)
        self.assertEqual(parse_pressure('some avg10=1.2')['availability'], 'partial')
        for text in ('', 'some avg10=nan', 'full avg10=101'):
            with self.assertRaises(ValueError):
                parse_pressure(text)

    def test_mixed_credentials_rejected(self):
        with self.assertRaises(ValueError):
            parse_status_uid('Uid: 1000 0 1000 1000')

    def test_mixed_pss_rss_not_summed(self):
        self.assertEqual(aggregate([{'metric_kind': 'pss', 'memory_bytes': 100, 'coverage': 'complete'},
                                    {'metric_kind': 'rss', 'memory_bytes': 200, 'coverage': 'complete'}]),
                         ('unavailable', None, 'partial'))

    def test_app_tree_sums_pss_and_stops_at_other_apps(self):
        def proc(pid, ppid, amount, kind='pss'):
            return {'uid': 1000, 'pid': pid, 'ppid': ppid, 'start_ticks': pid, 'memory_bytes': amount,
                    'metric_kind': kind, 'coverage': 'complete'}
        # terminal(1) -> shell(2) -> firefox(3) -> content(4 pss, 5 rss); firefox is its own app.
        processes = [proc(1, 0, 10), proc(2, 1, 1), proc(3, 2, 500), proc(4, 3, 700), proc(5, 3, 90, 'rss')]
        children = {}
        for process in processes:
            children.setdefault(process['ppid'], []).append(process)
        roots = {1, 3}
        firefox = tree_members([processes[2]], roots, children)
        self.assertEqual(sorted(p['pid'] for p in firefox), [3, 4, 5])
        self.assertEqual(aggregate_members(firefox), ('pss', 1290, 'partial'))
        terminal = tree_members([processes[0]], roots, children)
        self.assertEqual(aggregate_members(terminal), ('pss', 11, 'complete'))
        self.assertEqual(aggregate_members([]), ('unavailable', None, 'unavailable'))

    def test_builtin_cannot_be_unset_or_unknown_mapped(self):
        process = {'comm': 'chrome', 'cpu_fraction_one_core': 0, 'has_work_descendants': False}
        self.assertEqual(classify('code.desktop', [process], requested_classification='candidate')[0], 'protected')
        self.assertEqual(classify('org.gnome.Terminal.desktop', [], mapped=False)[0], 'protected')
        self.assertEqual(classify('unknown.desktop', [], mapped=False)[0], 'unknown')
        process['comm'] = 'python3.12'
        self.assertEqual(classify('not-editor.desktop', [process], requested_classification='candidate')[0], 'protected')


if __name__ == '__main__':
    unittest.main()
