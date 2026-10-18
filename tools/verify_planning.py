"""Validate planning artifacts, not a test of an implemented matci app."""
from pathlib import Path
import csv
import hashlib
import json
import re
import sqlite3

root = Path(__file__).resolve().parents[1]
for path in root.rglob('*.json'):
    if 'local-diagnostics' not in path.parts:
        json.loads(path.read_text(encoding='utf-8'))

manifest = json.loads((root / 'replica/screens/manifest.json').read_text(encoding='utf-8'))
assert len(manifest['images']) == 6
for entry in manifest['images']:
    data = (root / 'replica/screens' / entry['file']).read_bytes()
    assert len(data) == entry['bytes']
    assert hashlib.sha256(data).hexdigest() == entry['sha256']

with (root / 'replica/features.csv').open(encoding='utf-8', newline='') as stream:
    features = list(csv.DictReader(stream))
assert len(features) == len({row['feature'] for row in features})
for row in features:
    assert row['clone'] in {'yes', 'no', 'partial', 'skip'}
    assert row['priority'] in {'must', 'should', 'could'}
    assert row['original'] in {'yes', 'no'}
    assert not (row['clone'] == 'skip' and not row['notes'])
    assert None not in row, 'CSV contains an extra column'

bad_links = []
for path in root.rglob('*.md'):
    if 'local-diagnostics' in path.parts:
        continue
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
        if '://' not in target and not target.startswith('#'):
            if not (path.parent / target.split('#')[0]).exists():
                bad_links.append((str(path.relative_to(root)), target))
assert not bad_links, bad_links

db = sqlite3.connect(':memory:')
db.executescript((root / 'replica/schema.sql').read_text(encoding='utf-8'))
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
assert len(tables) == 5
assert db.execute('PRAGMA foreign_keys').fetchone()[0] == 1
db.execute("INSERT INTO memory_samples VALUES ('s',1000,'2026-10-18T00:00:00Z','2026-10-18T00:00:00Z','b',1,'demo','ok',100,30,NULL,NULL)")

negative_cases = [
    "INSERT INTO memory_samples VALUES ('bad-total',1000,'t','t','b',1,'demo','ok',0,0,NULL,NULL)",
    "INSERT INTO memory_samples VALUES ('bad-avail',1000,'t','t','b',1,'demo','ok',100,101,NULL,NULL)",
    "INSERT INTO app_observations VALUES ('orphan','none',1000,'t','t','app','pss',2,'complete','candidate','x')",
    "INSERT INTO app_observations VALUES ('bad-metric','s',1000,'t','t','app','unavailable',2,'complete','candidate','x')",
    "INSERT INTO protection_rules VALUES ('bad-rule',1000,'t','t','app','builtin',0)",
    "INSERT INTO action_receipts VALUES ('bad-delta',1000,'t','t','s','demo','completed',10,20,9)",
]
for sql in negative_cases:
    try:
        db.execute(sql)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError(f'Expected schema rejection: {sql}')

db.execute("INSERT INTO app_observations VALUES ('app','s',1000,'t','t','example','pss',2,'complete','candidate','x')")
db.execute("INSERT INTO action_receipts VALUES ('a',1000,'t','t','s','demo','completed',20,10,-10)")
db.execute("INSERT INTO action_items VALUES ('i','a',1000,'t','t','example','window_closed','x')")
db.execute("DELETE FROM memory_samples WHERE id='s'")
assert db.execute('SELECT COUNT(*) FROM app_observations').fetchone()[0] == 0
assert db.execute("SELECT sample_id,observed_delta FROM action_receipts WHERE id='a'").fetchone() == (None, -10)
db.execute("DELETE FROM action_receipts WHERE id='a'")
assert db.execute('SELECT COUNT(*) FROM action_items').fetchone()[0] == 0
assert db.execute('PRAGMA foreign_key_check').fetchall() == []
db.close()

print('Planning checks passed: JSON/CSV, local Markdown links, 6 image hashes, 5-table SQLite draft.')
print('Schema cases: 6 invalid inserts rejected; cascade, SET NULL, signed delta and FK consistency checked.')
print(f'Feature rows: {len(features)}; implemented features: {sum(r["clone"] == "yes" for r in features)}.')
print('No app runtime, GNOME, schema compile, process close or target-device validation was performed.')
