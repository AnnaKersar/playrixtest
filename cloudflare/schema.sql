CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES (1);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, mode TEXT NOT NULL, name TEXT NOT NULL, frozen_key TEXT NOT NULL, frozen_sha TEXT NOT NULL, created_at TEXT NOT NULL, principal_id TEXT NOT NULL DEFAULT 'owner');
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, object_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', UNIQUE(run_id,object_id));
CREATE TABLE IF NOT EXISTS attempts (job_id TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL, reservation INTEGER NOT NULL, actual INTEGER, receipt_key TEXT, error TEXT, created_at TEXT NOT NULL, principal_id TEXT NOT NULL DEFAULT 'owner', budget_scope TEXT NOT NULL DEFAULT 'owner');
CREATE TABLE IF NOT EXISTS outbox (job_id TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS results (job_id TEXT PRIMARY KEY, raw_key TEXT NOT NULL, final_key TEXT NOT NULL, manifest_key TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), ceiling INTEGER NOT NULL CHECK(ceiling>=0), historical_known INTEGER NOT NULL CHECK(historical_known>=0), historical_unknown INTEGER NOT NULL CHECK(historical_unknown>=0), approved INTEGER NOT NULL DEFAULT 0);
-- No assumed approval or historical billing baseline.
INSERT OR IGNORE INTO budget VALUES (1,0,0,0,0);
CREATE TABLE IF NOT EXISTS candidates (job_id TEXT PRIMARY KEY, payload TEXT NOT NULL, payload_sha TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS choices (job_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS review_events (event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, revision INTEGER NOT NULL, payload_sha TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(job_id,revision));

CREATE TABLE IF NOT EXISTS planner_requests (id TEXT PRIMARY KEY,input_key TEXT NOT NULL,input_sha TEXT NOT NULL,status TEXT NOT NULL,result_key TEXT,principal_id TEXT NOT NULL DEFAULT 'owner');

CREATE TABLE IF NOT EXISTS run_access (run_id TEXT NOT NULL,principal_id TEXT NOT NULL,PRIMARY KEY(run_id,principal_id));
CREATE TABLE IF NOT EXISTS choices_v2 (principal_id TEXT NOT NULL,job_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(principal_id,job_id));
CREATE TABLE IF NOT EXISTS review_events_v2 (principal_id TEXT NOT NULL,event_id TEXT NOT NULL,job_id TEXT NOT NULL,revision INTEGER NOT NULL,payload_sha TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(principal_id,event_id),UNIQUE(principal_id,job_id,revision));
INSERT OR IGNORE INTO choices_v2 SELECT 'owner',job_id,revision,payload FROM choices;
INSERT OR IGNORE INTO review_events_v2 SELECT 'owner',event_id,job_id,revision,payload_sha,payload,created_at FROM review_events;
INSERT OR IGNORE INTO schema_version VALUES(3);

-- Local preparation only. Apply only in a coordinated rollout.
CREATE TABLE IF NOT EXISTS anonymous_sessions (token_hash TEXT PRIMARY KEY,principal_id TEXT UNIQUE NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guest_throttle (bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS owner_sessions (session_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS experiment_journal (attempt_id TEXT PRIMARY KEY,input_json TEXT NOT NULL,input_sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiment_journal_events (event_id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,event_type TEXT NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS experiment_journal_events_attempt ON experiment_journal_events(attempt_id,created_at);
CREATE TRIGGER IF NOT EXISTS journal_input_no_update BEFORE UPDATE ON experiment_journal BEGIN SELECT RAISE(ABORT,'Experiment input is immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_input_no_delete BEFORE DELETE ON experiment_journal BEGIN SELECT RAISE(ABORT,'Experiment input is immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_event_no_update BEFORE UPDATE ON experiment_journal_events BEGIN SELECT RAISE(ABORT,'Journal events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_event_no_delete BEFORE DELETE ON experiment_journal_events BEGIN SELECT RAISE(ABORT,'Journal events are immutable'); END;
INSERT OR IGNORE INTO schema_version VALUES(5);
