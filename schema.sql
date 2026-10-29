CREATE TABLE IF NOT EXISTS ip_allowlist (
  ip TEXT PRIMARY KEY,
  expired TEXT NOT NULL,
  name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_allowlist_expired ON ip_allowlist (expired);
