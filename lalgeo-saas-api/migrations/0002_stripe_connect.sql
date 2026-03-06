ALTER TABLE organizations ADD COLUMN stripe_connect_account_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_charges_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN stripe_payouts_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN stripe_details_submitted INTEGER NOT NULL DEFAULT 0;
