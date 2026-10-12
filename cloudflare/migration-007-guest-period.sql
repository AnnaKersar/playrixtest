-- Manual guest allowance periods; never rewrite previous attempts or actual costs.
CREATE TABLE IF NOT EXISTS guest_budget_resets(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT UNIQUE NOT NULL,epoch TEXT UNIQUE NOT NULL,principal_id TEXT NOT NULL,created_at TEXT NOT NULL,limit_nanodollars INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guest_budget_period(id INTEGER PRIMARY KEY CHECK(id=1),reset_id INTEGER NOT NULL,epoch TEXT NOT NULL);
INSERT OR IGNORE INTO schema_version VALUES(7);
