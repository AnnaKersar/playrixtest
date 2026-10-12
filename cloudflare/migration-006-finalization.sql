-- Add recovery state only. No ledger rewrite or deletion of existing artifacts.
CREATE TABLE IF NOT EXISTS finalization_jobs (
 job_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_retry_at INTEGER NOT NULL DEFAULT 0,
 public_error TEXT,updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS finalization_due ON finalization_jobs(state,next_retry_at,lease_until);
INSERT OR IGNORE INTO schema_version VALUES(6);
