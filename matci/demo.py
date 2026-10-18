"""Explicit synthetic replay. It never instantiates the Linux collector."""

import copy
import json
import math
from pathlib import Path

from .model import MAX_PROCESSES, integer, monotonic_ms, new_id, utc_now, valid_text
from .policy import builtin_process_reason


def load_replay(path):
    path = Path(path)
    if path.stat().st_size > 1024 * 1024:
        raise ValueError('REPLAY_TOO_LARGE')
    with path.open('r', encoding='utf-8') as stream:
        frames = json.load(stream)
    if isinstance(frames, dict):
        frames = [frames]
    if not isinstance(frames, list) or not 1 <= len(frames) <= 100:
        raise ValueError('INVALID_REPLAY')
    result = []
    for frame in frames:
        memory = frame.get('memory', {}) if isinstance(frame, dict) else {}
        total, available = memory.get('total_bytes'), memory.get('available_bytes')
        if not integer(total, 1) or not integer(available) or available > total or total > 2 ** 63 - 1:
            raise ValueError('INVALID_REPLAY_MEMORY')
        processes = frame.get('processes')
        if not isinstance(processes, list) or len(processes) > MAX_PROCESSES:
            raise ValueError('INVALID_REPLAY_PROCESSES')
        clean = []
        seen = set()
        for process in processes:
            if not isinstance(process, dict):
                raise ValueError('INVALID_REPLAY_PROCESS')
            pid, start = process.get('pid'), process.get('start_ticks')
            amount, kind = process.get('memory_bytes'), process.get('metric_kind')
            cpu = process.get('cpu_fraction_one_core')
            if not integer(pid, 1) or not integer(start, 1) or (pid, start) in seen:
                raise ValueError('INVALID_REPLAY_IDENTITY')
            seen.add((pid, start))
            if kind not in ('pss', 'rss', 'unavailable'):
                raise ValueError('INVALID_REPLAY_METRIC')
            if (kind == 'unavailable' and amount is not None) or (kind != 'unavailable' and not integer(amount)):
                raise ValueError('INVALID_REPLAY_METRIC')
            if amount is not None and amount > 2 ** 63 - 1:
                raise ValueError('INVALID_REPLAY_METRIC')
            if cpu is not None and (isinstance(cpu, bool) or not isinstance(cpu, (int, float)) or not math.isfinite(cpu) or cpu < 0):
                raise ValueError('INVALID_REPLAY_CPU')
            comm = process.get('comm', 'synthetic')
            if not valid_text(comm, 64):
                raise ValueError('INVALID_REPLAY_COMM')
            app_id = process.get('demo_app_id', 'synthetic.desktop')
            if not valid_text(app_id, 128):
                raise ValueError('INVALID_REPLAY_APP')
            clean.append({'pid': pid, 'start_ticks': start, 'ppid': 0, 'comm': comm,
                          'metric_kind': kind, 'memory_bytes': amount,
                          'coverage': 'unavailable' if kind == 'unavailable' else 'complete',
                          'cpu_fraction_one_core': cpu, 'has_work_descendants': False,
                          'protection_reason': builtin_process_reason(comm), 'demo_app_id': app_id})
        result.append({'memory': {'total_bytes': total, 'available_bytes': available,
                                 'used_ratio': (total - available) / total,
                                 'definition': 'MemTotal minus MemAvailable'}, 'processes': clean})
    return result


class DemoCollector:
    def __init__(self, uid, replay=None):
        path = replay or Path(__file__).resolve().parent.parent / 'data/demo-snapshots.json'
        self.frames = load_replay(path)
        self.uid = uid
        self.index = 0

    def sample(self, session_id):
        now = monotonic_ms()
        frame = copy.deepcopy(self.frames[self.index % len(self.frames)])
        self.index += 1
        frame['memory'].update(observed_monotonic_ms=now, age_ms=0)
        for process in frame['processes']:
            process.update(uid=self.uid, identity_observed_monotonic_ms=now,
                           metric_observed_monotonic_ms=now if process['memory_bytes'] is not None else None,
                           metric_age_ms=0 if process['memory_bytes'] is not None else None)
        frame.update(schema_version=1, type='snapshot', mode='demo', sample_id=new_id(),
                     session_id=session_id, sampled_at=utc_now(), monotonic_ms=now,
                     boot_id='synthetic-boot-only', health='ok',
                     pressure={'some_avg10': None, 'full_avg10': None, 'availability': 'unavailable'},
                     warnings=['SYNTHETIC_DATA', 'PSI_UNAVAILABLE'], truncated=False)
        return frame
