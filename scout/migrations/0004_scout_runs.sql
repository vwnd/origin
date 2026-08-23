-- One row per scout per inspection run, so Analytics can show what each
-- member of the fleet is doing while a run is in flight — and what it
-- found, filed, and cost once it is done.
CREATE TABLE IF NOT EXISTS scout_runs (
  instance_id TEXT NOT NULL,
  scout_id TEXT NOT NULL,
  scout_title TEXT NOT NULL,
  status TEXT NOT NULL,
  findings INTEGER,
  deltas INTEGER,
  cost_usd REAL,
  issue_identifier TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  PRIMARY KEY (instance_id, scout_id)
);

CREATE INDEX IF NOT EXISTS idx_scout_runs_instance ON scout_runs(instance_id);
