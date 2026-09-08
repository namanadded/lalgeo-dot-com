# Maps API production deployment

This runbook is for the LalGeo owner. Repository automation may run the local and read-only checks, but it must not apply remote migrations, update secrets, publish Workers, change DNS, or write production data.

## Production architecture

Maps is part of the existing production API stack:

- Worker: `lalgeo-saas-api`
- D1 database: `lalgeo-business`
- Maps migration: `lalgeo-saas-api/migrations/0004_maps.sql`
- canonical Maps hostname: `https://api.lalgeo.com`
- existing Survey/SaaS hostname: `lalgeo-saas-api.namanadded.workers.dev`

The combined Worker imports `lalgeo-maps-api/src/index.ts`. Requests for Maps discovery and `/v1/maps` are routed to that implementation; all other routes retain the existing SaaS behavior. The custom domain and database already exist. Do not deploy the standalone `lalgeo-maps-api/wrangler.jsonc`, create a `lalgeo-maps` production database, or move DNS during a routine release.

## Current evidence

Last read-only canonical check: 2026-09-08 07:04 UTC.

- `GET https://api.lalgeo.com/v1/health` returned HTTP 200 with exactly `{"ok":true,"service":"lalgeo-maps-api","version":"v1"}` over valid TLS.
- `/v1/openapi.json` returned the canonical OpenAPI 3.1 document with 18 unique operations.
- an unauthenticated Maps request returned the documented JSON `401 UNAUTHORIZED` response and Bearer challenge;
- CORS allowed `https://maps.lalgeo.com` and did not allow an untrusted origin;
- `https://maps.lalgeo.com/maps` and the public developer guide both returned HTTP 200.

