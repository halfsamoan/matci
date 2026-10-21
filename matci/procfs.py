"""Linux /proc collection; races and unavailable values remain explicit."""

from pathlib import Path
import os
import re

from .model import MAX_PROCESSES, monotonic_ms, new_id, utc_now, process_key
from .policy import builtin_process_reason

# Per-sample smaps_rollup reads while the list is open. 48 covers every sizeable process of a
# multi-process browser/Electron tree within the first sample (a full ~150-process pass measured
# 0.57 s); the 30 s cache keeps later samples cheap.
PSS_BUDGET = 48
PSS_TTL_MS = 30000
PSS_FAIL_TTL_MS = 60000


def parse_meminfo(text):
    fields = {}
    for line in text.splitlines():
        match = re.fullmatch(r'(MemTotal|MemAvailable):\s+(\d+)\s+kB\s*', line)
        if match:
            if match[1] in fields:
                raise ValueError('duplicate memory field')
            fields[match[1]] = int(match[2]) * 1024
    total, available = fields.get('MemTotal'), fields.get('MemAvailable')
    if total is None or not 0 < total <= 2 ** 63 - 1 or available is None or not 0 <= available <= total:
        raise ValueError('invalid memory observation')
    return {'total_bytes': total, 'available_bytes': available,
            'used_ratio': (total - available) / total,
            'definition': 'MemTotal minus MemAvailable'}


def parse_pressure(text):
    values = {}
    for line in text.splitlines():
        pieces = line.split()
        if pieces and pieces[0] in ('some', 'full'):
            for piece in pieces[1:]:
                if piece.startswith('avg10='):
                    value = float(piece[6:])
                    if not 0 <= value <= 100:
                        raise ValueError('invalid pressure')
                    values[pieces[0]] = value
    if not values:
        raise ValueError('missing pressure')
    return {'some_avg10': values.get('some'), 'full_avg10': values.get('full'),
            'availability': 'available' if len(values) == 2 else 'partial'}


def parse_stat(text):
    # comm can contain both spaces and parentheses; the final ')' delimits it.
    left, right = text.find('('), text.rfind(')')
    if left < 1 or right <= left:
        raise ValueError('invalid process stat')
    pid = int(text[:left].strip())
    fields = text[right + 1:].split()
    if pid <= 0 or len(fields) < 22:
        raise ValueError('short process stat')
    comm = ''.join(c for c in text[left + 1:right] if c.isprintable()).rsplit('/', 1)[-1][:64] or 'unknown'
    values = {'pid': pid, 'comm': comm, 'ppid': int(fields[1]),
              'cpu_ticks': int(fields[11]) + int(fields[12]),
              'start_ticks': int(fields[19]), 'rss_pages': int(fields[21])}
    if min(values['ppid'], values['cpu_ticks'], values['start_ticks'], values['rss_pages']) < 0:
        raise ValueError('negative process stat')
    return values


def parse_status_uid(text):
    for line in text.splitlines():
        if line.startswith('Uid:'):
            values = line.split()[1:]
            if len(values) != 4 or len(set(values)) != 1:
                raise ValueError('different credential IDs')
            uid = int(values[0])
            if uid < 0:
                break
            return uid
    raise ValueError('missing uid')


def parse_pss(text):
    for line in text.splitlines():
        match = re.fullmatch(r'Pss:\s+(\d+)\s+kB\s*', line)
        if match:
            return int(match[1]) * 1024
    raise ValueError('missing pss')


def read_text(path, limit=128 * 1024):
    with path.open('r', encoding='utf-8', errors='replace') as stream:
        text = stream.read(limit + 1)
    if len(text) > limit:
        raise ValueError('proc file too large')
    return text


