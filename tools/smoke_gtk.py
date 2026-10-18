"""Exercise GTK rendering and the popover in isolated Xvfb/memory GSettings."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='matci-gtk-') as temporary:
        subprocess.run(['glib-compile-schemas', '--strict', '--targetdir', temporary,
                        str(root / 'extension/schemas')], check=True)
        environment = dict(os.environ, GSETTINGS_SCHEMA_DIR=temporary, GSETTINGS_BACKEND='memory',
                           GDK_BACKEND='x11', GSK_RENDERER='cairo', G_DEBUG='fatal-criticals')
        command = ['dbus-run-session', '--', 'xvfb-run', '-a', 'gjs', '-m', str(root / 'app/main.js'), '--smoke']
        if args.capture:
            command.append('--capture')
        completed = subprocess.run(command, env=environment, text=True, capture_output=True, timeout=25, check=True)
        result = json.loads(completed.stdout.strip().splitlines()[-1])
        if not result.get('drawn') or not result.get('popover'):
            raise SystemExit('GTK rendering or popover check failed')
        print(json.dumps(result))


if __name__ == '__main__':
    main()
