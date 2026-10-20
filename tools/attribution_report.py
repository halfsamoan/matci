"""Read-only comparison of process, tree, and systemd-scope memory attribution."""
import argparse
from collections import defaultdict
import json
import os
from pathlib import Path, PurePosixPath
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from matci.procfs import parse_pss, parse_stat, parse_status_uid, read_text


def app_scope(cgroup_text):
    for line in cgroup_text.splitlines():
        fields = line.split(':', 2)
        if len(fields) != 3:
            continue
        parts = PurePosixPath(fields[2]).parts
        for index, part in enumerate(parts):
            if part.startswith('app-') and part.endswith('.scope'):
                return '/' + '/'.join(parts[1:index + 1])
    return None


def _memory_file(cgroup_root, scope_path, filename):
    if not scope_path:
        return None
    root = Path(cgroup_root).resolve()
    target = (root / scope_path.lstrip('/') / filename).resolve()
    if os.path.commonpath((str(root), str(target))) != str(root):
        return None
    try:
        return read_text(target, 65536)
    except (OSError, ValueError):
        return None


def _cgroup_memory(cgroup_root, scope_path):
    current_text = _memory_file(cgroup_root, scope_path, 'memory.current')
    stat_text = _memory_file(cgroup_root, scope_path, 'memory.stat')
    try:
        current = int(current_text.strip()) if current_text is not None else None
        if current is not None and current < 0:
            current = None
    except ValueError:
        current = None
    anon = None
    if stat_text is not None:
        for line in stat_text.splitlines():
            fields = line.split()
            if len(fields) == 2 and fields[0] == 'anon':
                try:
                    value = int(fields[1])
                    anon = value if value >= 0 else None
                except ValueError:
                    anon = None
                break
    return current, anon


def _read_process(entry, uid):
    try:
        observed_uid = parse_status_uid(read_text(entry / 'status', 65536))
        if observed_uid != uid:
            return None
        stat = parse_stat(read_text(entry / 'stat', 8192))
        if stat['pid'] != int(entry.name):
            return None
    except (FileNotFoundError, ProcessLookupError, PermissionError, OSError, ValueError):
        return None

    try:
        scope_path = app_scope(read_text(entry / 'cgroup', 65536))
    except (FileNotFoundError, ProcessLookupError, OSError, ValueError):
        scope_path = None

    pss = None
    pss_failed = False
    try:
        pss = parse_pss(read_text(entry / 'smaps_rollup'))
    except (FileNotFoundError, ProcessLookupError):
        return None
    except (OSError, ValueError):
        pss_failed = True

    try:
        after = parse_stat(read_text(entry / 'stat', 8192))
        after_uid = parse_status_uid(read_text(entry / 'status', 65536))
    except (FileNotFoundError, ProcessLookupError, PermissionError, OSError, ValueError):
        return None
    if after['start_ticks'] != stat['start_ticks'] or after_uid != uid:
        return None

    return {'pid': stat['pid'], 'ppid': stat['ppid'], 'start_ticks': stat['start_ticks'],
            'comm': stat['comm'], 'scope_path': scope_path,
            'rss_bytes': stat['rss_pages'] * os.sysconf('SC_PAGE_SIZE'),
            'pss_bytes': pss, 'pss_failed': pss_failed}


def _sum_known(processes):
    values = [process['pss_bytes'] for process in processes if process['pss_bytes'] is not None]
    return sum(values) if values else None


def report(proc_root='/proc', cgroup_root='/sys/fs/cgroup', uid=None, pids=None, top=15):
    uid = os.getuid() if uid is None else uid
    proc_root = Path(proc_root)
    processes = []
    try:
        entries = sorted((entry for entry in proc_root.iterdir() if entry.name.isdecimal()),
                         key=lambda entry: int(entry.name))
    except OSError:
        entries = []
    for entry in entries:
        process = _read_process(entry, uid)
        if process is not None:
            processes.append(process)

    by_pid = {process['pid']: process for process in processes}
    if pids:
        missing = [pid for pid in pids if pid not in by_pid]
        if missing:
            raise LookupError('PID가 없거나 현재 UID 소유가 아닙니다')
        selected = [by_pid[pid] for pid in dict.fromkeys(pids)]
    else:
        groups = defaultdict(list)
        for process in processes:
            groups[process['scope_path']].append(process)
        selected = [min(members, key=lambda process: (process['start_ticks'], process['pid']))
                    for members in groups.values()]

    groups = defaultdict(list)
    children = defaultdict(list)
    for process in processes:
        groups[process['scope_path']].append(process)
        children[process['ppid']].append(process['pid'])

    rows = []
    for window in selected:
        members = groups[window['scope_path']]
        tree_ids, pending = {window['pid']}, [window['pid']]
        while pending:
            for child in children.get(pending.pop(), ()):
                if child not in tree_ids:
                    tree_ids.add(child)
                    pending.append(child)
        tree = [process for process in processes if process['pid'] in tree_ids]
        scope_pss = _sum_known(members)
        current, anon = _cgroup_memory(cgroup_root, window['scope_path'])
        label = PurePosixPath(window['scope_path']).name if window['scope_path'] else '(scope 없음)'
        rows.append({'app': label, 'scope': window['scope_path'],
                     'window_pid': window['pid'], 'window_comm': window['comm'],
                     'window_rss_bytes': window['rss_bytes'], 'window_pss_bytes': window['pss_bytes'],
                     'tree_pss_bytes': _sum_known(tree), 'scope_pss_bytes': scope_pss,
                     'cgroup_memory_current_bytes': current, 'cgroup_anon_bytes': anon,
                     'process_count': len(members),
                     'read_failures': sum(process['pss_failed'] for process in members)})
    rows.sort(key=lambda row: (row['tree_pss_bytes'] or 0, row['app']), reverse=True)
    return rows[:top]


def _gb(value):
    return '-' if value is None else f'{value / 2**30:.2f} GB'


def print_table(rows):
    columns = ('앱', '창PID RSS', '창PID PSS', 'PPID 트리 PSS', 'scope PSS 합',
               'cgroup memory.current', 'cgroup anon', '프로세스 수', '읽기 실패 수')
    print(' | '.join(columns))
    for row in rows:
        values = (row['app'], _gb(row['window_rss_bytes']), _gb(row['window_pss_bytes']),
                  _gb(row['tree_pss_bytes']), _gb(row['scope_pss_bytes']),
                  _gb(row['cgroup_memory_current_bytes']), _gb(row['cgroup_anon_bytes']),
                  str(row['process_count']), str(row['read_failures']))
        print(' | '.join(values))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--top', type=int, default=15)
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--pid', type=int, action='append', default=[])
    args = parser.parse_args()
    if args.top < 1 or any(pid <= 0 for pid in args.pid):
        parser.error('--top은 양수여야 하고 --pid는 양의 정수여야 합니다')
    try:
        rows = report(pids=args.pid or None, top=args.top)
    except LookupError as error:
        parser.error(str(error))
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_table(rows)


if __name__ == '__main__':
    main()
