import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DOCK_PROTOCOL, buttonNumber, layoutNotches, canClaim, isActorWithin, isPointWithinActor,
    classifyOutsideSurface, dispatchOutsideDismiss} from '../extension/dockModel.js';

const monitor = {x: 100, y: 0, width: 1280, panelHeight: 32};
test('two islands form one centered group below panel without overlap', () => {
    const positions = layoutNotches([{id: 'sports', width: 360, height: 46, order: 0},
        {id: 'memory', width: 220, height: 46, order: 1}], monitor);
    assert.equal(positions.length, 2);
    assert.equal(positions[0].y, 32);
    assert.equal(positions[1].x - positions[0].x - positions[0].width, 6);
    assert.equal(positions[0].x + (360 + 220 + 6) / 2, 740);
});
test('narrow display preserves active participant and falls back companion', () => {
    const positions = layoutNotches([{id: 'sports', width: 500, height: 250, order: 0, active: true},
        {id: 'memory', width: 220, height: 46, order: 1}], {...monitor, width: 600});
    assert.equal(positions.find(x => x.id === 'memory').fallback, true);
    assert.equal(positions.find(x => x.id === 'sports').fallback, false);
});
test('single notch recenters and clamps to monitor', () => {
    const [position] = layoutNotches([{id: 'memory', width: 500, height: 250}], {...monitor, width: 390});
    assert.equal(position.width, 366);
    assert.equal(position.x, 112);
});
test('manual review is not interrupted by automatic events', () => {
    assert.equal(canClaim({id: 'memory', priority: 100}, 'sports', 80), false);
    assert.equal(canClaim({id: 'memory', priority: 30}, 'sports', 80), true);
    assert.equal(canClaim({id: 'memory', priority: 100}, 'sports', 100), true);
});

test('shared dock protocol and manual tie use last-toggle ownership', () => {
    assert.equal(DOCK_PROTOCOL, 5);
    assert.equal(canClaim({id: 'memory', priority: 100}, 'sports', 100), true);
});

test('button extraction supports direct and tuple GI return values', () => {
    assert.equal(buttonNumber(1), 1);
    assert.equal(buttonNumber([true, 3]), 3);
    assert.equal(buttonNumber([false, 0]), 0);
});

test('only outside primary and secondary clicks dismiss without claiming inside controls', () => {
    let dismissals = 0;
    for (const button of [1, 3]) {
        assert.equal(dispatchOutsideDismiss({eventType: 4, buttonPressType: 4, button,
            active: true, expanded: true}, () => dismissals++), true);
    }
    for (const button of [2, 4, 5]) {
        assert.equal(dispatchOutsideDismiss({eventType: 4, buttonPressType: 4, button,
            active: true, expanded: true}, () => dismissals++), false);
    }
    assert.equal(dispatchOutsideDismiss({eventType: 4, buttonPressType: 4, button: 1, active: true,
        expanded: true, insideDock: true}, () => dismissals++), false);
    assert.equal(dispatchOutsideDismiss({eventType: 4, buttonPressType: 4, button: 1, active: true,
        expanded: true}, () => dismissals++, {insideOwnerTrigger: true}), false);
    assert.equal(dispatchOutsideDismiss({eventType: 4, buttonPressType: 4, button: 1, active: true,
        expanded: true}, () => {}, {insideOwnerTrigger: false}), true);
    assert.equal(dismissals, 2);
});

test('captured-event hit test recognizes descendants and transformed actor bounds', () => {
    const root = {get_parent: () => null, get_transformed_position: () => [80, 20],
        get_transformed_size: () => [500, 300]};
    const control = {get_parent: () => root};
    assert.equal(isActorWithin(control, root), true);
    assert.equal(isPointWithinActor(root, 500, 300), true);
    assert.equal(isPointWithinActor(root, 580, 320), true);
    assert.equal(isPointWithinActor(root, 581, 320), false);
});

test('only the active notch trigger is exempt from outside dismissal', () => {
    const actor = (x, y, width, height, parent = null) => ({get_parent: () => parent,
        get_transformed_position: () => [x, y], get_transformed_size: () => [width, height]});
    const dock = actor(100, 20, 400, 80);
    const ownerTrigger = actor(20, 0, 50, 32);
    const otherTrigger = actor(600, 0, 50, 32);
    const ownerClick = classifyOutsideSurface({dockActor: dock, ownerTrigger,
        eventSource: actor(25, 5, 5, 5, ownerTrigger), x: 30, y: 10});
    assert.deepEqual(ownerClick, {insideDock: false, insideOwnerTrigger: true});
    const otherClick = classifyOutsideSurface({dockActor: dock, ownerTrigger,
        eventSource: actor(605, 5, 5, 5, otherTrigger), x: 610, y: 10});
    assert.deepEqual(otherClick, {insideDock: false, insideOwnerTrigger: false});
    assert.equal(dispatchOutsideDismiss({eventType: 4, buttonPressType: 4, button: 1, active: true,
        expanded: true}, () => {}, otherClick), true);
});

test('blur inset and hit-region margins survive St style resets', async () => {
    const {DESIGN} = await import('../extension/designTokens.js');
    const source = readFileSync(new URL('../extension/notchSurface.js', import.meta.url), 'utf8');
    // St re-applies CSS margins on every style change, so margin_* constructor properties reset to 0
    // and the BACKGROUND blur then paints the whole surface rectangle past the rounded corners.
    assert.doesNotMatch(source, /margin_(left|right|top|bottom)\s*:/);
    assert.match(source, /style: `margin: /);
    // Hit-region margins are re-applied after style changes for the same reason.
    assert.match(source, /connect\('style-changed', updateHitRegions\)/);
    // The Cairo Bézier corner reaches 0.3125 × radius inward at its diagonal midpoint.
    assert.ok(DESIGN.material.blurInset >= 0.3125 * DESIGN.radius.surface);
});

test('numpad toggle shortcut is bound on enable and released on disable', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    const schema = readFileSync(new URL('../extension/schemas/org.gnome.shell.extensions.matci.gschema.xml', import.meta.url), 'utf8');
    assert.match(source, /addKeybinding\('matci-toggle-shortcut'/);
    assert.match(source, /disable\(\) \{\n\s+this\._enabled = false;\n\s+Main\.wm\.removeKeybinding\('matci-toggle-shortcut'\);/);
    assert.ok(schema.includes(`<key name="matci-toggle-shortcut" type="as"><default>['KP_Delete', 'KP_Decimal']</default>`));
});
