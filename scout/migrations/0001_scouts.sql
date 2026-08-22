-- Metadata for scouts. The markdown body lives in R2 under `scouts/<id>.md`;
-- this table is the index over it, so listing does not need an R2 scan.
CREATE TABLE IF NOT EXISTS scouts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scouts_enabled ON scouts(enabled);
