-- Apply once after migration-002, only when the coordinated rollout is approved.
ALTER TABLE runs ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE attempts ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE attempts ADD COLUMN budget_scope TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE planner_requests ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'owner';
CREATE TABLE run_access (run_id TEXT NOT NULL,principal_id TEXT NOT NULL,PRIMARY KEY(run_id,principal_id));
CREATE TABLE choices_v2 (principal_id TEXT NOT NULL,job_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(principal_id,job_id));
CREATE TABLE review_events_v2 (principal_id TEXT NOT NULL,event_id TEXT NOT NULL,job_id TEXT NOT NULL,revision INTEGER NOT NULL,payload_sha TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(principal_id,event_id),UNIQUE(principal_id,job_id,revision));
INSERT INTO choices_v2 SELECT 'owner',job_id,revision,payload FROM choices;
INSERT INTO review_events_v2 SELECT 'owner',event_id,job_id,revision,payload_sha,payload,created_at FROM review_events;
INSERT OR IGNORE INTO schema_version VALUES(3);
