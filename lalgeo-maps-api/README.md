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
- `verify:local` applies the standalone migrations to disposable local D1 state, builds and starts the standalone Worker with synthetic scoped keys, exercises public `HEAD`, health, OpenAPI, auth, CORS, scope enforcement, map/layer/feature creation, conflict handling, one-time open-link redemption, and export through the Maps project validator and serializer. It validates all 17 JSON success payloads and representative 400/401/403/404/409/413/500/503 errors against the documented schemas, including rejection of expired credentials, insufficient scopes, an invalid or reused capability, and isolated misconfiguration and unmigrated-D1 probes for 503 and 500.
- `verify:maps-local` runs the same synthetic journey through `lalgeo-saas-api`, including the real `lalgeo-business` migration chain, hostname routing, host-wide HTTP-to-HTTPS redirect, and HSTS policy used by production.
- `deploy:dry-run` bundles the combined Worker without publishing it.
- `verify:production` sends only unauthenticated `GET`, `HEAD`, and `OPTIONS` requests to the canonical API. It requires a host-wide permanent HTTP-to-HTTPS redirect, one year of HSTS, public bodyless `HEAD` probes, browser-readable request IDs, an unambiguous private Authoring API identity and access path, and the existing strict JSON, OpenAPI, auth, and CORS contracts. It never sends a key or mutates data.

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

Send the raw key as `Authorization: Bearer <key>`. Protected authoring routes return `401 UNAUTHORIZED` with `WWW-Authenticate: Bearer realm="lalgeo-maps-api"` when the header is missing, invalid, or expired. A read-only key used for a write returns `403 INSUFFICIENT_SCOPE` and names `maps:write` in the response details and bearer challenge. A matched descriptor with an invalid owner, scope list, or expiry fails closed with `503 AUTH_NOT_CONFIGURED`. Health, OpenAPI discovery, and the capability-only redemption exchange are public. Canonical HTTP requests redirect permanently to HTTPS, and browser clients from an allowed origin can read `X-Request-Id` and `WWW-Authenticate`. Every map, layer, and feature query is owner-scoped.

Omit an `id` to generate one; an explicitly supplied `id` must be a valid string. Optional map and layer fields use defaults only when omitted—invalid values return `400` without changing stored data. A map center requires both numeric coordinates; use `{"center":null}` in a map `PATCH` to clear it, and `{"zoom":null}` to clear zoom. A layer position must be a safe integer.

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

See [`openapi.json`](openapi.json), the [error and retry guide](ERRORS.md), and the public guide at [`../developers/index.html`](../developers/index.html). Every export and successful link redemption is accepted by the Maps project importer. An API map with no layers gets a deterministic `empty_points` layer only in the portable copy; the API map remains unchanged. WGS84 positions support longitude, latitude, and an optional finite altitude in metres. Client-supplied resource IDs make duplicate retries detectable: a reused ID returns `409 ID_CONFLICT` rather than silently creating another record. Durable `Idempotency-Key` replay semantics are not implemented yet, so an agent should always supply stable IDs and reconcile a timeout with `GET` before retrying.
