"""Run both extensions in an isolated, watched nested GNOME Shell session."""
import argparse
import filecmp
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

MATCI_ROOT = Path(__file__).resolve().parents[1]
WATCH_DIRS = (
    ('archsport', 'extension'), ('archsport', 'archsport'), ('archsport', 'tests'),
    ('archsport', 'data'), ('archsport', 'web/assets/logos'),
    ('matci', 'extension'), ('matci', 'matci'), ('matci', 'tests'),
    ('matci', 'data'), ('matci', 'migrations'),
)


def run(command, cwd):
    print(f"$ {' '.join(map(str, command))}", flush=True)
    return subprocess.run(command, cwd=cwd, check=False).returncode == 0


def run_checks(matci_root, archsport_root):
    for filename in ('docs/design/design-tokens.json', 'extension/designTokens.js',
                     'extension/notchDock.js', 'extension/dockModel.js', 'extension/notchSurface.js'):
        if not filecmp.cmp(matci_root / filename, archsport_root / filename, shallow=False):
            print(f'공유 dock 파일이 서로 다릅니다: {filename}', file=sys.stderr)
            return False
    print('✓ shared dock files identical', flush=True)
    compiler = shutil.which('glib-compile-schemas')
    node = shutil.which('node')
    npx = shutil.which('npx')
    if not compiler or not node or not npx:
        print('glib-compile-schemas, Node.js, npx가 필요합니다.', file=sys.stderr)
        return False
    checks = (
        ('Archsport Python', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'], archsport_root),
        ('Archsport Node', [node, '--test', 'tests/dock.test.mjs',
                             'tests/fixturePresentation.test.mjs'], archsport_root),
        ('Archsport ESLint', [npx, '--yes', 'eslint@9', '--no-config-lookup', '-c', 'eslint.config.mjs',
                              *map(str, sorted((archsport_root / 'extension').glob('*.js')))], archsport_root),
        ('Archsport schema', [compiler, '--strict', '--dry-run', 'extension/schemas'], archsport_root),
        ('matci Python', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'], matci_root),
        ('matci Node', [node, '--test', 'tests/dock.test.mjs', 'tests/native-actions.test.mjs',
                        'tests/native-worker.integration.test.mjs'], matci_root),
        ('matci ESLint', [npx, '--yes', 'eslint@9', '--no-config-lookup', '-c', 'eslint.config.mjs',
                          *map(str, sorted((matci_root / 'extension').glob('*.js')))], matci_root),
        ('matci schema', [compiler, '--strict', '--dry-run', 'extension/schemas'], matci_root),
    )
    passed = True
    for label, command, cwd in checks:
        ok = run(command, cwd)
        print(f"{'✓' if ok else '✗'} {label}", flush=True)
        passed &= ok
    return passed


def _copy_files(source_root, target_root, suffixes, destination_prefix=''):
    source_root = Path(source_root)
    if source_root.is_symlink():
        raise RuntimeError(f'런타임 디렉터리 symlink를 거부했습니다: {source_root}')
    for source in sorted(source_root.rglob('*')):
        if source.is_symlink():
            raise RuntimeError(f'런타임 소스 symlink를 거부했습니다: {source}')
        if not source.is_file() or source.suffix.lower() not in suffixes:
            continue
        relative = source.relative_to(source_root)
        if '__pycache__' in relative.parts or source.name == 'gschemas.compiled':
            continue
        target = Path(target_root) / destination_prefix / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def _replace_tree(source, target, copy_runtime):
    target = Path(target)
    if target.is_symlink():
        raise RuntimeError(f'dev 확장 경로 symlink를 거부했습니다: {target}')
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    copy_runtime(Path(source), target)
    return target


def stage_extensions(matci_root, archsport_root, data_home):
    dev_root = matci_root / '.dev'
    if dev_root.is_symlink():
        raise RuntimeError(f'격리 개발 경로 symlink를 거부했습니다: {dev_root}')
    dev_root.mkdir(exist_ok=True)
    data_home = Path(data_home)
    if data_home.is_symlink() or not data_home.resolve().is_relative_to(dev_root.resolve()):
        raise RuntimeError('XDG_DATA_HOME은 matci/.dev 내부 경로여야 합니다.')
    data_home = data_home.resolve()
    extension_root = data_home / 'gnome-shell/extensions'
    extension_root.mkdir(parents=True, exist_ok=True)
    if extension_root.is_symlink() or not extension_root.resolve().is_relative_to(data_home):
        raise RuntimeError('개발 확장 경로가 격리된 XDG_DATA_HOME 밖을 가리킵니다.')
    matci_target = extension_root / 'matci@local'
    archsport_target = extension_root / 'archsport@local'
    if not matci_target.is_relative_to(data_home) or not archsport_target.is_relative_to(data_home):
        raise RuntimeError('개발 확장이 격리된 XDG_DATA_HOME 밖을 가리킵니다.')

    def copy_matci(_source, target):
        sys.path.insert(0, str(matci_root / 'tools'))
        try:
            from package_extension import runtime_files
            for source, name in runtime_files(matci_root):
                destination = target / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
        finally:
            sys.path.pop(0)

    def copy_archsport(source, target):
        _copy_files(source / 'extension', target, {'.js', '.json', '.css', '.xml', '.svg'})
        _copy_files(source / 'archsport', target / 'archsport', {'.py'})
        _copy_files(source / 'data', target / 'data', {'.json'})
        _copy_files(source / 'web/assets/logos', target / 'assets/logos', {'.png', '.svg', '.json'})

    _replace_tree(matci_root, matci_target, copy_matci)
    _replace_tree(archsport_root, archsport_target, copy_archsport)
    for target, expected_uuid in ((matci_target, 'matci@local'),
                                  (archsport_target, 'archsport@local')):
        metadata = json.loads((target / 'metadata.json').read_text(encoding='utf-8'))
        if metadata.get('uuid') != expected_uuid:
            raise RuntimeError(f'개발 확장 UUID가 예상과 다릅니다: {target}')
    compiler = shutil.which('glib-compile-schemas')
    if not compiler:
        raise RuntimeError('glib-compile-schemas를 찾을 수 없습니다.')
    for target in (matci_target, archsport_target):
        subprocess.run([compiler, '--strict', str(target / 'schemas')], check=True)
    return extension_root


def _signature(matci_root, archsport_root):
    entries = []
    roots = {'matci': matci_root, 'archsport': archsport_root}
    for project, relative in WATCH_DIRS:
        root = roots[project] / relative
        if not root.exists():
            continue
        paths = [root] if root.is_file() else root.rglob('*')
        for path in paths:
            if path.is_file() and '__pycache__' not in path.parts:
                stat = path.stat()
                entries.append((str(path), stat.st_mtime_ns, stat.st_size))
    return tuple(sorted(entries))


def _session_environment(matci_root, headless=False):
    dev_root = matci_root / '.dev'
    if dev_root.is_symlink():
        raise RuntimeError(f'격리 개발 경로 symlink를 거부했습니다: {dev_root}')
    dev_root.mkdir(exist_ok=True)
    paths = {
        'XDG_DATA_HOME': dev_root / 'data',
        'XDG_CONFIG_HOME': dev_root / 'config',
        'XDG_STATE_HOME': dev_root / 'state',
        'XDG_CACHE_HOME': dev_root / 'cache',
    }
    for path in paths.values():
        if path.is_symlink() or not path.resolve().is_relative_to(dev_root.resolve()):
            raise RuntimeError(f'개발 세션 경로가 .dev 밖을 가리킵니다: {path}')
        path.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment.update({key: str(value) for key, value in paths.items()})
    environment['GSETTINGS_BACKEND'] = 'dconf'
    environment['GNOME_SHELL_SESSION_MODE'] = 'gnome' if headless else environment.get('GNOME_SHELL_SESSION_MODE', 'ubuntu')
    return environment


def _stop_shell(shell):
    if shell and shell.poll() is None:
        shell.terminate()
        try:
            shell.wait(timeout=8)
        except subprocess.TimeoutExpired:
            shell.kill()
            shell.wait()


def _start_shell(environment, headless=False):
    if headless:
        command = ['gnome-shell', '--headless', '--virtual-monitor=1600x900']
    else:
        if not Path('/usr/libexec/mutter-devkit').is_file():
            raise RuntimeError('GNOME 49+ 창 실행에는 mutter-devkit이 필요합니다. Ubuntu 패키지 mutter-dev-bin이 설치되어 있지 않습니다. --headless는 화면 없이 확장 시작만 검사합니다.')
        command = ['gnome-shell', '--wayland', '--devkit']
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions',
                    "['archsport@local', 'matci@local']"], env=environment, check=True)
    shell = subprocess.Popen(command, env=environment)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if shell.poll() is not None:
            raise RuntimeError(f'중첩 GNOME이 준비 전에 종료됐습니다(exit {shell.returncode}).')
        ready = subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
                                '--object-path', '/org/gnome/Shell',
                                '--method', 'org.freedesktop.DBus.Peer.Ping'],
                               env=environment, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, check=False)
        if ready.returncode == 0:
            print('✓ Nested GNOME ready', flush=True)
            return shell
        time.sleep(0.5)
    _stop_shell(shell)
    raise RuntimeError('45초 안에 중첩 GNOME D-Bus가 준비되지 않았습니다.')


