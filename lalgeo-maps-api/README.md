# LalGeo Maps API

The agent-facing API behind the “Maps for humans and agents” promise. An authenticated client can create maps, add typed layers and GeoJSON features, then export a portable `.lal` project that opens in LalGeo Maps.

The Worker is not production-ready merely because the website or CI responds. Treat `https://api.lalgeo.com` as released only when the strict read-only production verifier passes.

## Release checks

```sh
npm ci
npm run check
npm run verify:local
npm run verify:production
```

- `check` type-checks the Worker and runs static contract tests.
- `verify:local` creates disposable local D1 state, applies every migration, builds a Wrangler deployment bundle, starts the Worker with a synthetic key, and exercises health, OpenAPI, auth, CORS, map/layer/feature creation, conflict handling, and Maps-compatible export. It never contacts production.
- `verify:production` sends only unauthenticated `GET` and `OPTIONS` requests. It rejects invalid TLS, redirects, HTML/fallback responses, incomplete discovery, missing bearer challenges, and incorrect CORS. It never sends a key or mutates data.

To verify a Worker preview or another candidate hostname without weakening the checks:

```sh
npm run verify:production -- --base-url https://candidate.example.workers.dev
```

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

The local release gate is the quickest safe way to test authentication end to end:

```sh
npm run verify:local
```

## Deployment

[`DEPLOYMENT.md`](DEPLOYMENT.md) is the owner-only first-deploy, acceptance, and rollback runbook. It covers the placeholder D1 binding and the existing `api.lalgeo.com` DNS conflict. Do not apply remote migrations, publish the Worker, change DNS, or set secrets from automated runs.

## Contract

See [`openapi.json`](openapi.json) and the public guide at [`../developers/index.html`](../developers/index.html). Client-supplied resource IDs make duplicate retries detectable: a reused ID returns `409 ID_CONFLICT` rather than silently creating another record. Durable `Idempotency-Key` replay semantics are not implemented yet, so an agent should always supply stable IDs and reconcile a timeout with `GET` before retrying.