The initial combined-Worker release recorded an authenticated synthetic create/export/delete acceptance in [PR #146](https://github.com/namanadded/lalgeo-dot-com/pull/146). A read-only verifier cannot repeat that proof because it intentionally has no production key. Every release owner should still complete the synthetic open/edit/cleanup acceptance below.

## 1. Prove the repository state

Run the isolated implementation gate first:

```sh
cd lalgeo-maps-api
npm ci
npm run check
npm run verify:local
```

Then run the production composition gate:

```sh
cd ../lalgeo-saas-api
npm ci
npm run check
npm run deploy:dry-run
npm run verify:maps-local
```

The combined gate uses disposable local D1 state, applies migrations `0001` through the latest migration, sends a synthetic hostname-routed Maps journey through `lalgeo-saas-api`, and removes its temporary files. It must not require Cloudflare credentials or contact a remote database.

## 2. Inspect the existing Cloudflare targets

Owner only:

```sh
cd lalgeo-saas-api
npx wrangler whoami
npx wrangler versions list
npx wrangler d1 migrations list lalgeo-business --remote
npx wrangler secret list
```

Before changing anything, record the current Worker version, confirm the D1 binding still names `lalgeo-business`, and confirm both `D1_API_KEY` and `LALGEO_MAPS_API_KEYS` are present. `wrangler secret list` shows names, not values.

The secrets have separate responsibilities:

- `D1_API_KEY` protects existing non-Maps routes with `X-LalGeo-API-Key` and is mirrored to Netlify as `LALGEO_SAAS_API_KEY`.
- `LALGEO_MAPS_API_KEYS` is a complete JSON map of SHA-256 bearer-key hashes to Maps owner IDs.

Do not replace one with the other.

## 3. Apply additive migrations

Review every pending SQL file before applying it, then target the existing database:

```sh
npx wrangler d1 migrations apply lalgeo-business --remote
npx wrangler d1 migrations list lalgeo-business --remote
```

Never create a replacement database as part of a release. Maps migrations must remain additive or reversible and must not alter unrelated business tables.

## 4. Provision or rotate a Maps key when required

Skip this step when the current keys remain valid. The Worker secret cannot be read back, so the password-manager copy of the complete hash-to-owner document is the source of truth.

Generate a raw key only in a secure owner terminal:

```sh
LALGEO_NEW_RAW_KEY="$(openssl rand -hex 32)"
LALGEO_NEW_KEY_HASH="$(printf %s "$LALGEO_NEW_RAW_KEY" | shasum -a 256 | awk '{print $1}')"
printf 'raw key: %s\nhash: %s\n' "$LALGEO_NEW_RAW_KEY" "$LALGEO_NEW_KEY_HASH"
```

Store the raw key in the password manager. Add its hash and owner ID to the complete existing JSON document, then upload that full document when Wrangler prompts:

```sh
npx wrangler secret put LALGEO_MAPS_API_KEYS
unset LALGEO_NEW_KEY_HASH LALGEO_NEW_RAW_KEY
```

Uploading only the new entry would revoke every omitted key. For rotation, deploy a document containing both old and new hashes, verify the new key, then deploy a second complete document without the old hash. Never paste a raw key into source, configuration, a PR, an issue, logs, or chat.

## 5. Deploy the combined Worker

Build once more without publishing, then deploy only `lalgeo-saas-api`:

```sh
npm run deploy:dry-run
npm run deploy
```

Record the commit and new Worker version. If Cloudflare Git integration owns the release, verify its production build references the intended commit and do not run a second manual deploy.

A generic `workers.dev` preview does not have the `api.lalgeo.com` hostname, so its `/v1/health` response alone cannot prove hostname routing. The local combined gate covers that branch safely; canonical acceptance after deployment is authoritative.

## 6. Verify the canonical API without credentials

```sh
cd ../lalgeo-maps-api
npm run verify:production
```

The verifier sends only credential-free `GET` and `OPTIONS` requests. It must pass without `--insecure`, redirects, a custom host header, response overrides, or fallback HTML.

## 7. Accept with one synthetic map

This step writes a synthetic record to production and deletes it. Run it only as the owner, after the read-only verifier passes, using a dedicated acceptance key when possible.

```sh
LALGEO_API_BASE="https://api.lalgeo.com"
LALGEO_API_KEY="REPLACE_WITH_ACCEPTANCE_KEY"
LALGEO_ACCEPTANCE_MAP="owner_acceptance_YYYYMMDD"

curl --fail-with-body "$LALGEO_API_BASE/v1/maps" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  -H "Content-Type: application/json" \
  --data "{\"id\":\"$LALGEO_ACCEPTANCE_MAP\",\"name\":\"Synthetic API acceptance\",\"center\":{\"latitude\":51.0447,\"longitude\":-114.0719},\"zoom\":12}"

curl --fail-with-body "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP/layers" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"id":"places","name":"Places","geometry_type":"Point"}'

curl --fail-with-body "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP/layers/places/features" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  -H "Content-Type: application/geo+json" \
  --data '{"type":"Feature","id":"central_library","geometry":{"type":"Point","coordinates":[-114.051,51.0453]},"properties":{"name":"Central Library","source":"synthetic acceptance"}}'

curl --fail-with-body "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP/export" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  --output /tmp/lalgeo-api-acceptance.lal
```

Open `https://maps.lalgeo.com/maps`, choose **Projects → Choose files**, and select `/tmp/lalgeo-api-acceptance.lal`. Confirm that the project opens at Calgary, the Places layer contains one Central Library point, and an edit survives export and reopen.

Always remove the synthetic server record, including when the visual check fails:

```sh
curl --fail-with-body --request DELETE "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP" \
  -H "Authorization: Bearer $LALGEO_API_KEY"
unset LALGEO_API_KEY LALGEO_API_BASE LALGEO_ACCEPTANCE_MAP
```

Also smoke-test one existing Survey/SaaS journey so the shared deployment cannot silently regress the non-Maps surface.

## Rollback

Keep the custom domain and D1 binding in place. Roll the shared Worker back to the version recorded before deployment:

```sh
cd lalgeo-saas-api
npx wrangler versions list
npx wrangler rollback REPLACE_WITH_LAST_GOOD_VERSION --message "Rollback shared API release"
cd ../lalgeo-maps-api
npm run verify:production
```

The Maps tables are additive and can remain unused after a Worker rollback. Do not improvise a down migration, delete shared D1 data, restore the former Netlify DNS target, or detach the custom domain.

## Acceptance record

Attach these items to the release review:

- commit, Cloudflare build, and Worker version;
- isolated Maps API check and local release-gate output;
- combined Worker type-check, dry-run bundle metrics, migration list, and local Maps gate output;
- canonical read-only verifier output;
- synthetic `.lal` open/edit/export/reopen result and delete response;
- one existing Survey/SaaS smoke result;
- risk notes, rollback version, and the operator who retained the credential source of truth.
