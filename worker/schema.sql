CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  iv TEXT NOT NULL,
  passport_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_expires_at_idx ON shares(expires_at);
