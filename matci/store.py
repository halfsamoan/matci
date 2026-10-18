"""UID-scoped SQLite journal and private, atomic preference summaries."""

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sqlite3
import stat

from .model import new_id, utc_now
from .policy import BUILTIN_APP_IDS


def current_uid():
    # Windows supports synthetic demos only. No Windows credential is passed to Linux.
    return os.getuid() if hasattr(os, 'getuid') else 0


def default_state_dir():
    root = os.environ.get('XDG_STATE_HOME')
    return (Path(root) if root and Path(root).is_absolute() else Path.home() / '.local/state') / 'matci'


def private_path(path, directory=False):
    if path.is_symlink():
        raise ValueError('STATE_SYMLINK')
    if not path.exists():
        if directory:
            path.mkdir(mode=0o700, parents=True)
        else:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
    info = path.stat()
    if (directory and not stat.S_ISDIR(info.st_mode)) or (not directory and not stat.S_ISREG(info.st_mode)):
        raise ValueError('STATE_TYPE')
    if hasattr(os, 'getuid') and info.st_uid != os.getuid():
        raise ValueError('STATE_OWNER')
    os.chmod(path, 0o700 if directory else 0o600)


class Store:
    def __init__(self, state_dir=None, uid=None):
        self.uid = current_uid() if uid is None else uid
        self.directory = Path(state_dir) if state_dir else default_state_dir()
        self.connection = None
        self.lock = None
        try:
            private_path(self.directory, directory=True)
            lock_path = self.directory / 'worker.lock'
            private_path(lock_path)
            self.lock = lock_path.open('r+b')
            if os.name == 'nt':
                import msvcrt
                self.lock.seek(0)
                if not self.lock.read(1):
                    self.lock.write(b'0')
                    self.lock.flush()
                self.lock.seek(0)
                msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            path = self.directory / 'state.db'
            private_path(path)
            self.connection = sqlite3.connect(path, timeout=1)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute('PRAGMA foreign_keys=ON')
            self.connection.execute('PRAGMA journal_mode=DELETE')
            version = self.connection.execute('PRAGMA user_version').fetchone()[0]
            if version == 0:
                if self.connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchone():
                    raise ValueError('UNKNOWN_SCHEMA')
                migration = Path(__file__).resolve().parent.parent / 'migrations/001_initial.sql'
                self.connection.executescript('BEGIN IMMEDIATE;\n' + migration.read_text(encoding='utf-8') + '\nCOMMIT;')
            elif version != 1:
                raise ValueError('UNSUPPORTED_SCHEMA')
            for table in ('memory_samples', 'app_observations', 'protection_rules', 'action_receipts', 'action_items'):
                if self.connection.execute(f'SELECT 1 FROM {table} WHERE owner_uid <> ? LIMIT 1', (self.uid,)).fetchone():
                    raise ValueError('CROSS_UID_DATABASE')
            self._seed_builtins()
            self._interrupt_receipts()
            self.prune()
            self.write_summary()
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.connection is not None:
            self.connection.close()
            self.connection = None
        if self.lock is not None:
            self.lock.close()
            self.lock = None

    def _seed_builtins(self):
        now = utc_now()
        with self.connection:
            for app_id in BUILTIN_APP_IDS:
                self.connection.execute('''INSERT INTO protection_rules
                    (id,owner_uid,created_at,updated_at,app_id,source,protected) VALUES(?,?,?,?,?,'builtin',1)
                    ON CONFLICT(owner_uid,app_id) DO UPDATE SET source='builtin',protected=1,updated_at=excluded.updated_at''',
                    (new_id(), self.uid, now, now, app_id))

    def _interrupt_receipts(self):
        now = utc_now()
        with self.connection:
            self.connection.execute('''UPDATE action_items SET result='rejected',reason_code='INTERRUPTED',updated_at=?
                WHERE owner_uid=? AND action_id IN
                (SELECT id FROM action_receipts WHERE owner_uid=? AND status IN ('requested','observing'))''',
                (now, self.uid, self.uid))
            self.connection.execute("UPDATE action_receipts SET status='partial',updated_at=? WHERE owner_uid=? AND status IN ('requested','observing')",
                                    (now, self.uid))

    def save_sample(self, sample):
        m, p, now = sample['memory'], sample['pressure'], sample['sampled_at']
        with self.connection:
            self.connection.execute('''INSERT INTO memory_samples
                (id,owner_uid,created_at,updated_at,boot_id,monotonic_ms,mode,health,total_bytes,available_bytes,psi_some_avg10,psi_full_avg10)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                (sample['sample_id'], self.uid, now, now, sample['boot_id'], sample['monotonic_ms'],
                 sample['mode'], sample['health'], m['total_bytes'], m['available_bytes'],
                 p['some_avg10'], p['full_avg10']))
        self.prune()

    def save_apps(self, sample, apps, protected):
        now = utc_now()
        with self.connection:
            owner = self.connection.execute('SELECT owner_uid FROM memory_samples WHERE id=? AND owner_uid=?',
                                            (sample['sample_id'], self.uid)).fetchone()
            if owner is None:
                raise ValueError('SAMPLE_NOT_OWNED')
            self.connection.execute("DELETE FROM protection_rules WHERE owner_uid=? AND source='user'", (self.uid,))
            for app_id in protected:
                if app_id not in BUILTIN_APP_IDS:
                    self.connection.execute('''INSERT INTO protection_rules
                        (id,owner_uid,created_at,updated_at,app_id,source,protected) VALUES(?,?,?,?,?,'user',1)''',
                        (new_id(), self.uid, now, now, app_id))
            # A resubmitted current sample replaces its complete view, never leaves stale apps.
            self.connection.execute('DELETE FROM app_observations WHERE sample_id=? AND owner_uid=?',
                                    (sample['sample_id'], self.uid))
            for app in apps:
                self.connection.execute('''INSERT INTO app_observations
                    (id,sample_id,owner_uid,created_at,updated_at,app_id,metric_kind,memory_bytes,coverage,classification,reason_code)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                    (new_id(), sample['sample_id'], self.uid, now, now, app['app_id'], app['metric_kind'],
                     app['memory_bytes'], app['coverage'], app['classification'], app['reason_code']))

    def receipt(self, action_id):
        receipt = self.connection.execute('SELECT * FROM action_receipts WHERE id=? AND owner_uid=?',
                                          (action_id, self.uid)).fetchone()
        if receipt is None:
            return None
        result = dict(receipt)
        result['items'] = [dict(item) for item in self.connection.execute('''SELECT app_id,result,reason_code FROM action_items
            WHERE action_id=? AND owner_uid=? ORDER BY app_id''', (action_id, self.uid))]
        return result

    def save_receipt(self, action_id, sample, status, items, after=None):
        now = utc_now()
        existing = self.receipt(action_id)
        before_value = sample['memory']['available_bytes'] if existing is None else existing['available_before']
        after_value = after['memory']['available_bytes'] if after else None
        delta = after_value - before_value if after_value is not None and before_value is not None else None
        with self.connection:
            if existing is None:
                self.connection.execute('''INSERT INTO action_receipts
                    (id,owner_uid,created_at,updated_at,sample_id,mode,status,available_before,available_after,observed_delta)
                    SELECT ?,?,?,?,id,mode,?,?,?,? FROM memory_samples WHERE id=? AND owner_uid=?''',
                    (action_id, self.uid, now, now, status, before_value, after_value, delta, sample['sample_id'], self.uid))
            else:
                self.connection.execute('''UPDATE action_receipts SET updated_at=?,status=?,available_after=?,observed_delta=?
                    WHERE id=? AND owner_uid=?''', (now, status, after_value, delta, action_id, self.uid))
            for item in items:
                self.connection.execute('''INSERT INTO action_items
                    (id,action_id,owner_uid,created_at,updated_at,app_id,result,reason_code)
                    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM action_receipts WHERE id=? AND owner_uid=?)
                    ON CONFLICT(action_id,app_id) DO UPDATE SET result=excluded.result,reason_code=excluded.reason_code,
                    updated_at=excluded.updated_at WHERE action_items.owner_uid=excluded.owner_uid''',
                    (new_id(), action_id, self.uid, now, now, item['app_id'], item['result'], item['reason_code'], action_id, self.uid))
        self.write_summary()
        return self.receipt(action_id)

    def prune(self):
        now = datetime.now(timezone.utc)
        sample_cutoff = (now - timedelta(hours=24)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        receipt_cutoff = (now - timedelta(days=30)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        with self.connection:
            self.connection.execute('DELETE FROM memory_samples WHERE owner_uid=? AND created_at<?', (self.uid, sample_cutoff))
            removed_old = self.connection.execute('DELETE FROM action_receipts WHERE owner_uid=? AND created_at<?', (self.uid, receipt_cutoff)).rowcount
            removed_excess = self.connection.execute('''DELETE FROM action_receipts WHERE owner_uid=? AND id NOT IN
                (SELECT id FROM action_receipts WHERE owner_uid=? ORDER BY created_at DESC,id DESC LIMIT 1000)''', (self.uid, self.uid))
            removed_excess = removed_excess.rowcount
        if removed_old or removed_excess:
            self.write_summary()

    def write_summary(self):
        receipts = [dict(row) for row in self.connection.execute('''SELECT id,created_at,updated_at,mode,status,available_before,available_after,observed_delta
            FROM action_receipts WHERE owner_uid=? ORDER BY created_at DESC,id DESC LIMIT 100''', (self.uid,))]
        by_id = {receipt['id']: receipt for receipt in receipts}
        for receipt in receipts:
            receipt['items'] = []
        if receipts:
            placeholders = ','.join('?' for _ in receipts)
            for row in self.connection.execute(f'''SELECT action_id,app_id,result,reason_code FROM action_items
                WHERE owner_uid=? AND action_id IN ({placeholders}) ORDER BY action_id,app_id''',
                                               (self.uid, *by_id)):
                by_id[row['action_id']]['items'].append({key: row[key] for key in ('app_id', 'result', 'reason_code')})
        summary = {'schema_version': 1, 'owner_uid': self.uid, 'updated_at': utc_now(), 'receipts': receipts}
        encoded = json.dumps(summary, ensure_ascii=True, separators=(',', ':'))
        while len(encoded.encode('utf-8')) > 120 * 1024 and receipts:
            receipts.pop()
            encoded = json.dumps(summary, ensure_ascii=True, separators=(',', ':'))
        target = self.directory / 'history-summary.json'
        if target.exists() or target.is_symlink():
            private_path(target)
        temporary = self.directory / ('summary-' + new_id() + '.tmp')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            if os.name != 'nt':
                directory_fd = os.open(self.directory, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
        finally:
            temporary.unlink(missing_ok=True)
