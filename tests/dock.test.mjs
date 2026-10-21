import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DOCK_PROTOCOL, buttonNumber, layoutNotches, canClaim, isActorWithin, isPointWithinActor,
    classifyOutsideSurface, dispatchOutsideDismiss, notchGeometry, pointInNotchShape} from '../extension/dockModel.js';

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
    assert.equal(DOCK_PROTOCOL, 6);
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

test('opaque slab hit-tests the body between the ears and inside the rounded bottom', () => {
    const source = readFileSync(new URL('../extension/notchSurface.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /BlurEffect/);
    // St re-applies CSS margins on every style change; hit regions are recomputed after it.
    assert.match(source, /connect\('style-changed', updateHitRegions\)/);
    // matci body 368 + two 14 px ears, 250 px tall: radius 22 at the bottom.
    assert.deepEqual(notchGeometry(250, 396), {ear: 14, radius: 22, sliver: false});
    assert.equal(notchGeometry(6, 104).sliver, true);
    assert.equal(pointInNotchShape(5, 5, 396, 250), false);
    assert.equal(pointInNotchShape(391, 5, 396, 250), false);
    assert.equal(pointInNotchShape(198, 5, 396, 250), true);
    assert.equal(pointInNotchShape(16, 248, 396, 250), false);
    assert.equal(pointInNotchShape(198, 250, 396, 250), true);
});

test('content starts right under the panel and the height adds the CSS padding exactly', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../extension/stylesheet.css.in', import.meta.url), 'utf8');
    const [, top, side, bottom] = source.match(/const PAD_TOP = (\d+), PAD_SIDE = (\d+), PAD_BOTTOM = (\d+);/);
    assert.match(css, new RegExp(`^\\.matci-notch \\{\\n(?: {4}.*\\n)*? {4}padding: ${top}px ${side}px ${bottom}px;$`, 'm'));
    assert.equal((css.match(/padding: \d+px \d+px \d+px;/g) ?? []).length, 1);
    assert.ok(Number(top) <= 12);
    assert.match(source, /this\._contentHeight = PAD_TOP \+ PAD_BOTTOM \+ /);
    // Content settles downward on the slab's curve.
    assert.match(source, /child\.translation_y = -DESIGN\.motion\.contentShift;\n\s+easeOnCurve\(child, \{opacity: 255/);
});

test('app rows print values only; metric kind and age stay in the accessible name', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /GiB|toUpperCase\(\)/);
    assert.ok(source.includes("this._label(bytes(value), 'matci-app-metric')"));
    assert.match(source, /메모리 \$\{bytes\(value\)\}, \$\{metricKind\(kind\)\}, \$\{age\}/);
    assert.ok(!source.includes("'보호'"));
});

test('header leads with the title, tools trail; figures share a baseline; primary focus shows on blue', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../extension/stylesheet.css.in', import.meta.url), 'utf8');
    assert.match(source, /new St\.BoxLayout\(\{style_class: 'matci-brand', x_expand: true\}\)/);
    assert.match(source, /label\.x_expand = false;\n\s+label\.y_align = Clutter\.ActorAlign\.CENTER;\n\s+brand\.add_child\(label\)/);
    assert.match(source, /usedMetric\.y_align = Clutter\.ActorAlign\.END;/);
    assert.match(source, /memoryDetail\.x_align = memoryDetail\.y_align = Clutter\.ActorAlign\.END;/);
    assert.match(css, /^\.matci-metric-detail \{.*padding-bottom: 5px; \}$/m);
    assert.match(css, /^\.matci-primary-button:focus \{ box-shadow: inset 0 0 0 2px \{\{color\.labelPrimary\}\}; \}$/m);
    // Equal specificity: the primary ring must come after the generic blue one to win.
    assert.ok(css.indexOf('.matci-primary-button:focus') > css.indexOf('.matci-button:focus'));
});

test('blue marks focus and the primary action; orange marks real warnings only', () => {
    const css = readFileSync(new URL('../extension/stylesheet.css.in', import.meta.url), 'utf8');
    for (const line of css.split('\n')) {
        if (/color\.(focus|actionPrimary|actionHover)\}\}/.test(line)) assert.match(line, /:focus|matci-primary-button/);
        if (line.includes('{{color.accentWarning}}')) assert.match(line, /^\.matci-(protected|meter-warning|problem-icon) /);
    }
});

test('numpad toggle shortcut is bound on enable and released on disable', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    const schema = readFileSync(new URL('../extension/schemas/org.gnome.shell.extensions.matci.gschema.xml', import.meta.url), 'utf8');
    assert.match(source, /addKeybinding\('matci-toggle-shortcut'/);
    assert.match(source, /disable\(\) \{\n\s+this\._enabled = false;\n\s+Main\.wm\.removeKeybinding\('matci-toggle-shortcut'\);/);
    assert.ok(schema.includes(`<key name="matci-toggle-shortcut" type="as"><default>['KP_Delete', 'KP_Decimal']</default>`));
});

test('the notch tree is styled before it is measured', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    // Unmapped widgets report short heights until styled; the recursion reaches every row.
    assert.match(source, /actor\.ensure_style\?\.\(\);\n\s+actor\.get_children\(\)\.forEach\(ensureStyle\)/);
    assert.ok(source.indexOf('ensureStyle(this._root);') < source.indexOf('list.get_preferred_height('));
    assert.ok(source.lastIndexOf('ensureStyle(this._root);') < source.indexOf('child.get_preferred_height(innerWidth)'));
});
