CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES (1);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, mode TEXT NOT NULL, name TEXT NOT NULL, frozen_key TEXT NOT NULL, frozen_sha TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, object_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', UNIQUE(run_id,object_id));
CREATE TABLE IF NOT EXISTS attempts (job_id TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL, reservation INTEGER NOT NULL, actual INTEGER, receipt_key TEXT, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (job_id TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS results (job_id TEXT PRIMARY KEY, raw_key TEXT NOT NULL, final_key TEXT NOT NULL, manifest_key TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), ceiling INTEGER NOT NULL CHECK(ceiling>=0), historical_known INTEGER NOT NULL CHECK(historical_known>=0), historical_unknown INTEGER NOT NULL CHECK(historical_unknown>=0), approved INTEGER NOT NULL DEFAULT 0);
-- No assumed approval or historical billing baseline.
INSERT OR IGNORE INTO budget VALUES (1,0,0,0,0);
CREATE TABLE IF NOT EXISTS candidates (job_id TEXT PRIMARY KEY, payload TEXT NOT NULL, payload_sha TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS choices (job_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS review_events (event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, revision INTEGER NOT NULL, payload_sha TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(job_id,revision));
