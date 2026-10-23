import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DOCK_PROTOCOL, SNAP, buttonNumber, layoutIsland, canClaim, isActorWithin, isPointWithinActor,
    classifyOutsideSurface, dispatchOutsideDismiss, notchGeometry, pointInNotchShape} from '../extension/dockModel.js';

const monitor = {x: 100, y: 0, width: 1280, panelHeight: 32};
test('compact modules share one island row below the panel', () => {
    const {island, slots} = layoutIsland([{id: 'sports', width: 200, height: 36, order: 0},
        {id: 'spotify', width: 56, height: 36, order: 2}], monitor);
    assert.deepEqual(island, {x: 606, y: 32, width: 268, height: 36, expanded: false, ownerId: null});
    assert.deepEqual(slots.get('sports'), {x: 0, width: 200, shown: true});
    assert.deepEqual(slots.get('spotify'), {x: 212, width: 56, shown: true});
    assert.equal(SNAP, 8);
    assert.equal(layoutIsland([{id: 'a', width: 61, height: 36}], monitor).slots.get('a').width, 64);
});
test('an expanded owner has the island to itself', () => {
    const {island, slots} = layoutIsland([{id: 'sports', width: 200, height: 36, order: 0},
        {id: 'memory', width: 368, height: 240, order: 1, expanded: true, active: true}], monitor);
    assert.deepEqual(island, {x: 556, y: 32, width: 368, height: 240, expanded: true, ownerId: 'memory'});
    assert.equal(slots.get('sports').shown, false);
    assert.equal(slots.get('memory').shown, true);
});
test('narrow display preserves active participant and hides the companion', () => {
    const {island, slots} = layoutIsland([{id: 'sports', width: 500, height: 36, order: 0},
        {id: 'memory', width: 220, height: 36, order: 1, active: true}], {...monitor, width: 600});
    assert.equal(island.width, 224);
    assert.equal(slots.get('sports').shown, false);
    assert.equal(slots.get('memory').shown, true);
});
test('single expanded notch recenters and clamps to monitor', () => {
    const {island} = layoutIsland([{id: 'memory', width: 500, height: 250, expanded: true}], {...monitor, width: 390});
    assert.equal(island.width, 366);
    assert.equal(island.x, 112);
    assert.equal(layoutIsland([], monitor).island, null);
});
test('manual review is not interrupted by automatic events', () => {
    assert.equal(canClaim({id: 'memory', priority: 100}, 'sports', 80), false);
    assert.equal(canClaim({id: 'memory', priority: 30}, 'sports', 80), true);
    assert.equal(canClaim({id: 'memory', priority: 100}, 'sports', 100), true);
});

test('the island draws the only slab; matci hands over its content tree', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /createNotchSurface|addChrome\(|removeChrome\(/);
    assert.match(source, /new DockParticipant\(\{id: this\.uuid, content: this\._root,/);
});

test('shared dock protocol and manual tie use last-toggle ownership', () => {
    assert.equal(DOCK_PROTOCOL, 7);
    assert.equal(canClaim({id: 'sports', priority: 80}, 'kakao', 60), false);
    assert.equal(canClaim({id: 'kakao', priority: 60}, 'spotify', 40), false);
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
    // Hit regions are placed by the slab layout during allocation, not from notify/style handlers.
    assert.match(source, /vfunc_allocate\(container, box\)/);
    assert.doesNotMatch(source, /updateHitRegions|margin_(left|right|top|bottom)/);
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
    assert.match(source, /메모리 \$\{bytes\(value\)\}\$\{tree \? `, 하위 \$\{tree\} 합계` : ''\}, \$\{metricKind\(kind\)\}\$\{age \? `, \$\{age\}` : ''\}/);
    assert.ok(!source.includes("'보호'"));
});

test('header leads with the title, tools trail; figures share a baseline; primary focus shows on blue', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../extension/stylesheet.css.in', import.meta.url), 'utf8');
    // The title box doubles as the ringless focus anchor that opening lands on.
    assert.match(source, /new St\.BoxLayout\(\{style_class: 'matci-brand', x_expand: true, reactive: true, can_focus: true\}\)/);
    assert.doesNotMatch(css, /\.matci-brand:focus/);
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
        if (line.includes('{{color.accentWarning}}')) assert.match(line, /^\.matci-(protected|meter-warning|problem-icon|panel-status) /);
    }
});

