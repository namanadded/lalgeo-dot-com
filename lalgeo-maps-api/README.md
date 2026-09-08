# LalGeo Maps API

The agent-facing API behind the “Maps for humans and agents” promise. An authenticated client can create maps, add typed layers and GeoJSON features, then export a portable `.lal` project that opens in LalGeo Maps.

## Production architecture

`https://api.lalgeo.com` is served by the existing `lalgeo-saas-api` Cloudflare Worker and its `lalgeo-business` D1 database. That Worker imports this implementation and routes Maps discovery and `/v1/maps` requests to it. The standalone `wrangler.jsonc` in this directory exists for isolated local development only; do not deploy it or create a separate production database.

A website response, successful standalone build, or generic Worker preview does not prove the production composition. Release work must pass both the isolated contract gate and the combined-Worker gate.

## Release checks

First prove this implementation with disposable standalone state:

```sh
npm ci
npm run check
npm run verify:local
```

Then prove the artifact and migration chain that production actually uses:

```sh
cd ../lalgeo-saas-api
npm ci
npm run check
npm run deploy:dry-run
npm run verify:maps-local
```

- `check` type-checks the selected Worker and runs the Maps API contract tests where applicable.
- `verify:local` applies the standalone migrations to disposable local D1 state, builds and starts the standalone Worker with a synthetic key, and exercises health, OpenAPI, auth, CORS, map/layer/feature creation, conflict handling, and export through the Maps project validator and serializer.
- `verify:maps-local` runs the same synthetic journey through `lalgeo-saas-api`, including the real `lalgeo-business` migration chain and hostname routing used by production.
- `deploy:dry-run` bundles the combined Worker without publishing it.
- `verify:production` sends only unauthenticated `GET` and `OPTIONS` requests to the canonical API. It rejects invalid TLS, redirects, HTML/fallback responses, incomplete discovery, missing bearer challenges, and incorrect CORS. It never sends a key or mutates data.

All local gates use only disposable synthetic data and never contact production.

## Local development

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Replace the placeholder in `.dev.vars` with the SHA-256 hash of a development-only API key. `.dev.vars` is ignored by Git; never place a raw key in a tracked file.

`LALGEO_MAPS_API_KEYS` is a JSON object whose keys are SHA-256 API-key hashes and whose values are stable owner IDs:

```json
{"<sha256-of-raw-api-key>": "owner_demo"}
```

Send the raw key as `Authorization: Bearer <key>`. Data routes return `401 UNAUTHORIZED` with `WWW-Authenticate: Bearer realm="lalgeo-maps-api"` when the header is missing or invalid. Health and OpenAPI discovery are public. Every map, layer, and feature query is owner-scoped.

## Deployment

[`DEPLOYMENT.md`](DEPLOYMENT.md) is the owner-only migration, deployment, acceptance, and rollback runbook for the combined Worker. Do not apply remote migrations, publish the Worker, change credentials, or alter production infrastructure from automated runs.

## Contract

See [`openapi.json`](openapi.json) and the public guide at [`../developers/index.html`](../developers/index.html). Every export is accepted by the Maps project importer. An API map with no layers gets a deterministic `empty_points` layer only in the portable copy; the API map remains unchanged. WGS84 positions support longitude, latitude, and an optional finite altitude in metres. Client-supplied resource IDs make duplicate retries detectable: a reused ID returns `409 ID_CONFLICT` rather than silently creating another record. Durable `Idempotency-Key` replay semantics are not implemented yet, so an agent should always supply stable IDs and reconcile a timeout with `GET` before retrying.
