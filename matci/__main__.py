"""python3 -m matci --watch: bounded stdio protocol, no external service."""

import argparse
import json
import math
import queue
import sqlite3
import sys
import threading
import time
from pathlib import Path

from .demo import DemoCollector
from .model import MAX_LINE_BYTES
from .store import Store, WorkerLocked, current_uid
from .worker import Worker


def emit(message):
    print(json.dumps(message, ensure_ascii=True, allow_nan=False, separators=(',', ':')), flush=True)


def extension_version():
    package_root = Path(__file__).resolve().parents[1]
    candidates = (package_root / 'metadata.json', package_root / 'extension' / 'metadata.json')
    for path in candidates:
        try:
            value = json.loads(path.read_text(encoding='utf-8')).get('version')
            if isinstance(value, int) and value > 0:
                return value
        except (OSError, ValueError, TypeError):
            continue
    return None


def read_commands(stream, messages):
    try:
        while True:
            line = stream.readline(MAX_LINE_BYTES + 1)
            if not line:
                break
            if len(line) > MAX_LINE_BYTES:
                while line and not line.endswith(b'\n'):
                    line = stream.readline(MAX_LINE_BYTES + 1)
                messages.put(False)
            elif line.strip():
                messages.put(line)
    finally:
        messages.put(None)


def periodic_sample(worker):
    try:
        return worker.sample()
    except (OSError, ValueError, OverflowError, sqlite3.Error):
        # The Shell already accepts this generic observation/storage error code.
        return worker.error('STORAGE_OR_OBSERVATION_ERROR')


def main(argv=None):
    parser = argparse.ArgumentParser(description='matci local memory observer (no app control)')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--once', action='store_true', help='write one snapshot and exit (default)')
    group.add_argument('--watch', action='store_true', help='sample periodically and accept bounded stdin JSONL')
    parser.add_argument('--mode', choices=('live', 'demo'), default='live')
    parser.add_argument('--interval', type=float, default=5.0)
    parser.add_argument('--state-dir')
    parser.add_argument('--ui-version', type=int)
    parser.add_argument('--replay', help='explicit synthetic JSON replay; always demo mode')
    args = parser.parse_args(argv)
    if not math.isfinite(args.interval) or not 1 <= args.interval <= 3600:
        parser.error('--interval must be between 1 and 3600 seconds')
    mode = 'demo' if args.replay else args.mode
    if mode == 'live' and not sys.platform.startswith('linux'):
        emit({'schema_version': 1, 'type': 'error', 'code': 'LIVE_REQUIRES_LINUX'})
        return 2
    store = None
    try:
        uid = current_uid()
        if mode == 'demo':
            collector = DemoCollector(uid, args.replay)
        else:
            from .procfs import ProcCollector
            collector = ProcCollector(uid=uid)
        store = Store(args.state_dir, uid)
        package_version = extension_version()
        version_mismatch = args.ui_version is not None and package_version is not None and args.ui_version != package_version
        worker = Worker(collector, store, mode)
        if version_mismatch:
            emit({'schema_version': 1, 'type': 'error', 'code': 'UI_VERSION_MISMATCH'})
        emit(worker.sample())
        if not args.watch:
            return 0
        messages = queue.Queue(maxsize=32)
        reader = threading.Thread(target=read_commands, args=(sys.stdin.buffer, messages), daemon=True)
        reader.start()
        next_sample = time.monotonic() + args.interval
        while True:
            try:
                line = messages.get(timeout=max(0, next_sample - time.monotonic()))
                if line is None:
                    break
                emit(worker.error('MESSAGE_TOO_LARGE') if line is False else worker.handle_line(line))
                if time.monotonic() >= next_sample:
                    emit(periodic_sample(worker))
                    next_sample = time.monotonic() + args.interval
            except queue.Empty:
                emit(periodic_sample(worker))
                next_sample = time.monotonic() + args.interval
    except KeyboardInterrupt:
        return 0
    except BrokenPipeError:
        return 0
    except WorkerLocked:
        emit({'schema_version': 1, 'type': 'error', 'code': 'WORKER_ALREADY_RUNNING'})
        return 3
    except (OSError, ValueError, OverflowError, sqlite3.Error):
        # Never echo paths, command data, exception text, or user process names.
        emit({'schema_version': 1, 'type': 'error', 'code': 'WORKER_INITIALIZATION_OR_STORAGE_ERROR'})
        return 1
    finally:
        if store is not None:
            store.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
