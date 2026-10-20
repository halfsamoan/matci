import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CloseController} from '../extension/actions.js';
import {appView, protection} from '../extension/policy.js';

// Real protocol/persistence, explicitly synthetic Linux observations and plain
// JS objects in place of Shell windows. No platform collector or close API runs.
const HARNESS = String.raw`
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'tests')
from test_core_worker import FakeCollector
from matci.store import Store
from matci.worker import Worker
with tempfile.TemporaryDirectory() as directory:
    store = Store(Path(directory) / 'state')
    try:
        collector = FakeCollector(store.uid)
        worker = Worker(collector, store, 'live', clock=lambda: collector.now)
        print(json.dumps(worker.sample()), flush=True)
        for line in sys.stdin:
            command = json.loads(line)
            collector.now = command['now']
            collector.available = 12000 if command['closed'] else 10000
            print(json.dumps(worker.handle_line(json.dumps(command['message']).encode())), flush=True)
    finally:
        store.close()
`;

test('CLI emits an initial UI version mismatch code before its snapshot', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'matci-version-'));
    try {
        const result = spawnSync(process.env.MATCI_PYTHON ?? 'python3',
            ['-m', 'matci', '--once', '--mode', 'demo', '--state-dir', stateDir, '--ui-version', '999'], {
                cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 10000,
            });
        assert.equal(result.status, 0, result.stderr);
        const lines = result.stdout.trim().split('\n').map(line => JSON.parse(line));
        assert.equal(lines[0].type, 'error');
        assert.equal(lines[0].code, 'UI_VERSION_MISMATCH');
        assert.equal(lines[1].type, 'snapshot');
    } finally {
        rmSync(stateDir, {recursive: true, force: true});
    }
});

test('CLI accepts an exact UI version from installed extension metadata', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'matci-installed-version-'));
    const dataHome = join(stateDir, 'data');
    const installed = join(dataHome, 'gnome-shell', 'extensions', 'matci@local');
    mkdirSync(installed, {recursive: true});
    cpSync(fileURLToPath(new URL('../matci', import.meta.url)), join(installed, 'matci'), {recursive: true});
    cpSync(fileURLToPath(new URL('../data', import.meta.url)), join(installed, 'data'), {recursive: true});
    cpSync(fileURLToPath(new URL('../migrations', import.meta.url)), join(installed, 'migrations'), {recursive: true});
    writeFileSync(join(installed, 'metadata.json'), JSON.stringify({uuid: 'matci@local', version: 8}));
    try {
        const result = spawnSync(process.env.MATCI_PYTHON ?? 'python3',
            ['-m', 'matci', '--once', '--mode', 'demo', '--state-dir', join(stateDir, 'state'), '--ui-version', '8'], {
                cwd: installed, encoding: 'utf8', timeout: 10000,
            });
        assert.equal(result.status, 0, result.stderr);
        const lines = result.stdout.trim().split('\n').map(line => JSON.parse(line));
        assert.equal(lines[0].type, 'snapshot');
        assert.equal(lines.some(line => line.code === 'UI_VERSION_MISMATCH'), false);
    } finally {
        rmSync(stateDir, {recursive: true, force: true});
    }
});

test('worker switches between detail and light snapshots over JSONL', {timeout: 15000}, async t => {
    const child = spawn(process.env.MATCI_PYTHON ?? 'python3', ['-u', '-c', HARNESS], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
    t.after(() => { child.stdin.end(); child.kill(); });
    const read = async () => {
        const result = await lines.next();
        assert.equal(result.done, false, stderr || 'worker ended');
        return JSON.parse(result.value);
    };
    let snapshot = await read();
    const setDetail = async detail => {
        const message = {schema_version: 1, type: 'set_detail', request_id: randomUUID(),
            session_id: snapshot.session_id, detail};
        child.stdin.write(`${JSON.stringify({now: snapshot.monotonic_ms + 1000, closed: false, message})}\n`);
        return read();
    };
    const light = await setDetail(false);
    assert.equal(light.type, 'snapshot');
    assert.equal(light.processes.length, 0);
    assert.equal(light.truncated, false);
    assert.ok(light.warnings.includes('PROCESS_DETAIL_PAUSED'));
    snapshot = light;
    const full = await setDetail(true);
    assert.equal(full.type, 'snapshot');
    assert.ok(full.processes.length > 0);
    assert.equal(full.warnings.includes('PROCESS_DETAIL_PAUSED'), false);
    child.stdin.end();
    await new Promise((resolve, reject) => { child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr))); });
});

test('JS close gate and Python Worker persist requested before synthetic close and final observed delta', {timeout: 15000}, async t => {
    const child = spawn(process.env.MATCI_PYTHON ?? 'python3', ['-u', '-c', HARNESS], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
    t.after(() => { child.stdin.end(); child.kill(); });
    const read = async () => {
        const result = await lines.next();
        assert.equal(result.done, false, stderr || 'worker ended');
        return JSON.parse(result.value);
    };
    let snapshot = await read(); let now = snapshot.monotonic_ms; let closed = false;
    let requestedCommitted = false; let final;
    const group = {appId: 'browser.desktop', name: 'Synthetic browser', windows: [{}], processes: snapshot.processes};
    const request = async (type, body = {}) => {
        const message = {schema_version: 1, type, request_id: randomUUID(), session_id: snapshot.session_id, ...body};
        child.stdin.write(`${JSON.stringify({now, closed, message})}\n`);
        const reply = await read();
        if (reply.type === 'error') throw new Error(reply.code);
        if (reply.status === 'requested') { assert.equal(reply.receipt.status, 'requested'); requestedCommitted = true; }
        if (reply.status === 'completed') final = reply.receipt;
        return reply;
    };
    const controller = new CloseController({snapshot: () => snapshot, uuid: randomUUID, now: () => now,
        protection: g => protection(g, snapshot, snapshot.processes[0].uid),
        groups: current => closed ? [] : [{...group, processes: current.processes}],
        fresh: async () => { snapshot = await request('sample_now'); return snapshot; },
        recordView: (s, groups) => request('record_app_view', {sample_id: s.sample_id,
            apps: appView(groups, s, s.processes[0].uid, []), user_protected_app_ids: []}),
        request, delay: async ms => { now += ms; },
        close: () => { assert.equal(requestedCommitted, true); closed = true; }, onState: () => {},
    });
    controller.prepare([group]);
    assert.equal(await controller.confirm(), 'completed');
    assert.equal(final.observed_delta, 2000);
    assert.equal(final.items[0].result, 'window_closed');
    assert.equal(final.available_before, 10000);
    assert.equal(final.available_after, 12000);
    child.stdin.end();
    await new Promise((resolve, reject) => { child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr))); });
});
