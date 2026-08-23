-- Proof of life for in-flight runs. The index step stamps this as it streams,
-- so the reaper cron can tell a slow load from a dead one instead of judging
-- by started_at alone.
ALTER TABLE runs ADD COLUMN last_progress_at TEXT;
