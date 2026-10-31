CREATE TABLE map_rate_limits (
  owner_id TEXT NOT NULL,
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (owner_id)
);