class ProcCollector:
    def __init__(self, root='/proc', uid=None, clock=monotonic_ms,
                 page_size=None, clock_ticks=None):
        self.root = Path(root)
        self.uid = os.getuid() if uid is None else uid
        self.clock = clock
        self.page_size = page_size or os.sysconf('SC_PAGE_SIZE')
        self.clock_ticks = clock_ticks or os.sysconf('SC_CLK_TCK')
        self.previous = {}
        self.pss_cache = {}
        self.pss_fail_cache = {}
        self.boot_id = None

    def sample(self, session_id):
        now = self.clock()
        warnings = []
        try:
            memory = parse_meminfo(read_text(self.root / 'meminfo'))
            health = 'ok'
        except (OSError, ValueError):
            memory = {'total_bytes': None, 'available_bytes': None, 'used_ratio': None,
                      'definition': 'MemTotal minus MemAvailable'}
            health = 'error'
            warnings.append('MEMORY_UNAVAILABLE')
        memory.update(observed_monotonic_ms=now if health != 'error' else None,
                      age_ms=0 if health != 'error' else None)
        try:
            pressure = parse_pressure(read_text(self.root / 'pressure/memory'))
        except (OSError, ValueError):
            pressure = {'some_avg10': None, 'full_avg10': None, 'availability': 'unavailable'}
            warnings.append('PSI_UNAVAILABLE')
        try:
            boot_id = read_text(self.root / 'sys/kernel/random/boot_id', 128).strip()
            if not boot_id or len(boot_id) > 64:
                raise ValueError('invalid boot id')
        except (OSError, ValueError):
            boot_id = 'unavailable'
            warnings.append('BOOT_ID_UNAVAILABLE')
        if boot_id != self.boot_id:
            self.previous.clear()
            self.pss_cache.clear()
            self.pss_fail_cache.clear()
            self.boot_id = boot_id
        processes, new_previous, pss_candidates = [], {}, []
        # Executable per process, kept private (never in the snapshot): a busy helper running the
        # same binary as its ancestor is the app's own renderer/content process, not outside work.
        executables = {}
        truncated, inaccessible = False, False
        try:
            entries = sorted((p for p in self.root.iterdir() if p.name.isdecimal()),
                             key=lambda p: int(p.name))
        except OSError:
            entries, inaccessible = [], True
        for entry in entries:
            try:
                uid = parse_status_uid(read_text(entry / 'status', 65536))
                if uid != self.uid:
                    continue
                if len(processes) >= MAX_PROCESSES:
                    truncated = True
                    break
                stat = parse_stat(read_text(entry / 'stat', 8192))
                if stat['pid'] != int(entry.name):
                    raise ValueError('pid mismatch')
                key = (uid, stat['pid'], stat['start_ticks'])
                previous = self.previous.get(key)
                cpu = None
                if previous and now > previous[0] and stat['cpu_ticks'] >= previous[1]:
                    cpu = ((stat['cpu_ticks'] - previous[1]) / self.clock_ticks /
                           ((now - previous[0]) / 1000))
                rss_bytes = stat['rss_pages'] * self.page_size
                kind, amount, metric_time = 'rss', rss_bytes, now
                cached = self.pss_cache.get(key)
                if cached and 0 <= now - cached[0] < PSS_TTL_MS:
                    kind, amount, metric_time = 'pss', cached[1], cached[0]
                else:
                    failed_at = self.pss_fail_cache.get(key)
                    if not (failed_at is not None and 0 <= now - failed_at < PSS_FAIL_TTL_MS):
                        pss_candidates.append((rss_bytes, stat['pid'], key, entry, uid, stat))
                # Recheck identity before accepting the process into this sample.
                after = parse_stat(read_text(entry / 'stat', 8192))
                after_uid = parse_status_uid(read_text(entry / 'status', 65536))
                if after['start_ticks'] != stat['start_ticks']:
                    # The original process exited and its PID was reused.
                    continue
                if after_uid != uid:
                    inaccessible = True
                    continue
                process = {'uid': uid, 'pid': stat['pid'], 'start_ticks': stat['start_ticks'],
                           'ppid': stat['ppid'], 'comm': stat['comm'],
                           'identity_observed_monotonic_ms': now, 'metric_kind': kind,
                           'memory_bytes': amount, 'metric_observed_monotonic_ms': metric_time,
                           'metric_age_ms': now - metric_time, 'coverage': 'complete',
                           'cpu_fraction_one_core': cpu, 'has_work_descendants': False,
                           'protection_reason': builtin_process_reason(stat['comm'])}
                processes.append(process)
                new_previous[key] = (now, stat['cpu_ticks'])
                try:
                    executables[stat['pid']] = os.readlink(entry / 'exe')
                except OSError:
                    executables[stat['pid']] = None
            except (FileNotFoundError, ProcessLookupError):
                # A process that exited during any read cannot own a live descendant.
                continue
            except (OSError, ValueError):
                inaccessible = True

        # Spend the bounded PSS budget on the largest uncached RSS processes.
        selected = sorted(pss_candidates, key=lambda item: (-item[0], item[1]))[:PSS_BUDGET]
        by_key = {process_key(process): process for process in processes}
        for _rss_bytes, _pid, key, entry, uid, original_stat in selected:
            process = by_key.get(key)
            if process is None:
                continue
            try:
                amount = parse_pss(read_text(entry / 'smaps_rollup'))
            except (FileNotFoundError, ProcessLookupError):
                processes.remove(process)
                new_previous.pop(key, None)
                self.pss_cache.pop(key, None)
                self.pss_fail_cache.pop(key, None)
                continue
            except (PermissionError, ValueError):
                # PSS is optional: retain RSS and avoid retrying on every sample.
                self.pss_fail_cache[key] = now
                continue
            except OSError:
                inaccessible = True
                processes.remove(process)
                new_previous.pop(key, None)
                self.pss_cache.pop(key, None)
                self.pss_fail_cache.pop(key, None)
                continue
            try:
                after = parse_stat(read_text(entry / 'stat', 8192))
                after_uid = parse_status_uid(read_text(entry / 'status', 65536))
            except (FileNotFoundError, ProcessLookupError):
                processes.remove(process)
                new_previous.pop(key, None)
                self.pss_cache.pop(key, None)
                self.pss_fail_cache.pop(key, None)
                continue
            except (OSError, ValueError):
                inaccessible = True
                processes.remove(process)
                new_previous.pop(key, None)
                self.pss_cache.pop(key, None)
                self.pss_fail_cache.pop(key, None)
                continue
            if after['start_ticks'] != original_stat['start_ticks']:
                processes.remove(process)
                new_previous.pop(key, None)
                self.pss_cache.pop(key, None)
                self.pss_fail_cache.pop(key, None)
                continue
            if after_uid != uid:
                inaccessible = True
                processes.remove(process)
                new_previous.pop(key, None)
                self.pss_cache.pop(key, None)
                self.pss_fail_cache.pop(key, None)
                continue
            process['metric_kind'] = 'pss'
            process['memory_bytes'] = amount
            process['metric_observed_monotonic_ms'] = now
            process['metric_age_ms'] = 0
            self.pss_cache[key] = (now, amount)
            self.pss_fail_cache.pop(key, None)
        by_pid = {p['pid']: p for p in processes}
        for process in processes:
            protected = bool(process['protection_reason'])
            if protected or (process['cpu_fraction_one_core'] or 0) > 0.02:
                own = executables.get(process['pid'])
                parent, seen = by_pid.get(process['ppid']), set()
                while parent and parent['pid'] not in seen:
                    seen.add(parent['pid'])
                    # Protection always propagates; CPU alone only marks ancestors running a
                    # different (or unknown) executable, so Firefox's busy tab does not lock Firefox.
                    if protected or own is None or executables.get(parent['pid']) != own:
                        parent['has_work_descendants'] = True
                    parent = by_pid.get(parent['ppid'])
        self.previous = new_previous
        self.pss_cache = {key: value for key, value in self.pss_cache.items() if key in new_previous}
        self.pss_fail_cache = {key: value for key, value in self.pss_fail_cache.items() if key in new_previous}
        if inaccessible:
            warnings.append('PROCESS_COVERAGE_PARTIAL')
        if truncated:
            warnings.append('PROCESS_LIMIT')
        if warnings and health == 'ok' and any(w != 'PSI_UNAVAILABLE' for w in warnings):
            health = 'partial'
        return {'schema_version': 1, 'type': 'snapshot', 'mode': 'live',
                'sample_id': new_id(), 'session_id': session_id, 'sampled_at': utc_now(),
                'monotonic_ms': now, 'boot_id': boot_id, 'health': health, 'memory': memory,
                'pressure': pressure, 'processes': processes, 'warnings': warnings,
                'truncated': truncated}

    def sample_light(self, session_id):
        """Read system memory signals only; do not enumerate /proc processes."""
        now = self.clock()
        warnings = []
        try:
            memory = parse_meminfo(read_text(self.root / 'meminfo'))
            health = 'ok'
        except (OSError, ValueError):
            memory = {'total_bytes': None, 'available_bytes': None, 'used_ratio': None,
                      'definition': 'MemTotal minus MemAvailable'}
            health = 'error'
            warnings.append('MEMORY_UNAVAILABLE')
        memory.update(observed_monotonic_ms=now if health != 'error' else None,
                      age_ms=0 if health != 'error' else None)
        try:
            pressure = parse_pressure(read_text(self.root / 'pressure/memory'))
        except (OSError, ValueError):
            pressure = {'some_avg10': None, 'full_avg10': None, 'availability': 'unavailable'}
            warnings.append('PSI_UNAVAILABLE')
        try:
            boot_id = read_text(self.root / 'sys/kernel/random/boot_id', 128).strip()
            if not boot_id or len(boot_id) > 64:
                raise ValueError('invalid boot id')
        except (OSError, ValueError):
            boot_id = 'unavailable'
            warnings.append('BOOT_ID_UNAVAILABLE')
        if boot_id != self.boot_id:
            self.previous.clear()
            self.pss_cache.clear()
            self.pss_fail_cache.clear()
            self.boot_id = boot_id
        warnings.append('PROCESS_DETAIL_PAUSED')
        if health == 'ok' and any(warning != 'PSI_UNAVAILABLE' for warning in warnings):
            health = 'partial'
        return {'schema_version': 1, 'type': 'snapshot', 'mode': 'live',
                'sample_id': new_id(), 'session_id': session_id, 'sampled_at': utc_now(),
                'monotonic_ms': now, 'boot_id': boot_id, 'health': health, 'memory': memory,
                'pressure': pressure, 'processes': [], 'warnings': warnings, 'truncated': False}
