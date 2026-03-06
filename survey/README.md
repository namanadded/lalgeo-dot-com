# LalGeo Survey Web

Runs a survey builder + public survey links under `/survey`.

## Local storage
Defaults to `/Volumes/LALGEO_CLOUD/surveys`.
Override with:

```
LALGEO_STORAGE_ROOT=/Volumes/LALGEO_CLOUD/surveys
LALGEO_JWT_SECRET=change-this-in-production
```

## Run
```
npm install
npm run dev
```
Then open `http://localhost:3000/survey`.

## Notes
- First visit will prompt for admin setup.
- Each survey is capped at 100 MB including attachments.
- `.lal` exports include `survey.csv`, `survey.json`, and `metadata.json`.

## Reset DB
Use these steps to reset the local SQLite DB used by SaaS pages:

```bash
cd /Users/namanmalhotra/Documents/Work/Lal_Geo/lalgeo_dot_com/survey
pkill -f "next dev" || true
rm -f dev.db
rm -rf prisma/migrations
npx prisma migrate dev --name init
npm run prisma:seed
```

## Phase 1: Netlify UI + Cloudflare Worker (D1)
SaaS pages under `/survey/app/*` can read/write business data via Worker API.

Required env vars in Netlify:

```bash
LALGEO_SAAS_API_URL="https://lalgeo-saas-api.namanadded.workers.dev"
LALGEO_SAAS_API_KEY="<optional-shared-secret-if-configured>"
DATABASE_URL="file:./dev.db"
```

## Stripe Payments (cards + Apple Pay + Google Pay)
Add these env vars in Netlify for invoice payments:

```bash
STRIPE_SECRET_KEY="<stripe-secret-key>"
STRIPE_WEBHOOK_SECRET="<stripe-webhook-signing-secret>"
APP_URL="https://cloud.lalgeo.com"
```

Then in Stripe Dashboard:
1. Create webhook endpoint: `https://cloud.lalgeo.com/api/payments/stripe/webhook`
2. Subscribe to event: `checkout.session.completed`
3. In Settings, click **Connect Stripe Account** for each organization (Stripe Connect Express onboarding).
4. After onboarding, use **Refresh Stripe Status** in Settings; `charges_enabled` must be `true`.

`DATABASE_URL` stays for legacy Prisma-backed routes still used by OAuth/email internals.

Apply D1 migrations:

```bash
cd /Users/namanmalhotra/Documents/Work/Lal_Geo/lalgeo_dot_com/lalgeo-saas-api
npx wrangler d1 migrations apply lalgeo-business --remote
```

Also apply Prisma migration if using local SQLite directly:

```bash
cd /Users/namanmalhotra/Documents/Work/Lal_Geo/lalgeo_dot_com/survey
npx prisma migrate deploy
```
