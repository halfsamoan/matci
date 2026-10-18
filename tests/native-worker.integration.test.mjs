import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
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
