# LalGeo production API Worker

This Cloudflare Worker is the shared production artifact for two surfaces:

- `https://api.lalgeo.com`: the agent-facing Maps API, using bearer keys and the `/v1/maps` contract imported from `../lalgeo-maps-api`;
- `lalgeo-saas-api.namanadded.workers.dev`: the existing Survey/SaaS routes used by the Netlify-hosted `survey/app/*` application.

Both surfaces use the existing `lalgeo-business` D1 database configured in `wrangler.jsonc`. Maps tables are additive and begin in `migrations/0004_maps.sql`. Do not create a second Maps Worker or D1 database for production.

## Repository checks

```sh
npm ci
npm run check
npm run deploy:dry-run
npm run verify:maps-local
```

- `check` type-checks the combined Worker, including the imported Maps implementation.
- `deploy:dry-run` builds the exact Worker entry point without publishing it.
- `verify:maps-local` applies this directory's complete migration chain to disposable local state and runs the Maps API create/export/delete journey through the combined Worker. It uses only a synthetic local bearer key and never contacts Cloudflare production.

## Authentication boundaries

The two API surfaces deliberately use separate secrets:

- `D1_API_KEY` protects the existing non-Maps routes through `X-LalGeo-API-Key`; its raw value is mirrored to Netlify as `LALGEO_SAAS_API_KEY`.
- `LALGEO_MAPS_API_KEYS` protects Maps data routes through `Authorization: Bearer <key>`. Its value is a JSON object mapping SHA-256 key hashes to stable owner IDs. Raw Maps keys must stay in the owner's password manager and must never be committed or uploaded as plain text.

Health and OpenAPI discovery on `api.lalgeo.com` are public. Maps resources remain owner-scoped. Changing one secret must not overwrite or weaken the other authentication path.

## Production changes

Remote migrations, secret updates, and deploys are owner-only operations. Follow [`../lalgeo-maps-api/DEPLOYMENT.md`](../lalgeo-maps-api/DEPLOYMENT.md) for preflight, the exact `lalgeo-business` migration target, canonical verification, synthetic acceptance, and rollback. The custom domain is already attached; routine releases must not change DNS.
