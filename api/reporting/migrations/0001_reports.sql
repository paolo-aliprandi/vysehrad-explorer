CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  photo BLOB NOT NULL,
  photo_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  issue_number INTEGER
);
CREATE INDEX reports_expiry ON reports(expires_at);
CREATE INDEX reports_delivery ON reports(status, updated_at);

CREATE TABLE submission_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX submission_limits_expiry ON submission_limits(expires_at);
