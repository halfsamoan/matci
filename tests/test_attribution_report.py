from pathlib import Path
import tempfile
import unittest

from tools.attribution_report import report


def stat_line(pid, ppid, start, pages):
    fields = ['S', str(ppid)] + ['0'] * 20
    fields[11], fields[12], fields[19], fields[21] = '100', '0', str(start), str(pages)
    return f'{pid} (fixture-app) ' + ' '.join(fields)


class AttributionReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.proc = self.root / 'proc'
        self.cgroups = self.root / 'sys/fs/cgroup'
        self.proc.mkdir()
        self.scope_a = '/user.slice/user-1000.slice/user@1000.service/app.slice/app-gnome-firefox-42.scope'
        self.scope_b = '/user.slice/user-1000.slice/user@1000.service/app.slice/app-flatpak-editor-9.scope'
        self.uid = 1000

    def process(self, pid, *, ppid=1, start=100, pages=50, pss=100, scope=None, uid=1000):
        directory = self.proc / str(pid)
        directory.mkdir()
        (directory / 'status').write_text(f'Uid:\t{uid}\t{uid}\t{uid}\t{uid}\n')
        (directory / 'stat').write_text(stat_line(pid, ppid, start, pages))
        if pss == 'unreadable':
            (directory / 'smaps_rollup').write_text('Pss: unavailable\n')
        else:
            (directory / 'smaps_rollup').write_text(f'Pss: {pss} kB\n')
        cgroup = '' if scope is None else f'0::{scope}\n'
        (directory / 'cgroup').write_text(cgroup)
        return directory

    def cgroup_memory(self, scope, current, anon):
        directory = self.cgroups / scope.lstrip('/')
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'memory.current').write_text(f'{current}\n')
        (directory / 'memory.stat').write_text(f'anon {anon}\nfile 10\n')

    def run_report(self, **kwargs):
        return report(self.proc, self.cgroups, uid=self.uid, **kwargs)

    def test_scope_grouping_tree_scope_and_cgroup_sums(self):
        self.process(10, start=100, pages=50, pss=100, scope=self.scope_a)
        self.process(11, ppid=10, start=200, pages=30, pss=200, scope=self.scope_a)
        self.process(12, start=150, pages=20, pss=300, scope=self.scope_a)
        self.process(20, start=50, pss=50, scope=self.scope_b)
        self.process(30, pss=999, scope=self.scope_a, uid=2000)
        self.cgroup_memory(self.scope_a, 2**30, 700 * 1024)

        rows = self.run_report()
        browser = next(row for row in rows if row['scope'] == self.scope_a)
        self.assertEqual(browser['window_pid'], 10)
        self.assertEqual(browser['window_comm'], 'fixture-app')
        self.assertEqual(browser['window_rss_bytes'], 50 * 4096)
        self.assertEqual(browser['window_pss_bytes'], 100 * 1024)
        self.assertEqual(browser['tree_pss_bytes'], 300 * 1024)
        self.assertEqual(browser['scope_pss_bytes'], 600 * 1024)
        self.assertEqual(browser['cgroup_memory_current_bytes'], 2**30)
        self.assertEqual(browser['cgroup_anon_bytes'], 700 * 1024)
        self.assertEqual(browser['process_count'], 3)
        self.assertEqual(browser['read_failures'], 0)

    def test_unreadable_pss_is_excluded_and_counted(self):
        self.process(10, start=100, pss=100, scope=self.scope_a)
        self.process(11, ppid=10, start=200, pss='unreadable', scope=self.scope_a)

        row = self.run_report()[0]
        self.assertEqual(row['scope_pss_bytes'], 100 * 1024)
        self.assertEqual(row['tree_pss_bytes'], 100 * 1024)
        self.assertEqual(row['process_count'], 2)
        self.assertEqual(row['read_failures'], 1)

    def test_pid_override_and_scope_without_scope(self):
        self.process(10, start=100, pss=100, scope=self.scope_a)
        self.process(11, ppid=10, start=200, pss=200, scope=self.scope_a)
        self.process(30, start=50, pss=50)

        rows = self.run_report(pids=[11, 30])
        child = next(row for row in rows if row['window_pid'] == 11)
        unscoped = next(row for row in rows if row['window_pid'] == 30)
        self.assertEqual(child['tree_pss_bytes'], 200 * 1024)
        self.assertEqual(child['scope_pss_bytes'], 300 * 1024)
        self.assertIsNone(unscoped['scope'])
        self.assertEqual(unscoped['app'], '(scope 없음)')
        self.assertEqual(unscoped['process_count'], 1)

    def test_pid_from_another_uid_is_rejected(self):
        self.process(30, uid=2000, scope=self.scope_a)
        with self.assertRaisesRegex(LookupError, '현재 UID'):
            self.run_report(pids=[30])


if __name__ == '__main__':
    unittest.main()
