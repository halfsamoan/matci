"""Print a small environment report without process lists, paths, or secrets."""
import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    version = None
    if shutil.which('gnome-shell'):
        result = subprocess.run(['gnome-shell', '--version'], capture_output=True, text=True, timeout=5)
        version = result.stdout.strip()[:80] if result.returncode == 0 else None
    report = {'os': platform.system(), 'python': platform.python_version(), 'gnome_shell': version,
              'session': os.environ.get('XDG_SESSION_TYPE'),
              'schema_compiler': shutil.which('glib-compile-schemas') is not None,
              'proc_meminfo': Path('/proc/meminfo').is_file(),
              'psi_memory': Path('/proc/pressure/memory').is_file(),
              'target_runtime_verified': False}
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        args.output.write_text(output + '\n', encoding='utf-8')
        args.output.chmod(0o600)
    print(output)


if __name__ == '__main__':
    main()
