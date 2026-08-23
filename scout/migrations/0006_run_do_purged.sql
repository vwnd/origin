-- When the reaper confirmed this run's InspectionAgent storage was destroyed.
-- The purge sweep only considers rows where this is NULL, so a version's
-- Durable Object is woken for teardown exactly once — destroying an already
-- destroyed object would otherwise recreate it just to kill it again.
ALTER TABLE runs ADD COLUMN do_purged_at TEXT;
