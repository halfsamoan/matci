"""Optional hwmon readings must identify CPU sensors without borrowing GPU values."""

from pathlib import Path
import tempfile
import unittest

from matci.hardware import read_hardware


class HardwareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def chip(self, number, name, values):
        directory = self.root / f'hwmon{number}'
        directory.mkdir()
        (directory / 'name').write_text(name)
        for filename, value in values.items():
            (directory / filename).write_text(str(value))

    def test_selects_cpu_temperature_and_cpu_fan_only(self):
        self.chip(0, 'amdgpu', {'temp1_input': 58000, 'fan1_input': 2500,
                                'fan1_label': 'gpu_fan'})
        self.chip(1, 'k10temp', {'temp1_input': 60625, 'temp1_label': 'Tctl',
                                'temp2_input': 56250, 'temp2_label': 'Tdie'})
        self.chip(2, 'asus', {'fan1_input': 3300, 'fan1_label': 'cpu_fan',
                              'fan2_input': 0, 'fan2_label': 'gpu_fan'})
        self.assertEqual(read_hardware(self.root),
                         {'cpu_temperature_c': 56.25, 'cpu_fan_rpm': 3300})

    def test_absent_and_invalid_values_stay_unknown(self):
        self.chip(0, 'acpitz', {'temp1_input': 60000})
        self.chip(1, 'asus', {'fan1_input': -1, 'fan1_label': 'cpu_fan',
                              'fan2_input': 2100, 'fan2_label': 'gpu_fan'})
        self.assertEqual(read_hardware(self.root),
                         {'cpu_temperature_c': None, 'cpu_fan_rpm': None})
        self.assertEqual(read_hardware(self.root / 'missing'),
                         {'cpu_temperature_c': None, 'cpu_fan_rpm': None})

    def test_stopped_cpu_fan_is_zero_not_missing(self):
        self.chip(0, 'coretemp', {'temp1_input': 49000, 'temp1_label': 'Package id 0'})
        self.chip(1, 'asus', {'fan1_input': 0, 'fan1_label': 'CPU Fan'})
        self.assertEqual(read_hardware(self.root),
                         {'cpu_temperature_c': 49.0, 'cpu_fan_rpm': 0})