def _session(matci_root, archsport_root, headless=False):
    if not shutil.which('gnome-shell') or not shutil.which('gdbus') or not shutil.which('gsettings'):
        raise RuntimeError('gnome-shell, gdbus, gsettings가 필요합니다.')
    environment = _session_environment(matci_root, headless)
    shell = _start_shell(environment, headless)
    last = _signature(matci_root, archsport_root)
    print('Watching files... (메인 세션은 그대로 둡니다)', flush=True)
    try:
        while shell.poll() is None:
            time.sleep(0.75)
            current = _signature(matci_root, archsport_root)
            if current == last:
                continue
            time.sleep(0.5)
            current = _signature(matci_root, archsport_root)
            print('변경 감지 · 전체 테스트와 schema를 확인합니다.', flush=True)
            if not run_checks(matci_root, archsport_root):
                print('검사 실패 · 기존 중첩 화면을 유지합니다.', file=sys.stderr, flush=True)
                last = current
                continue
            extension_root = stage_extensions(matci_root, archsport_root,
                                               environment['XDG_DATA_HOME'])
            print(f'✓ development extensions installed · {extension_root}', flush=True)
            _stop_shell(shell)
            shell = _start_shell(environment, headless)
            last = current
    except KeyboardInterrupt:
        pass
    finally:
        _stop_shell(shell)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archsport-root', type=Path, default=MATCI_ROOT.parent / 'archsport')
    parser.add_argument('--check-only', action='store_true', help='테스트와 schema만 검사')
    parser.add_argument('--prepare-only', action='store_true', help='검사 후 격리된 dev 확장만 설치')
    parser.add_argument('--headless', action='store_true', help='창 없이 두 확장 시작 상태를 검사하고 파일을 감시')
    parser.add_argument('--session', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    matci_root = MATCI_ROOT
    archsport_root = args.archsport_root.resolve()
    if not (matci_root / 'extension/metadata.json').is_file() or not (archsport_root / 'extension/metadata.json').is_file():
        raise SystemExit('matci와 archsport 저장소 경로를 확인하세요.')
    if args.session:
        try:
            return _session(matci_root, archsport_root, args.headless)
        except RuntimeError as error:
            print(f'실행 중단: {error}', file=sys.stderr)
            return 2
    if sys.platform != 'linux' or os.geteuid() == 0:
        raise SystemExit('로그인한 Linux 데스크톱 사용자로 실행하세요.')
    if not run_checks(matci_root, archsport_root):
        raise SystemExit('검사 실패: 중첩 GNOME을 시작하지 않았습니다.')
    if args.check_only:
        return 0
    environment = _session_environment(matci_root, args.headless)
    extension_root = stage_extensions(matci_root, archsport_root, environment['XDG_DATA_HOME'])
    print(f'✓ development extensions installed · {extension_root}', flush=True)
    if args.prepare_only:
        return 0
    command = ['dbus-run-session', '--', sys.executable, str(Path(__file__).resolve()),
               '--session', '--archsport-root', str(archsport_root)]
    if args.headless:
        command.append('--headless')
    try:
        return subprocess.run(command, env=environment, check=False).returncode
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
