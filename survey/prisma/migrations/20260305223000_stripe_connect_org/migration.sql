-- Add Stripe Connect fields for per-organization payment onboarding
ALTER TABLE "Organization" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
