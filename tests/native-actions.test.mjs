import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CloseController} from '../extension/actions.js';
import {protection, sameTargets, interactionAge, takeLines, appMetrics, healthText} from '../extension/policy.js';

const extensionSource = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');

const proc = {uid: 1000, pid: 42, start_ticks: 8, identity_observed_monotonic_ms: 100};
const sample = {mode: 'live', sample_id: 'a', monotonic_ms: 100, processes: [proc]};
const group = {appId: 'org.gnome.Calculator.desktop', processes: [proc], windows: [{}]};
test('re-enable keeps worker generations monotonic', () => {
    assert.match(extensionSource, /this\._generation = \(this\._generation \?\? 0\) \+ 1;/);
    assert.doesNotMatch(extensionSource, /this\._generation = 0;/);
});
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
        setGroups: groups => { current = groups; }, setNow: value => { now = value; }};
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
test('a pending review remains usable after a temporary dock yield and reentry within 60 seconds', async () => {
    const f = fixture();
    const review = f.controller.prepare([group]);
    // A temporary visual yield hides matci but deliberately does not call cancel().
    f.setNow(59999);
    assert.equal(f.controller.review, review);
    assert.equal(await f.controller.confirm(), 'completed');
});
test('a yielded review older than 60 seconds is rejected before close', async () => {
    const f = fixture();
    f.controller.prepare([group]);
    f.setNow(60001);
    await assert.rejects(f.controller.confirm(), /검토가 만료되었습니다/);
    assert.equal(f.closed(), 0);
    assert.equal(f.controller.review, null);
});
test('a dock yield preserves the native review and selected app IDs', () => {
    assert.ok(extensionSource.includes('onYield: () => this._collapse(false, {keepReview: true})'));
    assert.ok(extensionSource.includes('if (!keepReview && !this._actions?.busy) this._actions?.cancel()'));
    assert.ok(extensionSource.includes('if (!keepReview) this._selected.clear()'));
    assert.ok(extensionSource.includes('this._actionStatus = \'error\';'));
});
test('rerender retains scroll adjustment and restores the focused app or control', () => {
    assert.ok(extensionSource.includes('scroll?.vscroll?.adjustment'));
    assert.ok(extensionSource.includes('scroll?.vadjustment'));
    assert.ok(extensionSource.includes('const focusedAppId = focusedActor?._matciAppId ?? null'));
    assert.ok(extensionSource.includes('const focusedRole = focusedActor?._matciRole ?? null'));
    assert.ok(extensionSource.includes('this._rowButtons.set(group.appId, select)'));
    assert.ok(extensionSource.includes('adjustment.value = Math.min(previousScroll, Math.max(0, upper - pageSize))'));
    assert.ok(extensionSource.includes('(target?.can_focus ? target : this._root).grab_key_focus()'));
});
test('worker stdout framing bounds raw bytes, keeps order, and is released on stop', () => {
    const decoder = new TextDecoder();
    const bytes = text => new TextEncoder().encode(text);
    const state = {text: '', bytes: 0}; const lines = [];
    takeLines(state, bytes('{"a":1}\n{"b"'), 16, decoder, line => lines.push(line));
    takeLines(state, bytes(':2}\n' + 'é'.repeat(8) + '\n'), 16, decoder, line => lines.push(line));
    assert.deepEqual(lines, ['{"a":1}', '{"b":2}', 'é'.repeat(8)]);
    assert.deepEqual(state, {text: '', bytes: 0});
    assert.throws(() => takeLines({text: '', bytes: 0}, bytes('é'.repeat(9) + '\n'), 16, decoder, () => {}), /line byte limit/);
    assert.throws(() => takeLines({text: 'x', bytes: 10}, bytes('x'.repeat(7)), 16, decoder, () => {}), /line limit/);
    assert.ok(!extensionSource.includes('new TextEncoder().encode(this._stdoutText)'));
    assert.ok(extensionSource.includes('this._writing = false; this._stdout = null;'));
    assert.ok(extensionSource.includes('if (this._scrollTimer) GLib.source_remove(this._scrollTimer);'));
});
test('panel button bypasses the dummy popup and handles pointer, touch, and keyboard', () => {
    assert.ok(extensionSource.includes("new PanelMenu.Button(0.0, 'matci 메모리', true)"));
    assert.ok(extensionSource.includes("this._connect(this._indicator, 'button-press-event', toggle)"));
    assert.ok(extensionSource.includes("this._connect(this._indicator, 'touch-event'"));
    assert.ok(extensionSource.includes("this._connect(this._indicator, 'key-press-event'"));
    assert.ok(!extensionSource.includes("'open-state-changed'"));
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

test('RSS rows are marked approximate only when PSS rows are shown beside them', () => {
    const p = (metric_kind, memory_bytes) => ({metric_kind, memory_bytes});
    const mixed = appMetrics([{processes: [p('pss', 2), p('pss', 3)]}, {processes: [p('rss', 7)]},
        {processes: [p('pss', 1), p('rss', 1)]}, {processes: []}]);
    assert.deepEqual(mixed.map(row => [row.kind, row.value, row.approximate]),
        [['pss', 5, false], ['rss', 7, true], [null, null, false], [null, null, false]]);
    assert.ok(appMetrics([{processes: [p('rss', 7)]}, {processes: [p('rss', 2)]}]).every(row => !row.approximate));
    // A mixed group prints no value, so it cannot make the others look mixed.
    assert.ok(appMetrics([{processes: [p('rss', 7)]}, {processes: [p('pss', 1), p('rss', 1)]}]).every(row => !row.approximate));
});

test('partial health never names a cause; the panel only reports a visibly missing value', () => {
    const listed = [{pid: 1}];
    for (const sample of [{health: 'partial', warnings: ['PROCESS_COVERAGE_PARTIAL'], processes: listed},
        {health: 'partial', warnings: ['BOOT_ID_UNAVAILABLE'], processes: listed}, {health: 'partial'}])
        assert.equal(healthText(sample), '관측 갱신됨');
    assert.equal(healthText({health: 'ok', warnings: ['PSI_UNAVAILABLE']}), '관측 갱신됨');
    assert.equal(healthText({health: 'error'}), '메모리 정보를 읽지 못함');
    assert.equal(healthText({health: 'odd'}), '관측 상태 미확인');
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    assert.match(source, /missingValues = rowMetrics\.some\(row => row\.value === null\)/);
    assert.match(source, /snapshot\?\.health === 'partial' && missingValues/);
    // RSS beside PSS is an upper bound, and the content height is never clamped below its children.
    assert.match(source, /`≤\$\{bytes\(value\)\}`/);
    assert.doesNotMatch(source, /Math\.min\(326/);
});