test('numpad toggle shortcut is bound on enable and released on disable', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    const schema = readFileSync(new URL('../extension/schemas/org.gnome.shell.extensions.matci.gschema.xml', import.meta.url), 'utf8');
    assert.match(source, /addKeybinding\('matci-toggle-shortcut'/);
    assert.match(source, /disable\(\) \{\n\s+this\._enabled = false;\n\s+Main\.wm\.removeKeybinding\('matci-toggle-shortcut'\);/);
    assert.ok(schema.includes(`<key name="matci-toggle-shortcut" type="as"><default>['KP_Add']</default>`));
});

test('the notch tree is styled before it is measured', () => {
    const source = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
    // Unmapped widgets report short heights until styled; the recursion reaches every row.
    assert.match(source, /actor\.ensure_style\?\.\(\);\n\s+actor\.get_children\(\)\.forEach\(ensureStyle\)/);
    assert.ok(source.indexOf('ensureStyle(this._root);') < source.indexOf('list.get_preferred_height('));
    assert.ok(source.lastIndexOf('ensureStyle(this._root);') < source.indexOf('child.get_preferred_height(innerWidth)'));
});

test('every inset focus ring sits on a painted background (St skips inset shadows without one)', () => {
    // Generated CSS: template tokens contain braces that would split the rules.
    const css = readFileSync(new URL('../extension/stylesheet.css', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({selector: selector.trim(), body}));
    const painted = selector => rules.some(rule => rule.selector.split(',').map(s => s.trim()).includes(selector) &&
        /background-color:\s*(?!transparent)/.test(rule.body));
    for (const rule of rules.filter(rule => rule.selector.includes(':focus') && /box-shadow:\s*inset/.test(rule.body))) {
        for (const selector of rule.selector.split(',').map(s => s.trim())) {
            const base = selector.replace(':focus', '').split(' ')[0];
            assert.ok(/background-color:/.test(rule.body) || painted(base), `${selector} ring would be invisible`);
        }
    }
});

test('slab morphs ride a spring: growing overshoots ~2 % and settles, shrinking never overshoots', async () => {
    const {SPRING_OPEN, SPRING_CLOSE, springAt, springDuration} = await import('../extension/dockModel.js');
    const peak = spring => Math.max(...Array.from({length: 241}, (_, i) => springAt(i / 240, spring)));
    assert.equal(springAt(0, SPRING_OPEN), 0);
    assert.ok(peak(SPRING_OPEN) > 1.01 && peak(SPRING_OPEN) < 1.04, `open peak ${peak(SPRING_OPEN)}`);
    assert.ok(peak(SPRING_CLOSE) <= 1, `close peak ${peak(SPRING_CLOSE)}`);
    const open = springDuration(SPRING_OPEN);
    const close = springDuration(SPRING_CLOSE);
    assert.ok(open > 300 && open < 600, `open ${open} ms`);
    assert.ok(close > 200 && close < 450, `close ${close} ms`);
    // The shipped cubic-bezier must track the spring (Clutter progress functions do not work from GJS).
    const bezier = ([x1, y1, x2, y2], x) => {
        let t = x;
        for (let i = 0; i < 12; i++) {
            const dx = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
            t = Math.min(1, Math.max(0, t - (3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3 - x) / dx));
        }
        return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
    };
    for (const spring of [SPRING_OPEN, SPRING_CLOSE]) {
        const duration = springDuration(spring) / 1000;
        for (let i = 1; i < 50; i++)
            assert.ok(Math.abs(bezier(spring.curve, i / 50) - springAt(i / 50 * duration, spring)) < 0.025, `${spring.response} at ${i}`);
    }
    assert.ok(SPRING_CLOSE.curve[1] <= 1 && SPRING_CLOSE.curve[3] <= 1, 'a shrink never passes its target');
    // Measured in the harness: the first fit overshot 3.7% (16 px on a 492 px card); the curve now caps it.
    const curvePeak = Math.max(...Array.from({length: 101}, (_, i) => bezier(SPRING_OPEN.curve, i / 100)));
    assert.ok(curvePeak > 1.01 && curvePeak <= 1.025, `open curve peak ${curvePeak}`);
});
