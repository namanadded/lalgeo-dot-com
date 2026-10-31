# LalGeo Maps API

The private, owner-scoped authoring API behind the “Maps for humans and agents” promise. An authenticated client can create and revise maps, add typed layers and GeoJSON features, then export a portable `.lal` project or create a one-time link that opens an editable copy in LalGeo Maps.

## Choose the right API

- Use the [LalGeo Maps Snapshot API](https://maps.lalgeo.com/api-docs) without an account or Authoring API key when the goal is an immutable map that anyone with its link may read. Creation returns a private revocation token.
- Use this Authoring API when maps must stay behind a bearer key, remain isolated to one owner, and support ongoing CRUD and portable export.

Production authoring keys are provisioned by LalGeo. See the [developer guide](https://lalgeo.com/developers/) to request access. The two APIs have intentionally different privacy and lifecycle semantics; do not send private data to the Snapshot API.

## Production architecture

`https://api.lalgeo.com` is served by the existing `lalgeo-saas-api` Cloudflare Worker and its `lalgeo-business` D1 database. That Worker imports this implementation and routes Maps discovery, `/v1/maps`, and `/v1/map-open/redeem` requests to it. The standalone `wrangler.jsonc` in this directory exists for isolated local development only; do not deploy it or create a separate production database.

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
- `verify:local` applies the standalone migrations to disposable local D1 state, builds and starts the standalone Worker with synthetic scoped keys, exercises public `HEAD`, health, OpenAPI, auth, CORS, scope enforcement, atomic owner rate limiting, idempotent map/layer/feature creation and replay, conflict handling, one-time open-link redemption, and export through the Maps project validator and serializer. It validates all 17 JSON success payloads and representative 400/401/403/404/409/413/422/429/500/503 errors against the documented schemas, including concurrent quota admission and replay, rejection of an idempotency key reused for a different request, expired credentials, insufficient scopes, an invalid or reused capability, and isolated misconfiguration and unmigrated-D1 probes.
- `verify:maps-local` runs the same synthetic journey through `lalgeo-saas-api`, including the real `lalgeo-business` migration chain, hostname routing, host-wide HTTP-to-HTTPS redirect, and HSTS policy used by production.
- `deploy:dry-run` bundles the combined Worker without publishing it.
- `verify:production` sends public and unauthenticated `GET`, `HEAD`, and `OPTIONS` requests, one read-only `GET /v1/maps` with a newly randomized `lalgeo_synthetic_invalid_…` bearer, reserved idempotency- and rate-limit-store readiness `GET` requests, and one reserved map-open readiness `POST` to the canonical API. The synthetic bearer must return `401 UNAUTHORIZED`; `503 AUTH_NOT_CONFIGURED` proves the complete key document needs operator repair. It is never a usable owner credential and cannot mutate data. Exact health requests with `X-LalGeo-Readiness-Probe: map-idempotency-store-v1` and `X-LalGeo-Readiness-Probe: rate-limit-store-v1` each perform one bounded schema read, preserve the exact health JSON, and acknowledge their value. The out-of-grammar map-open token likewise performs one bounded schema `SELECT` before returning ordinary non-disclosing `404 OPEN_LINK_UNAVAILABLE`. Together these probes prove all three shared D1 tables are readable without creating, reading, consuming, or deleting user records. The verifier also requires a host-wide permanent HTTP-to-HTTPS redirect, one year of HSTS, public bodyless `HEAD` probes, browser-readable request and rate-limit headers, an unambiguous private Authoring API identity and access path, and the strict JSON, OpenAPI, auth, and CORS contracts. Positive key access still requires the owner-run synthetic acceptance journey.

All local gates use only disposable synthetic data and never contact production.

## Local development

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Replace the placeholders in `.dev.vars` with the SHA-256 hash of a development-only API key and a future RFC3339 expiry. `.dev.vars` is ignored by Git; never place a raw key in a tracked file.

`LALGEO_MAPS_API_KEYS` is a JSON object whose keys are SHA-256 API-key hashes. New entries use a descriptor with a stable owner ID, the required `maps:read` scope, optional `maps:write`, and a required RFC3339 expiry:

```json
{
  "<sha256-of-raw-api-key>": {
    "owner_id": "owner_demo",
    "scopes": ["maps:read", "maps:write"],
    "expires_at": "2026-12-31T23:59:59Z"
  }
}
```

`maps:read` permits protected `GET` operations, including export. Add `maps:write` to permit protected `POST`, `PATCH`, and `DELETE` operations, including one-time open-link creation. The supported profiles are read-only (`["maps:read"]`) and read/write (`["maps:read", "maps:write"]`). Write-only descriptors fail closed because update responses and map-open handoffs can reveal existing map data. Legacy hash-to-owner string entries remain accepted with full read/write access so existing keys keep working, but new and rotated keys should use expiring descriptors.

Send the raw key as `Authorization: Bearer <key>`. Protected authoring routes return `401 UNAUTHORIZED` with `WWW-Authenticate: Bearer realm="lalgeo-maps-api"` when the header is missing, invalid, or expired. A read-only key used for a write returns `403 INSUFFICIENT_SCOPE` and names `maps:write` in the response details and bearer challenge. A matched descriptor with an invalid owner, scope list, or expiry fails closed with `503 AUTH_NOT_CONFIGURED`. Health, OpenAPI discovery, and the capability-only redemption exchange are public. Canonical HTTP requests redirect permanently to HTTPS, and browser clients from an allowed origin can read the request, authentication, and rate-limit headers. Every map, layer, feature, and quota counter is owner-scoped.

Omit an `id` to generate one; an explicitly supplied `id` must be a valid string. Optional map and layer fields use defaults only when omitted—invalid values return `400` without changing stored data. A map center requires both numeric coordinates; use `{"center":null}` in a map `PATCH` to clear it, and `{"zoom":null}` to clear zoom. A layer position must be a safe integer.

## Retry creates safely

Send a fresh `Idempotency-Key` on `POST /v1/maps`, `POST /v1/maps/{mapId}/layers`, and `POST /v1/maps/{mapId}/layers/{layerId}/features` when an agent may retry after a timeout or lost response. The header is optional for compatibility, accepts 8–128 visible ASCII characters, and should normally be a UUID. Use a different key for every intended create operation.

The key is scoped to the authenticated owner. The API fingerprints the operation, path, and canonical JSON body: object property order is ignored, while array order remains meaningful. A successful `201` result is retained for 24 hours. Repeating the exact request during that window returns the original JSON with `Idempotency-Replayed: true` and the original `Idempotency-Key-Expires-At`; the first response uses `Idempotency-Replayed: false`. Reusing the key with a different operation, path, or body returns `422 IDEMPOTENCY_KEY_REUSED` and does not perform the second create.

Only a successful create consumes a key. Validation, authorization, and other failed attempts can be corrected and resent with that key. If a keyed create loses its response or returns the documented ambiguous `500`, retry the exact same operation, path, body, and key. Do not change the payload while keeping the key. The service stores only the key's SHA-256 hash, never the raw header value.

## Handle request limits

Each owner may start 300 requests to protected routes in a fixed 60-second UTC window. The Worker authenticates the key and verifies its scope first, then admits the request atomically before reading a body or resource. Public health, OpenAPI, and map-open redemption requests do not consume quota. Missing, invalid, expired, and insufficient-scope credentials do not consume it either. Once admitted, a request counts even if validation or resource lookup later fails; an exact idempotent replay also counts as one request.

Every admitted protected response includes `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. When the window is full, the API returns those headers with `429 RATE_LIMITED` and `Retry-After`; wait for that many seconds, then retry. Authentication and scope failures do not expose an owner's quota state. All keys for the same owner share one counter, which keeps rotation and multiple agents predictable. D1 stores one bounded counter row per owner and never stores a raw API key. If the counter table is unavailable, protected work fails closed with `503 RATE_LIMIT_NOT_CONFIGURED` before application work begins.

## Open an API map in Maps

Create a short-lived handoff only when a person is ready to open the map:

```sh
curl --fail-with-body --request POST \
  "https://api.lalgeo.com/v1/maps/calgary_field_map/open-links" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"expires_in":600}'
```

`expires_in` is optional, defaults to 600 seconds, and accepts safe integers from 60 through 900 seconds. The `201` response contains only `open_url` and `expires_at`; open the URL before it expires. Its exact shape is `https://maps.lalgeo.com/maps#open=<64 lowercase hex characters>`.

The fragment carries a random 256-bit, single-use capability. Browsers do not send URL fragments in HTTP requests or referrer headers, so the bearer API key never reaches LalGeo Maps or appears in the link. The API stores only its SHA-256 hash. Maps immediately removes the fragment from the address bar, then asks the person to choose **Open editable copy**. Only that explicit click redeems the capability through the public `POST /v1/map-open/redeem` exchange and imports the returned project as an editable local copy.

This is a handoff, not a write-through session: edits and exports in Maps do not change the API map. A redeemed, expired, malformed, or unknown capability returns the same non-disclosing `404 OPEN_LINK_UNAVAILABLE`. Request a new link after the first is consumed or expires. Treat an unredeemed link like a temporary secret and do not put it in logs, analytics, issues, or chat.

## Deployment

[`DEPLOYMENT.md`](DEPLOYMENT.md) is the owner-only migration, deployment, acceptance, and rollback runbook for the combined Worker. Do not apply remote migrations, publish the Worker, change credentials, or alter production infrastructure from automated runs.

## Contract

See [`openapi.json`](openapi.json), the [error and retry guide](ERRORS.md), and the public guide at [`../developers/index.html`](../developers/index.html). Every export and successful link redemption is accepted by the Maps project importer. An API map with no layers gets a deterministic `empty_points` layer only in the portable copy; the API map remains unchanged. WGS84 positions support longitude, latitude, and an optional finite altitude in metres. Client-supplied resource IDs still make intent explicit, while `Idempotency-Key` makes retries of the three create routes durable and unambiguous. A reused resource ID without a matching replay receipt returns `409 ID_CONFLICT` rather than silently changing an older record. Owner-scoped quota headers make backoff explicit without exposing key material.
