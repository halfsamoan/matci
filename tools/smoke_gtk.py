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
    parser.add_argument('--size', default='900x720', help='Logical GTK size, e.g. 480x720')
    parser.add_argument('--resize', help='Resize the mapped window to this logical size')
    parser.add_argument('--states', action='store_true', help='Render synthetic checkbox selected/focus/hover states')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='matci-gtk-') as temporary:
        subprocess.run(['glib-compile-schemas', '--strict', '--targetdir', temporary,
                        str(root / 'extension/schemas')], check=True)
        environment = dict(os.environ, GSETTINGS_SCHEMA_DIR=temporary, GSETTINGS_BACKEND='memory',
                           GDK_BACKEND='x11', GSK_RENDERER='cairo', G_DEBUG='fatal-criticals')
        width, height = map(int, args.size.split('x'))
        if not (360 <= width <= 1600 and 480 <= height <= 1200):
            raise SystemExit('Unsupported smoke size')
        command = ['dbus-run-session', '--', 'xvfb-run', '-a', 'gjs', '-m', str(root / 'app/main.js'), '--smoke', f'--size={args.size}']
        if args.resize:
            width,height=map(int,args.resize.split('x'))
            if not (360 <= width <= 1600 and 480 <= height <= 1200):
                raise SystemExit('Unsupported resize size')
            command.append(f'--resize={args.resize}')
        if args.states:
            command.append('--states')
        if args.capture:
            command.append('--capture')
        completed = subprocess.run(command, env=environment, text=True, capture_output=True, timeout=25, check=True)
        result = json.loads(completed.stdout.strip().splitlines()[-1])
        if not result.get('drawn') or not result.get('popover') or not result.get('action_visible') or not result.get('row_states'):
            raise SystemExit('GTK rendering, popover or fixed action check failed')
        if result['width'] > width + 2 or result['height'] > height + 2:
            raise SystemExit(f'GTK minimum size prevented requested resize: {result}')
        print(json.dumps(result))


if __name__ == '__main__':
    main()
