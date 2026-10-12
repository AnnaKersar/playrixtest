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

-- Add recovery state only. No ledger rewrite or deletion of existing artifacts.
CREATE TABLE IF NOT EXISTS finalization_jobs (
 job_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_retry_at INTEGER NOT NULL DEFAULT 0,
 public_error TEXT,updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS finalization_due ON finalization_jobs(state,next_retry_at,lease_until);
INSERT OR IGNORE INTO schema_version VALUES(6);

-- Manual guest allowance periods; never rewrite previous attempts or actual costs.
CREATE TABLE IF NOT EXISTS guest_budget_resets(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT UNIQUE NOT NULL,epoch TEXT UNIQUE NOT NULL,principal_id TEXT NOT NULL,created_at TEXT NOT NULL,limit_nanodollars INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guest_budget_period(id INTEGER PRIMARY KEY CHECK(id=1),reset_id INTEGER NOT NULL,epoch TEXT NOT NULL);
INSERT OR IGNORE INTO schema_version VALUES(7);
-- Restore prior automated $1 closures only. Explicit manual financial decisions win.
-- No actual charge is changed; record previous values before increasing any hold.
CREATE TABLE IF NOT EXISTS unknown_hold_restorations(job_id TEXT PRIMARY KEY,previous_reservation INTEGER NOT NULL,restored_reservation INTEGER NOT NULL,previous_status TEXT NOT NULL,restored_at TEXT NOT NULL);
INSERT OR IGNORE INTO unknown_hold_restorations
SELECT a.job_id,a.reservation,
 MAX(a.reservation,COALESCE((SELECT MAX(json_extract(e.payload_json,'$.previous_reservation_nanodollars')) FROM experiment_journal_events e WHERE e.attempt_id=a.job_id),json_extract(j.input_json,'$.reservation_nanodollars'),a.reservation)),
 a.status,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM attempts a LEFT JOIN experiment_journal j ON j.attempt_id=a.job_id
WHERE a.mode='live' AND a.actual IS NULL AND a.status IN ('unknown','closed_reserved_unknown','complete')
 AND NOT EXISTS(SELECT 1 FROM schema_version WHERE version=8)
 AND EXISTS(SELECT 1 FROM experiment_journal_events e WHERE e.attempt_id=a.job_id AND (
  (e.event_type='automatic_accounting_reconciliation' AND json_extract(e.payload_json,'$.reservation_nanodollars')=1000000000 AND json_extract(e.payload_json,'$.actual_cost_nanodollars') IS NULL)
  OR e.event_id=a.job_id||':user-stop-reserve' OR e.event_id=a.job_id||':http-429-closed'))
 AND NOT EXISTS(SELECT 1 FROM experiment_journal_events m WHERE m.attempt_id=a.job_id
  AND m.event_type IN ('manual_accounting_closure','manual_accounting_reserve_adjustment') AND m.event_id<>a.job_id||':user-stop-reserve');
UPDATE attempts SET status='unknown',reservation=(SELECT restored_reservation FROM unknown_hold_restorations WHERE job_id=attempts.job_id)
WHERE actual IS NULL AND job_id IN (SELECT job_id FROM unknown_hold_restorations)
 AND NOT EXISTS(SELECT 1 FROM schema_version WHERE version=8);
INSERT OR IGNORE INTO schema_version VALUES(8);
