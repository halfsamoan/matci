"""Stage, compile, install or roll back matci for the current GNOME user."""
import argparse
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from package_extension import runtime_files

UUID = 'matci@local'


def updates_supported(gsettings_output=None, desktop_paths=None, *, gsettings_command=None):
    """Return whether GNOME can apply extension-updates on the next Shell init."""
    if gsettings_output is None:
        command = gsettings_command or shutil.which('gsettings')
        if not command:
            return False
        try:
            result = subprocess.run([command, 'get', 'org.gnome.shell', 'allow-extension-installation'],
                                    text=True, capture_output=True, timeout=5, check=False,
                                    env={**os.environ, 'LC_ALL': 'C'})
        except (OSError, subprocess.TimeoutExpired):
            return False
        if result.returncode != 0:
            return False
        gsettings_output = result.stdout
    if str(gsettings_output).strip().lower() != 'true':
        return False
    if desktop_paths is None:
        candidates = [Path('/usr/share/applications/org.gnome.Extensions.desktop')]
        for base in [Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')),
                     *(Path(item) for item in os.environ.get('XDG_DATA_DIRS', '/usr/local/share:/usr/share').split(':') if item)]:
            candidates.extend(base / 'applications' / name for name in (
                'org.gnome.Extensions.desktop', 'com.mattjakeman.ExtensionManager.desktop'))
        desktop_paths = candidates
    return any(Path(path).is_file() for path in desktop_paths)


def choose_install_path(existing, *, upgrade=False, direct=False, supported=False, rollback=False):
    if not existing:
        return 'initial'
    if rollback or direct:
        return 'direct'
    if upgrade and supported:
        return 'staged'
    if upgrade:
        return 'direct'
    return 'refuse'


def running_version(uuid=UUID, *, command=None):
    """Read the Shell's cached extension version and state without exposing user data."""
    executable = command or shutil.which('gnome-extensions')
    if not executable:
        return None, None
    try:
        result = subprocess.run([executable, 'info', uuid], text=True, capture_output=True,
                                timeout=5, check=False, env={**os.environ, 'LC_ALL': 'C'})
    except (OSError, subprocess.TimeoutExpired):
        return None, None
    if result.returncode != 0:
        return None, None
    version = re.search(r'^\s*Version:\s*(\d+)\s*$', result.stdout, re.M)
    state = re.search(r'^\s*State:\s*(\S+)\s*$', result.stdout, re.M)
    return (int(version.group(1)) if version else None,
            state.group(1) if state else None)


def replace_direct(staging, target, parked, parked_destination):
    """Swap a direct install without racing GNOME's disable/enable lifecycle."""
    if target.exists():
        target.rename(parked)
    try:
        staging.rename(target)
    except OSError:
        if parked and parked.exists() and not target.exists():
            parked.rename(target)
        raise
    if parked:
        parked.rename(parked_destination)


def write_pending_relogin(state_dir, installed, running):
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_dir.chmod(0o700)
    path = state_dir / 'pending-relogin.json'
    path.write_text(json.dumps({'installed': installed, 'running': running,
                                'session': os.environ.get('XDG_SESSION_TYPE', ''),
                                'at': datetime.now(timezone.utc).isoformat()}, indent=2) + '\n',
                    encoding='utf-8')
    path.chmod(0o600)
    return path


def verify_identity(path):
    if path.is_symlink() or not path.is_dir():
        raise ValueError('Unexpected extension location')
    if json.loads((path / 'metadata.json').read_text(encoding='utf-8')).get('uuid') != UUID:
        raise ValueError('Refusing to replace a different extension')


