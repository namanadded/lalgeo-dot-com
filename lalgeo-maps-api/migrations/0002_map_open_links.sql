PRAGMA foreign_keys = ON;

CREATE TABLE map_open_links (
  token_hash TEXT NOT NULL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id, map_id) REFERENCES maps(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX map_open_links_expires ON map_open_links(expires_at);
