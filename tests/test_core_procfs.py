from pathlib import Path
import tempfile
import unittest

from matci.policy import aggregate, classify
from matci.procfs import ProcCollector, parse_meminfo, parse_pressure, parse_stat, parse_status_uid


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
                                       page_size=4096, clock_ticks=100)

    def process(self, pid=10, uid=1000, comm='chrome', ppid=1, ticks=100, start=200, pss=True):
        directory = self.root / str(pid)
        directory.mkdir(exist_ok=True)
        (directory / 'status').write_text(f'Uid:\t{uid}\t{uid}\t{uid}\t{uid}\n')
        (directory / 'stat').write_text(stat_line(pid, comm, ppid, ticks, start))
        if pss:
            (directory / 'smaps_rollup').write_text('Pss: 123 kB\n')
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
        (directory / 'smaps_rollup').unlink()
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

    def test_disappearing_process_is_partial_not_empty_ok(self):
        directory = self.process()
        (directory / 'stat').unlink()
        sample = self.sample()
        self.assertEqual(sample['health'], 'partial')
        self.assertIn('PROCESS_COVERAGE_PARTIAL', sample['warnings'])

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
        self.assertEqual(sum(p['metric_kind'] == 'pss' for p in sample['processes']), 20)


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

    def test_builtin_cannot_be_unset_or_unknown_mapped(self):
        process = {'comm': 'chrome', 'cpu_fraction_one_core': 0, 'has_work_descendants': False}
        self.assertEqual(classify('code.desktop', [process], requested_classification='candidate')[0], 'protected')
        self.assertEqual(classify('org.gnome.Terminal.desktop', [], mapped=False)[0], 'protected')
        self.assertEqual(classify('unknown.desktop', [], mapped=False)[0], 'unknown')
        process['comm'] = 'python3.12'
        self.assertEqual(classify('not-editor.desktop', [process], requested_classification='candidate')[0], 'protected')


if __name__ == '__main__':
    unittest.main()
