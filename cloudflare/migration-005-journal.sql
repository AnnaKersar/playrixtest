CREATE TABLE IF NOT EXISTS experiment_journal (attempt_id TEXT PRIMARY KEY,input_json TEXT NOT NULL,input_sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiment_journal_events (event_id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,event_type TEXT NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS experiment_journal_events_attempt ON experiment_journal_events(attempt_id,created_at);
CREATE TRIGGER IF NOT EXISTS journal_input_no_update BEFORE UPDATE ON experiment_journal BEGIN SELECT RAISE(ABORT,'Experiment input is immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_input_no_delete BEFORE DELETE ON experiment_journal BEGIN SELECT RAISE(ABORT,'Experiment input is immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_event_no_update BEFORE UPDATE ON experiment_journal_events BEGIN SELECT RAISE(ABORT,'Journal events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_event_no_delete BEFORE DELETE ON experiment_journal_events BEGIN SELECT RAISE(ABORT,'Journal events are immutable'); END;
INSERT OR IGNORE INTO schema_version VALUES(5);
