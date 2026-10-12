// Fixed, versioned upgrade used by the explicit owner budget-reset action.
// Never accepts arbitrary SQL or invokes a paid provider. D1 batch is atomic.
export const RELIABILITY_UPGRADE_STATEMENTS=[
  "CREATE TABLE IF NOT EXISTS finalization_jobs (\n job_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,\n lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_retry_at INTEGER NOT NULL DEFAULT 0,\n public_error TEXT,updated_at INTEGER NOT NULL DEFAULT 0\n)",
  "CREATE INDEX IF NOT EXISTS finalization_due ON finalization_jobs(state,next_retry_at,lease_until)",
  "INSERT OR IGNORE INTO schema_version VALUES(6)",
  "CREATE TABLE IF NOT EXISTS guest_budget_resets(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT UNIQUE NOT NULL,epoch TEXT UNIQUE NOT NULL,principal_id TEXT NOT NULL,created_at TEXT NOT NULL,limit_nanodollars INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS guest_budget_period(id INTEGER PRIMARY KEY CHECK(id=1),reset_id INTEGER NOT NULL,epoch TEXT NOT NULL)",
  "INSERT OR IGNORE INTO schema_version VALUES(7)",
  "CREATE TABLE IF NOT EXISTS unknown_hold_restorations(job_id TEXT PRIMARY KEY,previous_reservation INTEGER NOT NULL,restored_reservation INTEGER NOT NULL,previous_status TEXT NOT NULL,restored_at TEXT NOT NULL)",
  "INSERT OR IGNORE INTO unknown_hold_restorations\nSELECT a.job_id,a.reservation,\n MAX(a.reservation,COALESCE((SELECT MAX(json_extract(e.payload_json,'$.previous_reservation_nanodollars')) FROM experiment_journal_events e WHERE e.attempt_id=a.job_id),json_extract(j.input_json,'$.reservation_nanodollars'),a.reservation)),\n a.status,strftime('%Y-%m-%dT%H:%M:%fZ','now')\nFROM attempts a LEFT JOIN experiment_journal j ON j.attempt_id=a.job_id\nWHERE a.mode='live' AND a.actual IS NULL AND a.status IN ('unknown','closed_reserved_unknown','complete')\n AND NOT EXISTS(SELECT 1 FROM schema_version WHERE version=8)\n AND EXISTS(SELECT 1 FROM experiment_journal_events e WHERE e.attempt_id=a.job_id AND (\n  (e.event_type='automatic_accounting_reconciliation' AND json_extract(e.payload_json,'$.reservation_nanodollars')=1000000000 AND json_extract(e.payload_json,'$.actual_cost_nanodollars') IS NULL)\n  OR e.event_id=a.job_id||':user-stop-reserve' OR e.event_id=a.job_id||':http-429-closed'))\n AND NOT EXISTS(SELECT 1 FROM experiment_journal_events m WHERE m.attempt_id=a.job_id\n  AND m.event_type IN ('manual_accounting_closure','manual_accounting_reserve_adjustment') AND m.event_id<>a.job_id||':user-stop-reserve')",
  "UPDATE attempts SET status='unknown',reservation=(SELECT restored_reservation FROM unknown_hold_restorations WHERE job_id=attempts.job_id)\nWHERE actual IS NULL AND job_id IN (SELECT job_id FROM unknown_hold_restorations)\n AND NOT EXISTS(SELECT 1 FROM schema_version WHERE version=8)",
  "INSERT OR IGNORE INTO schema_version VALUES(8)"
];
export async function applyReliabilityUpgrade(env){
 await env.DB.batch(RELIABILITY_UPGRADE_STATEMENTS.map(sql=>env.DB.prepare(sql)));
 return {schema_version:8,provider_calls:0};
}
