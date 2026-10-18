"""Print a small environment report without process lists, paths, or secrets."""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess


UUID = 'matci@local'


def extension_runtime(uuid=UUID):
    if not shutil.which('gnome-extensions'):
        return None, None
    try:
        result = subprocess.run(['gnome-extensions', 'info', uuid], capture_output=True, text=True,
                                timeout=5, env={**os.environ, 'LC_ALL': 'C'})
    except (OSError, subprocess.TimeoutExpired):
        return None, None
    if result.returncode != 0:
        return None, None
    version_match = re.search(r'^\s*Version:\s*(\d+)\s*$', result.stdout, re.M)
    state_match = re.search(r'^\s*State:\s*(\S+)\s*$', result.stdout, re.M)
    return (int(version_match.group(1)) if version_match else None,
            state_match.group(1) if state_match else None)


def worker_processes():
    if not shutil.which('pgrep'):
        return None
    try:
        result = subprocess.run(['pgrep', '-fc', r'python3 -u -m matci'], capture_output=True,
                                text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    try:
        return int(result.stdout.strip() or '0')
    except ValueError:
        return None


def worker_lock_held(state_dir):
    """Read /proc/locks to inspect an existing worker lock without competing for it."""
    lock_path = Path(state_dir) / 'worker.lock'
    try:
        lock_info = lock_path.lstat()
    except FileNotFoundError:
        return False
    except OSError:
        return None
    if not stat.S_ISREG(lock_info.st_mode):
        return None
    try:
        lock_records = Path('/proc/locks').read_text(encoding='ascii')
    except OSError:
        return None
    device = (os.major(lock_info.st_dev), os.minor(lock_info.st_dev), lock_info.st_ino)
    for line in lock_records.splitlines():
        fields = line.split()
        if len(fields) < 6 or fields[1] != 'FLOCK' or fields[3] != 'WRITE':
            continue
        try:
            major, minor, inode = fields[5].split(':')
            if (int(major, 16), int(minor, 16), int(inode, 10)) == device:
                return True
        except ValueError:
            continue
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    data_home = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
    state_dir = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'matci'
    installed = data_home / 'gnome-shell/extensions' / UUID
    update_staging = data_home / 'gnome-shell/extension-updates' / UUID
    installed_version = None
    metadata_path = installed / 'metadata.json'
    if metadata_path.is_file():
        try:
            installed_version = int(json.loads(metadata_path.read_text(encoding='utf-8')).get('version'))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            installed_version = None
    version = None
    if shutil.which('gnome-shell'):
        result = subprocess.run(['gnome-shell', '--version'], capture_output=True, text=True, timeout=5)
        version = result.stdout.strip()[:80] if result.returncode == 0 else None
    running, extension_state = extension_runtime()
    pending_path = state_dir / 'pending-relogin.json'
    version_mismatch = (running is not None and installed_version is not None
                        and running != installed_version and extension_state == 'ACTIVE')
    pending = pending_path.is_file() or update_staging.exists() or version_mismatch
    report = {'os': platform.system(), 'python': platform.python_version(), 'gnome_shell': version,
              'session': os.environ.get('XDG_SESSION_TYPE'),
              'extension_installed': installed.exists(),
              'extension_installed_version': installed_version,
              'gnome_extension_running_version': running,
              'gnome_extension_state': extension_state,
              'pending_relogin': pending,
              'worker_processes': worker_processes(),
              'locked': worker_lock_held(state_dir),
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
