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
