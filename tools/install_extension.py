"""Stage, compile, install or roll back matci for the current GNOME user."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from package_extension import runtime_files

UUID = 'matci@local'


def verify_identity(path):
    if path.is_symlink() or not path.is_dir():
        raise ValueError('Unexpected extension location')
    if json.loads((path / 'metadata.json').read_text(encoding='utf-8')).get('uuid') != UUID:
        raise ValueError('Refusing to replace a different extension')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--upgrade', action='store_true')
    group.add_argument('--rollback', action='store_true', help='Restore the most recent matci backup')
    args = parser.parse_args()
    if sys.platform != 'linux' or 'GNOME' not in os.environ.get('XDG_CURRENT_DESKTOP', '').upper():
        raise SystemExit('Ubuntu GNOME 사용자 세션에서 실행하세요. Windows에서는 web 프리뷰를 사용하세요.')
    if os.geteuid() == 0:
        raise SystemExit('sudo 없이 로그인한 데스크톱 사용자로 실행하세요.')
    compiler = shutil.which('glib-compile-schemas')
    if not compiler:
        raise SystemExit('glib-compile-schemas가 필요합니다: sudo apt install libglib2.0-bin')
    parent = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'gnome-shell/extensions'
    parent.mkdir(parents=True, exist_ok=True)
    target = parent / UUID
    if target.is_symlink() or target.resolve().parent != parent.resolve():
        raise SystemExit('예상하지 않은 설치 경로입니다. 기존 파일을 보존했습니다.')
    if target.exists():
        verify_identity(target)
        if not args.upgrade and not args.rollback:
            raise SystemExit('기존 설치를 보존했습니다. 업데이트는 --upgrade를 사용하세요.')
    backups = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'matci/backups'
    restore = None
    if args.rollback:
        candidates = sorted(backups.glob('extension-*')) if backups.exists() else []
        if not candidates:
            raise SystemExit('복구할 백업이 없습니다.')
        restore = candidates[-1]
        verify_identity(restore)
    staging = Path(tempfile.mkdtemp(prefix='.matci-stage-', dir=parent))
    if restore:
        shutil.copytree(restore, staging, dirs_exist_ok=True)
    else:
        for source, name in runtime_files(Path(__file__).resolve().parents[1]):
            destination = staging / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    verify_identity(staging)
    subprocess.run([compiler, '--strict', str(staging / 'schemas')], check=True)
    parked = None
    if target.exists():
        subprocess.run(['gnome-extensions', 'disable', UUID], check=False)
        backups.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = backups / datetime.now(timezone.utc).strftime('extension-%Y%m%d-%H%M%S-%f')
        shutil.copytree(target, backup)
        # Keep an in-place previous checkout too, so a failed rename is recoverable.
        parked = parent / f'.matci-previous-{backup.name}'
        target.rename(parked)
        print(f'이전 버전 백업: {backup}')
    try:
        staging.rename(target)
    except OSError:
        if parked and not target.exists():
            parked.rename(target)
        raise
    print(f'설치됨: {target}')
    print('로그아웃·로그인 후 gnome-extensions enable matci@local')
    print('설정창: gnome-extensions prefs matci@local')
    print('Archsport도 최신 dual-notch 버전으로 업데이트하면 두 섬이 함께 배치됩니다.')


if __name__ == '__main__':
    main()
