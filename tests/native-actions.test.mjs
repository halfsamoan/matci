import test from 'node:test';
import assert from 'node:assert/strict';
import {CloseController} from '../extension/actions.js';
import {protection, sameTargets, interactionAge} from '../extension/policy.js';

const proc = {uid: 1000, pid: 42, start_ticks: 8, identity_observed_monotonic_ms: 100};
const sample = {mode: 'live', sample_id: 'a', monotonic_ms: 100, processes: [proc]};
const group = {appId: 'org.gnome.Calculator.desktop', processes: [proc], windows: [{}]};
test('input-age hints handle short uint32 wrap and reject unknown/backward/old baselines', () => {
    assert.equal(interactionAge(1200, 2200, 1000), 1000);
    assert.equal(interactionAge(0xfffffff0, 20, 0xffffffe0), 36);
    for (const args of [[0, 20, 1], [10, 0, 1], [10, 20, 0], [21, 20, 1], [10, 20, 15],
        [1, 0x80000001, 1], [10, 20, 21], [10.5, 20, 1], [10, 0x100000000, 1]])
        assert.equal(interactionAge(...args), null);
    // Input hints are never an eligibility condition.
    assert.equal(protection({...group, interactionAgeMs: null}, sample, 1000), null);
});
test('policy rejects demo, stale, protected, other UID, PID zero and reused identities', () => {
    assert.equal(protection(group, sample, 1000), null);
    for (const s of [{...sample, mode: 'demo'}, {...sample, truncated: true}, {...sample, processes: []}])
        assert.ok(protection(group, s, 1000));
    assert.ok(protection(group, sample, 1001));
    assert.ok(protection(group, sample, 1000, [], 5001));
    assert.ok(protection({...group, appId: 'code.desktop'}, sample, 1000));
    assert.ok(protection({...group, processes: [{...proc, pid: 0}]}, sample, 1000));
    assert.ok(protection({...group, processes: [{...proc, start_ticks: 0}]}, sample, 1000));
    assert.ok(protection({...group, processes: [{...proc, has_work_descendants: true}]}, sample, 1000));
    assert.equal(sameTargets([group], [{...group, windows: [{}]}]), false);
});
function fixture() {
    let now = 0, closed = 0, mappings = 0;
    let current = [group]; const requests = [];
    const a = {snapshot: () => sample, protection: g => protection(g, sample, 1000), uuid: () => 'action', now: () => now,
        fresh: async () => sample, groups: () => { mappings++; return current; }, recordView: async () => {},
        request: async (type, body) => { requests.push([type, body]); return {type: 'ack', status: body.status, action_id: body.action_id}; },
        close: () => { closed++; current = []; }, delay: async ms => { now += ms; }, onState: () => {}};
    return {a, requests, controller: new CloseController(a), closed: () => closed, mappings: () => mappings,
        setGroups: groups => { current = groups; }};
}
test('requested commit ack precedes close; single-use review observes completion', async () => {
    const f = fixture(); f.controller.prepare([group]);
    f.a.close = () => { assert.equal(f.requests.at(-1)[1].status, 'requested'); f.setGroups([]); };
    assert.equal(await f.controller.confirm(), 'completed');
    await assert.rejects(f.controller.confirm());
    assert.deepEqual(f.requests.map(r => r[1].status), ['requested', 'observing', 'completed']);
});
test('failed persistence and post-ack window changes never close', async () => {
    const f = fixture(); f.controller.prepare([group]);
    f.a.request = async () => { throw new Error('disk full'); };
    await assert.rejects(f.controller.confirm()); assert.equal(f.closed(), 0);
    const g = fixture(); g.controller.prepare([group]);
    const request = g.a.request;
    g.a.request = async (type, body) => { const ack = await request(type, body); g.setGroups([{...group, windows: [{}]}]); return ack; };
    await assert.rejects(g.controller.confirm()); assert.equal(g.closed(), 0);
});
test('demo never captures or maps real windows; stop invalidates pending action', async () => {
    const f = fixture(); f.a.snapshot = () => ({...sample, mode: 'demo'});
    assert.throws(() => f.controller.prepare([group])); assert.equal(f.controller.review, null); assert.equal(f.mappings(), 0);
    const g = fixture(); g.controller.prepare([group]);
    g.a.fresh = async () => { g.controller.cancel(); return sample; };
    await assert.rejects(g.controller.confirm()); assert.equal(g.closed(), 0);
});
test('authoritative worker protection prevents close and request receipt', async () => {
    const f = fixture(); f.controller.prepare([group]);
    f.a.recordView = async () => ({apps: [{app_id: group.appId, classification: 'unknown'}]});
    await assert.rejects(f.controller.confirm()); assert.equal(f.closed(), 0); assert.equal(f.requests.length, 0);
});
test('persisted request is rejected after a reused PID starttime changes', async () => {
    const f = fixture(); f.controller.prepare([group]);
    let count = 0;
    f.a.fresh = async () => {
        if (++count === 2) f.setGroups([{...group, processes: [{...proc, start_ticks: 999}]}]);
        return sample;
    };
    await assert.rejects(f.controller.confirm()); assert.equal(f.closed(), 0);
    assert.deepEqual(f.requests.map(r => r[1].status), ['requested', 'rejected']);
});
test('remaining windows time out after ten seconds without escalation or repeated close', async () => {
    const f = fixture(); f.controller.prepare([group]);
    let calls = 0; f.a.close = () => { calls++; };
    assert.equal(await f.controller.confirm(), 'timeout'); assert.equal(calls, 1); assert.equal(f.a.now(), 10300);
    assert.equal(f.requests.at(-1)[1].items[0].result, 'still_running');
});
test('window-close failure records partial, never falsely records completed', async () => {
    const f = fixture(); f.controller.prepare([group]); f.a.close = () => { throw new Error('disposed window'); };
    await assert.rejects(f.controller.confirm());
    assert.equal(f.requests.at(-1)[1].status, 'partial');
    assert.equal(f.requests.at(-1)[1].items[0].reason_code, 'INTERRUPTED');
});
test('post-ack fresh sampling respects the real worker 250ms rate limit', async () => {
    const f = fixture(); f.controller.prepare([group]);
    const at = []; let last = -Infinity;
    f.a.fresh = async () => {
        if (f.a.now() - last < 250) throw new Error('RATE_LIMITED');
        last = f.a.now(); at.push(last); return sample;
    };
    assert.equal(await f.controller.confirm(), 'completed');
    assert.deepEqual(at, [0, 300, 1300]);
});
