-- What the scout scoped itself to — or why it had nothing to inspect — so a
-- quiet run reads as "nothing in scope" rather than "clean model".
ALTER TABLE scout_runs ADD COLUMN note TEXT;
