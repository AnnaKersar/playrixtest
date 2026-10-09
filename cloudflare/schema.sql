-- Prepared schema only; not applied to any account.
CREATE TABLE runs (id TEXT PRIMARY KEY, frozen_r2_key TEXT NOT NULL, frozen_sha256 TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE image_jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, object_id TEXT NOT NULL, prompt_sha256 TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(run_id,object_id));
CREATE TABLE image_attempts (id TEXT PRIMARY KEY, job_id TEXT UNIQUE NOT NULL, status TEXT NOT NULL, reserved_nanodollars INTEGER NOT NULL, actual_nanodollars INTEGER, request_id TEXT, manifest_r2_key TEXT);
CREATE TABLE budget (id INTEGER PRIMARY KEY CHECK(id=1), ceiling_nanodollars INTEGER NOT NULL, historical_known_nanodollars INTEGER NOT NULL, historical_unknown_nanodollars INTEGER NOT NULL);
CREATE TABLE outbox (id TEXT PRIMARY KEY, job_id TEXT UNIQUE NOT NULL, state TEXT NOT NULL);
CREATE TABLE study_assets (run_id TEXT NOT NULL, object_id TEXT NOT NULL, asset_r2_key TEXT NOT NULL, frozen_candidates_r2_key TEXT NOT NULL, PRIMARY KEY(run_id,object_id));
CREATE TABLE review_events (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, object_id TEXT NOT NULL, revision INTEGER NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL, UNIQUE(run_id,object_id,revision));
