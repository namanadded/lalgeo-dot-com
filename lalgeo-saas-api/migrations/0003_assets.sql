CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  condition TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT,
  attributes_json TEXT,
  organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_assets_org_updated ON assets(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_org_status ON assets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_org_type ON assets(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_assets_org_condition ON assets(organization_id, condition);

CREATE TABLE IF NOT EXISTS asset_activities (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_asset_activities_org_created ON asset_activities(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_activities_asset_created ON asset_activities(asset_id, created_at DESC);
