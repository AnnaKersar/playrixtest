-- Local preparation only. Apply only in a coordinated rollout.
CREATE TABLE IF NOT EXISTS anonymous_sessions (token_hash TEXT PRIMARY KEY,principal_id TEXT UNIQUE NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guest_throttle (bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS owner_sessions (session_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
