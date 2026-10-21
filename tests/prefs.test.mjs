import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// GJS-only module: checks read the source text, they do not execute it.
const prefs = readFileSync(new URL('../extension/prefs.js', import.meta.url), 'utf8');

test('threshold follows the suggestion switch', () => {
    assert.match(prefs, /settings\.bind\('auto-suggestions', threshold, 'sensitive', Gio\.SettingsBindFlags\.GET\)/);
});
test('shortcut row reads the keybinding setting and stays in sync', () => {
    assert.match(prefs, /get_strv\('matci-toggle-shortcut'\)\.map\(shortcutLabel\)/);
    assert.match(prefs, /changed::matci-toggle-shortcut/);
    assert.match(prefs, /숫자패드 /);
});
test('protected apps use a searchable picker with the existing id guard, not free text', () => {
    assert.doesNotMatch(prefs, /EntryRow/);
    assert.match(prefs, /enable_search: true/);
    assert.match(prefs, /const VALID_ID = \/\^\[A-Za-z0-9_\.@:\+-\]\{1,128\}\$\/;/);
    assert.match(prefs, /VALID_ID\.test\(id\) && !current\.includes\(id\) && current\.length < 100/);
    assert.match(prefs, /!BUILTIN_IDS\.includes\(app\.get_id\(\)\)/);
    assert.match(prefs, /changed::protected-app-ids/);
});
test('history keeps file safety checks and never shows raw status', () => {
    for (const guard of ['NOFOLLOW_SYMLINKS', 'get_is_symlink()', '131072', "get_attribute_uint32('unix::uid')", 'summary.owner_uid', 'schema_version !== 1'])
        assert.ok(prefs.includes(guard), guard);
    assert.match(prefs, /Object\.hasOwn\(STATUS, r\.status\) \? STATUS\[r\.status\] : '알 수 없음'/);
    assert.doesNotMatch(prefs, /'unknown'/);
});
