"""Read optional CPU temperature and CPU fan speed from Linux hwmon."""

from pathlib import Path


CPU_TEMPERATURE_CHIPS = {'k10temp', 'coretemp', 'zenpower'}


def _number(path):
    try:
        return int(path.read_text(encoding='ascii').strip())
    except (OSError, ValueError, UnicodeError):
        return None


def _label(path):
    try:
        return path.read_text(encoding='ascii').strip().lower()
    except (OSError, UnicodeError):
        return ''


def read_hardware(root='/sys/class/hwmon'):
    """Return nulls for absent readings; Tctl is the CPU control temperature."""
    temperature = fan = None
    temperature_priority = 99
    if not Path(root).exists():
        return {'cpu_temperature_c': None, 'cpu_fan_rpm': None}
    try:
        chips = sorted(Path(root).iterdir())
    except OSError:
        chips = []
    for chip in chips:
        name = _label(chip / 'name')
        if name in CPU_TEMPERATURE_CHIPS:
            try:
                inputs = sorted(chip.glob('temp*_input'))
            except OSError:
                inputs = []
            for path in inputs:
                label = _label(path.with_name(path.name.replace('_input', '_label')))
                priority = (0 if label == 'tdie' else 1 if label == 'tctl' else
                            2 if label.startswith('package id') else 3 if label == 'physical id 0' else 99)
                raw = _number(path)
                if priority < temperature_priority and raw is not None and -40000 <= raw <= 125000:
                    temperature, temperature_priority = raw / 1000, priority
        try:
            inputs = sorted(chip.glob('fan*_input'))
        except OSError:
            inputs = []
        for path in inputs:
            label = _label(path.with_name(path.name.replace('_input', '_label')))
            raw = _number(path)
            if fan is None and label.replace('_', ' ').replace('-', ' ') in ('cpu fan', 'processor fan') and \
                    raw is not None and 0 <= raw <= 30000:
                fan = raw
    return {'cpu_temperature_c': temperature, 'cpu_fan_rpm': fan}
