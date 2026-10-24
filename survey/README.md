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

## Hosted LalGeo MCP

This Netlify site packages the adapter served at `https://mcp.lalgeo.com/mcp`. The public `/health` route is only a process check. Every `/mcp` request must send the caller's LalGeo Authoring API key as a bearer credential; the function validates that key read-only and never uses `LALGEO_API_KEY` as a shared Maps identity. `MAPKIT_TOKEN` remains a server-side dependency for the `geocode` tool.

The static bearer path is for generic MCP clients with protected connection settings. ChatGPT requires OAuth 2.1 for authenticated public MCP and cannot present a custom API key, so use the local Secure MCP Tunnel workflow in [`../lalgeo-mcp/README.md`](../lalgeo-mcp/README.md) until LalGeo implements OAuth.

Before deployment, build the MCP package and the Netlify site, verify the generated function archive, then run the credential-free boundary check against the preview:

```bash
npm ci
npx netlify build --offline
npm run test:mcp-package
npm --prefix ../lalgeo-mcp run verify:hosted -- https://deploy-preview-000--lalgeosurvey.netlify.app
```

The remote verifier sends no real key and invokes no tool. It checks one missing credential and one clearly synthetic invalid credential. A passing preview must return exact health JSON and reject both MCP initialization requests with `401`; a successful website fallback is a failure, while `503` on the synthetic probe identifies an unavailable Authoring API authentication configuration.

For production, deploy the fail-closed function first and run the same verifier against `https://mcp.lalgeo.com`. Only after that endpoint returns the exact `401` challenge should an owner remove the legacy `LALGEO_API_KEY` from this Netlify site's environment; the hosted function no longer reads it. Keep `MAPKIT_TOKEN`, then rerun the verifier. This order makes a rollback fail unavailable instead of silently restoring a shared Maps identity.

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

The Worker and D1 database are shared with the Maps API. Before any remote migration or Worker deploy, run the combined checks and follow [`../lalgeo-maps-api/DEPLOYMENT.md`](../lalgeo-maps-api/DEPLOYMENT.md); do not deploy the standalone Maps Worker or create a replacement database.

Apply reviewed D1 migrations to the existing database:

```bash
cd /Users/namanmalhotra/Documents/Work/Lal_Geo/lalgeo_dot_com/lalgeo-saas-api
npx wrangler d1 migrations apply lalgeo-business --remote
```

Also apply Prisma migration if using local SQLite directly:

```bash
cd /Users/namanmalhotra/Documents/Work/Lal_Geo/lalgeo_dot_com/survey
npx prisma migrate deploy
```
