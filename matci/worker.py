"""Versioned JSONL worker. Commands can record observations, never execute actions."""

from collections import OrderedDict
import json
import re
import sqlite3
import zlib

from .model import (MAX_APPS, MAX_PROCESSES, MAX_LINE_BYTES, integer, monotonic_ms, new_id,
                    process_key, valid_id)
from .policy import aggregate_members, classify, tree_members

STATUSES = frozenset({'requested', 'observing', 'completed', 'partial', 'cancelled', 'timeout', 'rejected'})
RESULTS = frozenset({'requested', 'window_closed', 'still_running', 'cancelled', 'timeout', 'rejected'})
CLASSES = frozenset({'protected', 'active', 'candidate', 'unknown'})
TERMINAL = STATUSES - {'requested', 'observing'}


class ProtocolError(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise ProtocolError(code)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProtocolError('DUPLICATE_FIELD')
        result[key] = value
    return result


def decode_line(line):
    require(len(line) <= MAX_LINE_BYTES, 'MESSAGE_TOO_LARGE')
    try:
        message = json.loads(line, object_pairs_hook=_unique_object,
                             parse_constant=lambda value: (_ for _ in ()).throw(ProtocolError('INVALID_JSON')))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ProtocolError('INVALID_JSON') from error
    require(isinstance(message, dict), 'OBJECT_REQUIRED')
    return message


def valid_reason(value):
    return isinstance(value, str) and re.fullmatch('[A-Z][A-Z0-9_]{0,63}', value) is not None


class Worker:
    def __init__(self, collector, store, mode, clock=monotonic_ms):
        self.collector, self.store, self.mode, self.clock = collector, store, mode, clock
        self.session_id = new_id()
        self.samples = OrderedDict()
        self.requests = OrderedDict()
        self.views = {}
        self.last_sample_request = None
        self.detail = True
        self.next_sample_delay = None

    @property
    def current_sample(self):
        return next(reversed(self.samples.values())) if self.samples else None

    def sample(self, request_id=None):
        if self.detail:
            snapshot = self.collector.sample(self.session_id)
        else:
            sample_light = getattr(self.collector, 'sample_light', None)
            snapshot = sample_light(self.session_id) if callable(sample_light) else self.collector.sample(self.session_id)
            snapshot = dict(snapshot)
            snapshot['processes'] = []
            snapshot['truncated'] = False
            warnings = list(snapshot.get('warnings', []))
            if 'PROCESS_DETAIL_PAUSED' not in warnings:
                warnings.append('PROCESS_DETAIL_PAUSED')
            snapshot['warnings'] = warnings
            if snapshot.get('health') == 'ok':
                snapshot['health'] = 'partial'
        require(snapshot['mode'] == self.mode, 'COLLECTOR_MODE_MISMATCH')
        previous = self.current_sample
        if previous is not None:
            # Only the current sample's processes/view are ever read; receipts need its scalars.
            self.samples[previous['sample_id']] = {k: v for k, v in previous.items() if k != 'processes'}
            self.views.pop(previous['sample_id'], None)
        self.samples[snapshot['sample_id']] = snapshot
        if len(self.samples) > 128:
            removed, _ = self.samples.popitem(last=False)
            self.views.pop(removed, None)
        result = dict(snapshot)
        if request_id is not None:
            result['request_id'] = request_id
        return result

    def error(self, code, message=None):
        result = {'schema_version': 1, 'type': 'error', 'session_id': self.session_id, 'code': code}
        if isinstance(message, dict) and valid_id(message.get('request_id')):
            result['request_id'] = message['request_id']
        return result

    def handle_line(self, line):
        message = None
        try:
            message = decode_line(line)
            return self.handle(message)
        except ProtocolError as error:
            return self.error(str(error), message)
        except (TypeError, KeyError, OverflowError, RecursionError):
            return self.error('INVALID_MESSAGE', message)
        except (OSError, ValueError, sqlite3.Error):
            return self.error('STORAGE_OR_OBSERVATION_ERROR', message)

    def handle(self, message):
        require(type(message.get('schema_version')) is int and message['schema_version'] == 1, 'SCHEMA_VERSION')
        request_id = message.get('request_id')
        require(valid_id(request_id), 'REQUEST_ID')
        require(message.get('session_id') == self.session_id, 'SESSION_MISMATCH')
        kind = message.get('type')
        require(kind in ('sample_now', 'set_detail', 'record_app_view', 'record_receipt'), 'COMMAND_NOT_SUPPORTED')
        import hashlib  # Lazy: OpenSSL-backed hashlib adds ~4 MB RSS before any request arrives.
        fingerprint = hashlib.sha256(json.dumps(message, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
        if request_id in self.requests:
            old_fingerprint, response = self.requests[request_id]
            require(old_fingerprint == fingerprint, 'REQUEST_ID_REUSED')
            return json.loads(zlib.decompress(response))
        if kind == 'sample_now':
            require(set(message) <= {'schema_version', 'type', 'request_id', 'session_id'}, 'UNKNOWN_FIELD')
            now = self.clock()
            require(self.last_sample_request is None or now - self.last_sample_request >= 250, 'RATE_LIMITED')
            response = self.sample(request_id)
            self.last_sample_request = now
        elif kind == 'set_detail':
            require(set(message) <= {'schema_version', 'type', 'request_id', 'session_id', 'detail'}, 'UNKNOWN_FIELD')
            detail = message.get('detail')
            require(type(detail) is bool, 'DETAIL')
            if self.detail and not detail:
                previous = getattr(self.collector, 'previous', None)
                if hasattr(previous, 'clear'):
                    previous.clear()
            self.detail = detail
            response = self.sample(request_id)
            self.next_sample_delay = 1.0 if detail else None
        else:
            sample_id = message.get('sample_id')
            require(valid_id(sample_id) and sample_id in self.samples, 'SAMPLE_NOT_CURRENT_SESSION')
            sample = self.samples[sample_id]
            require('PROCESS_DETAIL_PAUSED' not in sample.get('warnings', []), 'SAMPLE_DETAIL_PAUSED')
            if kind == 'record_app_view':
                require(sample is self.current_sample, 'STALE_SAMPLE')
                response = self.record_apps(message, sample)
            else:
                response = self.record_receipt(message, sample)
            response.update(schema_version=1, type='ack', session_id=self.session_id,
                            request_id=request_id, sample_id=sample_id)
        # Compressed copy: a cached sample_now reply must not pin a full process list.
        self.requests[request_id] = (fingerprint, zlib.compress(json.dumps(response, separators=(',', ':')).encode()))
        if len(self.requests) > 128:
            self.requests.popitem(last=False)
        return response

    def record_apps(self, message, sample):
        require(set(message) <= {'schema_version', 'type', 'request_id', 'session_id', 'sample_id',
                                  'apps', 'user_protected_app_ids'}, 'UNKNOWN_FIELD')
        apps, protected = message.get('apps'), message.get('user_protected_app_ids')
        require(isinstance(apps, list) and len(apps) <= MAX_APPS, 'APP_LIMIT')
        require(isinstance(protected, list) and len(protected) <= MAX_APPS and
                all(valid_id(app_id) for app_id in protected) and len(set(protected)) == len(protected), 'PROTECTION_LIST')
        observed = {process_key(p): p for p in sample['processes']}
        seen_keys, seen_apps, clean_apps, pending = set(), set(), [], []
        for app in apps:
            require(isinstance(app, dict) and set(app) == {'app_id', 'process_keys', 'classification', 'reason_code'}, 'APP_FIELDS')
            app_id, keys = app['app_id'], app['process_keys']
            require(valid_id(app_id) and app_id not in seen_apps, 'APP_ID')
            seen_apps.add(app_id)
            require(app['classification'] in CLASSES and valid_reason(app['reason_code']), 'APP_CLASSIFICATION')
            require(isinstance(keys, list) and len(keys) <= MAX_PROCESSES, 'PROCESS_KEYS')
            processes = []
            for key in keys:
                require(isinstance(key, dict) and set(key) == {'uid', 'pid', 'start_ticks'}, 'PROCESS_KEY_FIELDS')
                require(integer(key['uid']) and integer(key['pid'], 1) and integer(key['start_ticks'], 1), 'PROCESS_KEY')
                identity = process_key(key)
                require(identity in observed and key['uid'] == self.store.uid, 'PROCESS_NOT_OBSERVED')
                require(identity not in seen_keys, 'DUPLICATE_PROCESS_KEY')
                seen_keys.add(identity)
                processes.append(observed[identity])
            classification, reason = classify(app_id, processes, protected, bool(processes),
                                              app['classification'], app['reason_code'])
            if classification != 'protected' and (sample['truncated'] or
                    'PROCESS_COVERAGE_PARTIAL' in sample['warnings']):
                classification, reason = 'unknown', 'PROCESS_COVERAGE_PARTIAL'
            pending.append((app_id, processes, classification, reason))
        # Stored values match what the notch shows: each app's process tree, never another app's.
        children = {}
        for process in sample['processes']:
            children.setdefault(process.get('ppid'), []).append(process)
        roots = {process['pid'] for _app_id, processes, _c, _r in pending for process in processes}
        for app_id, processes, classification, reason in pending:
            kind, amount, coverage = aggregate_members(tree_members(processes, roots, children))
            clean_apps.append({'app_id': app_id, 'metric_kind': kind, 'memory_bytes': amount,
                               'coverage': coverage, 'classification': classification, 'reason_code': reason})
        self.store.save_apps(sample, clean_apps, protected)
        self.views[sample['sample_id']] = {app['app_id']: app for app in clean_apps}
        return {'status': 'recorded', 'apps': clean_apps}

    def record_receipt(self, message, sample):
        require(set(message) <= {'schema_version', 'type', 'request_id', 'session_id', 'sample_id', 'mode',
                                  'action_id', 'status', 'items', 'after_sample_id', 'available_before',
                                  'available_after', 'observed_delta'}, 'UNKNOWN_FIELD')
        require(message.get('mode') == self.mode == 'live', 'LIVE_ACTIONS_ONLY')
        action_id, status, items = message.get('action_id'), message.get('status'), message.get('items')
        require(valid_id(action_id) and status in STATUSES, 'RECEIPT_ID_OR_STATUS')
        require(isinstance(items, list) and 1 <= len(items) <= MAX_APPS, 'ITEM_LIMIT')
        seen = set()
        for item in items:
            require(isinstance(item, dict) and set(item) == {'app_id', 'result', 'reason_code'}, 'ITEM_FIELDS')
            require(valid_id(item['app_id']) and item['app_id'] not in seen, 'ITEM_APP_ID')
            require(item['result'] in RESULTS and valid_reason(item['reason_code']), 'ITEM_RESULT')
            seen.add(item['app_id'])
        existing = self.store.receipt(action_id)
        if existing is None:
            require(status == 'requested', 'RECEIPT_MUST_START_REQUESTED')
            require(sample is self.current_sample and 0 <= self.clock() - sample['monotonic_ms'] <= 5000, 'STALE_SAMPLE')
            require(sample['health'] != 'error' and sample['boot_id'] != 'unavailable', 'OBSERVATION_UNAVAILABLE')
            view = self.views.get(sample['sample_id'], {})
            for app_id in seen:
                require(app_id in view and view[app_id]['classification'] in ('active', 'candidate'), 'APP_PROTECTED_OR_UNMAPPED')
            require(all(item['result'] == 'requested' for item in items), 'REQUESTED_ITEMS')
        else:
            require(existing['sample_id'] == sample['sample_id'] and existing['mode'] == self.mode, 'RECEIPT_ID_REUSED')
            require(seen == {item['app_id'] for item in existing['items']}, 'RECEIPT_TARGET_CHANGED')
            if existing['status'] == status:
                require(sorted(items, key=lambda x: x['app_id']) == existing['items'], 'RECEIPT_STATE_CONFLICT')
                return {'action_id': action_id, 'status': status, 'receipt': self.public_receipt(existing)}
            require(existing['status'] not in TERMINAL and status != 'requested', 'RECEIPT_STATE_REGRESSION')
        if status in ('requested', 'observing'):
            require(all(item['result'] == 'requested' for item in items), 'PENDING_ITEMS')
        if status == 'completed':
            require(all(item['result'] == 'window_closed' for item in items), 'COMPLETION_NOT_OBSERVED')
        if status in TERMINAL:
            require(all(item['result'] != 'requested' for item in items), 'FINAL_ITEMS_REQUIRED')
        after = None
        after_id = message.get('after_sample_id')
        if after_id is not None:
            require(status in TERMINAL and after_id in self.samples, 'AFTER_SAMPLE')
            after = self.samples[after_id]
            require(after is self.current_sample and after['boot_id'] == sample['boot_id'] and
                    after['monotonic_ms'] >= sample['monotonic_ms'], 'AFTER_SAMPLE_STALE')
        if status == 'completed':
            require(after is not None, 'AFTER_SAMPLE_REQUIRED')
        receipt = self.store.save_receipt(action_id, sample, status, items, after)
        return {'action_id': action_id, 'status': status, 'receipt': self.public_receipt(receipt)}

    @staticmethod
    def public_receipt(receipt):
        return {key: receipt[key] for key in ('id', 'created_at', 'updated_at', 'mode', 'status',
                                             'available_before', 'available_after', 'observed_delta', 'items')}
