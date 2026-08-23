-- One row per inspection run, so Analytics has history that survives the
-- Workflows instance-retention window and does not depend on the browser
-- remembering instance ids.
CREATE TABLE IF NOT EXISTS runs (
  instance_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  model_name TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  indexed_objects INTEGER,
  findings INTEGER,
  deltas INTEGER,
  cost_usd REAL,
  issue_identifier TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