def prepare_staging(source, parent, compiler, restore=None):
    staging = Path(tempfile.mkdtemp(prefix='.matci-stage-', dir=parent))
    try:
        if restore:
            shutil.copytree(restore, staging, dirs_exist_ok=True)
        else:
            for source_file, name in runtime_files(source):
                destination = staging / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, destination)
        verify_identity(staging)
        subprocess.run([compiler, '--strict', str(staging / 'schemas')], check=True)
        return staging
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def prune_backups(backups, keep=5):
    candidates = sorted((path for path in Path(backups).glob('extension-*')
                         if path.is_dir() and not path.is_symlink()), key=lambda path: path.name)
    for obsolete in candidates[:-keep]:
        shutil.rmtree(obsolete)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--upgrade', action='store_true')
    group.add_argument('--rollback', action='store_true', help='Restore the most recent matci backup')
    parser.add_argument('--direct', action='store_true', help='Replace the installed files now; a Shell relogin/restart may still be required')
    args = parser.parse_args()
    if args.direct and args.rollback:
        raise SystemExit('--direct와 --rollback은 함께 사용할 수 없습니다.')
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
    updates_root = parent.parent / 'extension-updates'
    update_target = updates_root / UUID
    if target.is_symlink() or target.resolve().parent != parent.resolve():
        raise SystemExit('예상하지 않은 설치 경로입니다. 기존 파일을 보존했습니다.')
    if target.exists():
        verify_identity(target)
        if not (args.upgrade or args.rollback or args.direct):
            raise SystemExit('기존 설치를 보존했습니다. 업데이트는 --upgrade를 사용하세요.')
    backups = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'matci/backups'
    restore = None
    if args.rollback:
        candidates = sorted(backups.glob('extension-*')) if backups.exists() else []
        if not candidates:
            raise SystemExit('복구할 백업이 없습니다.')
        restore = candidates[-1]
        verify_identity(restore)
    source = Path(__file__).resolve().parents[1]
    staging = prepare_staging(source, parent, compiler, restore)
    parked = None
    backup = None
    if target.exists():
        backups.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = backups / datetime.now(timezone.utc).strftime('extension-%Y%m%d-%H%M%S-%f')
        shutil.copytree(target, backup)
        prune_backups(backups)
        print(f'이전 버전 백업: {backup}')
    update_support = updates_supported() if target.exists() and args.upgrade and not args.direct else False
    strategy = choose_install_path(target.exists(), upgrade=args.upgrade, direct=args.direct,
                                   supported=update_support, rollback=args.rollback)
    can_stage = strategy == 'staged'
    if can_stage:
        updates_root.mkdir(parents=True, exist_ok=True)
        replaced = update_target.exists()
        if update_target.is_symlink():
            raise SystemExit(f'기존 대기 업데이트가 심볼릭 링크입니다. 보존했습니다: {update_target}')
        if replaced:
            shutil.rmtree(update_target)
        staging.rename(update_target)
        print(f'다음 로그인 때 자동 적용: {update_target}')
        if replaced:
            print('이전 대기 스테이징을 교체했습니다.')
        destination = update_target
    else:
        if update_target.is_symlink():
            raise SystemExit(f'기존 대기 업데이트가 심볼릭 링크입니다. 보존했습니다: {update_target}')
        if update_target.exists():
            shutil.rmtree(update_target)
            print('기존 대기 업데이트를 제거했습니다.')
        if target.exists():
            # Keep an in-place previous checkout too, so a failed rename is recoverable.
            parked = parent / f'.matci-previous-{backup.name if backup else "rollback"}'
        parked_destination = backups / f'parked-{backup.name if backup else "rollback"}'
        replace_direct(staging, target, parked, parked_destination)
        destination = target
        if args.direct or args.rollback or (args.upgrade and not update_support):
            print('직접 교체했습니다. GNOME이 이전 모듈을 캐시했을 수 있습니다. 로그아웃·로그인하세요.')
    metadata = json.loads((destination / 'metadata.json').read_text(encoding='utf-8'))
    installed_version = int(metadata['version'])
    current_version, current_state = running_version()
    state_dir = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'matci'
    if can_stage or (current_version is not None and current_version != installed_version):
        pending = write_pending_relogin(state_dir, installed_version, current_version)
        running_text = f'v{current_version}' if current_version is not None else '확인 불가'
        print(f'현재 세션은 {running_text} 유지, 설치 버전은 v{installed_version}입니다. 로그아웃·로그인 후 적용됩니다. ({current_state or "상태 확인 불가"})')
        if can_stage:
            print('Wayland: 로그아웃·로그인 / X11: Alt+F2 r 가능')
        print(f'재로그인 대기 정보: {pending}')
    print(f'설치됨: {destination}')
    if not can_stage and not target.exists():
        print('새 확장을 설치했습니다. 필요하면 로그인 후 gnome-extensions enable matci@local')
    print('설정창: gnome-extensions prefs matci@local')
    print('Archsport도 최신 dual-notch 버전으로 업데이트하면 두 섬이 함께 배치됩니다.')


if __name__ == '__main__':
    main()
