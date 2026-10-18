import unittest

from matci.procfs import parse_meminfo


class MemoryContractTests(unittest.TestCase):
    def test_zero_available_is_valid(self):
        memory = parse_meminfo('MemTotal: 100 kB\nMemAvailable: 0 kB\n')
        self.assertEqual(memory['available_bytes'], 0)
        self.assertEqual(memory['used_ratio'], 1.0)


if __name__ == '__main__':
    unittest.main()
