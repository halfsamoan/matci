-- matci runtime schema v1.
PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

CREATE TABLE memory_samples (
    id TEXT PRIMARY KEY,
    owner_uid INTEGER NOT NULL CHECK(owner_uid >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    boot_id TEXT NOT NULL,
    monotonic_ms INTEGER NOT NULL CHECK(monotonic_ms >= 0),
    mode TEXT NOT NULL CHECK(mode IN ('live','demo')),
    health TEXT NOT NULL CHECK(health IN ('ok','partial','error')),
    total_bytes INTEGER CHECK(total_bytes > 0),
    available_bytes INTEGER CHECK(available_bytes >= 0),
    psi_some_avg10 REAL CHECK(psi_some_avg10 BETWEEN 0 AND 100),
    psi_full_avg10 REAL CHECK(psi_full_avg10 BETWEEN 0 AND 100),
    CHECK(available_bytes IS NULL OR total_bytes IS NULL OR available_bytes <= total_bytes)
);
CREATE INDEX memory_samples_owner_time ON memory_samples(owner_uid, created_at);

CREATE TABLE app_observations (
    id TEXT PRIMARY KEY,
    sample_id TEXT NOT NULL REFERENCES memory_samples(id) ON DELETE CASCADE,
    owner_uid INTEGER NOT NULL CHECK(owner_uid >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    app_id TEXT NOT NULL,
    metric_kind TEXT NOT NULL CHECK(metric_kind IN ('pss','rss','unavailable')),
    memory_bytes INTEGER CHECK(memory_bytes >= 0),
    coverage TEXT NOT NULL CHECK(coverage IN ('complete','partial','unavailable')),
    classification TEXT NOT NULL CHECK(classification IN ('protected','active','candidate','unknown')),
    reason_code TEXT NOT NULL,
    UNIQUE(sample_id, app_id),
    CHECK((metric_kind = 'unavailable' AND memory_bytes IS NULL) OR
          (metric_kind <> 'unavailable' AND memory_bytes IS NOT NULL))
);
CREATE INDEX app_observations_sample ON app_observations(sample_id);
CREATE INDEX app_observations_owner_app ON app_observations(owner_uid, app_id, created_at);

CREATE TABLE protection_rules (
    id TEXT PRIMARY KEY,
    owner_uid INTEGER NOT NULL CHECK(owner_uid >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    app_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('builtin','user')),
    protected INTEGER NOT NULL CHECK(protected IN (0,1)),
    UNIQUE(owner_uid, app_id),
    CHECK(source <> 'builtin' OR protected = 1)
);

CREATE TABLE action_receipts (
    id TEXT PRIMARY KEY,
    owner_uid INTEGER NOT NULL CHECK(owner_uid >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sample_id TEXT REFERENCES memory_samples(id) ON DELETE SET NULL,
    mode TEXT NOT NULL CHECK(mode IN ('live','demo')),
    status TEXT NOT NULL CHECK(status IN ('requested','observing','completed','partial','cancelled','timeout','rejected')),
    available_before INTEGER CHECK(available_before >= 0),
    available_after INTEGER CHECK(available_after >= 0),
    observed_delta INTEGER,
    CHECK(observed_delta IS NULL OR
          (available_before IS NOT NULL AND available_after IS NOT NULL AND
           observed_delta = available_after - available_before))
);
CREATE INDEX action_receipts_owner_time ON action_receipts(owner_uid, created_at);
CREATE INDEX action_receipts_sample ON action_receipts(sample_id);

CREATE TABLE action_items (
    id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL REFERENCES action_receipts(id) ON DELETE CASCADE,
    owner_uid INTEGER NOT NULL CHECK(owner_uid >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    app_id TEXT NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('requested','window_closed','still_running','cancelled','timeout','rejected')),
    reason_code TEXT NOT NULL,
    UNIQUE(action_id, app_id)
);
CREATE INDEX action_items_owner_app ON action_items(owner_uid, app_id);

-- Cross-table owner_uid consistency and current-UID authorization are enforced
-- in every store query and transaction. UI/window/PID tokens remain ephemeral.
