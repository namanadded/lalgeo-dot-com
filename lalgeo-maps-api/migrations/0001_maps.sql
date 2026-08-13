PRAGMA foreign_keys = ON;

CREATE TABLE maps (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  center_lat REAL,
  center_lng REAL,
  zoom REAL,
  map_type TEXT NOT NULL DEFAULT 'standard',
  show_basemap_pois INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE TABLE layers (
  id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  geometry_type TEXT NOT NULL CHECK (geometry_type IN ('Point', 'LineString', 'Polygon')),
  style_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, map_id, id),
  FOREIGN KEY (owner_id, map_id) REFERENCES maps(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE features (
  id TEXT NOT NULL,
  layer_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, map_id, layer_id, id),
  FOREIGN KEY (owner_id, map_id, layer_id) REFERENCES layers(owner_id, map_id, id) ON DELETE CASCADE
);

CREATE INDEX maps_owner_updated ON maps(owner_id, updated_at DESC);
CREATE INDEX layers_map_position ON layers(owner_id, map_id, position);
CREATE INDEX features_layer_created ON features(owner_id, map_id, layer_id, created_at);
