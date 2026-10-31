CREATE TABLE map_idempotency_keys (
  owner_id TEXT NOT NULL,
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  operation TEXT NOT NULL CHECK (operation IN ('createMap', 'createLayer', 'createFeatures')),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
  response_status INTEGER NOT NULL CHECK (response_status = 201),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, key_hash)
);

CREATE INDEX map_idempotency_keys_expiry ON map_idempotency_keys(expires_at);
