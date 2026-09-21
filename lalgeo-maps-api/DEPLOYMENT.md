# Maps API production deployment

This runbook is for the LalGeo owner. Repository automation may run the local and read-only checks, but it must not apply remote migrations, update secrets, publish Workers, change DNS, or write production data.

## Production architecture

Maps is part of the existing production API stack:

- Worker: `lalgeo-saas-api`
- D1 database: `lalgeo-business`
- Maps migrations: `lalgeo-saas-api/migrations/0004_maps.sql` and additive `0005_map_open_links.sql`
- canonical Maps hostname: `https://api.lalgeo.com`
- existing Survey/SaaS hostname: `lalgeo-saas-api.namanadded.workers.dev`

The combined Worker enforces the canonical hostname's HTTPS and HSTS policy before routing, then imports `lalgeo-maps-api/src/index.ts`. Requests for Maps discovery and `/v1/maps` are routed to that implementation; all other routes retain the existing SaaS behavior. The custom domain and database already exist. Do not deploy the standalone `lalgeo-maps-api/wrangler.jsonc`, create a `lalgeo-maps` production database, or move DNS during a routine release.

## Current evidence

Last read-only canonical check: 2026-09-15 07:09 UTC.

- The verifier merged at commit `f84e548` passed every credential-free check against `https://api.lalgeo.com`; GitHub's production Worker build for that commit reports version `17f7f879-797d-40cf-8440-6d0f222096d4`.
- `GET /v1/health` returned HTTP 200 with exactly `{"ok":true,"service":"lalgeo-maps-api","version":"v1"}`, valid TLS, one-year HSTS, `no-store`, and a request ID. Plain HTTP returned an exact bodyless 308 to HTTPS.
- `/v1/openapi.json` returned the valid predecessor OpenAPI document. This release's canonical contract has 22 unique operations, 17 JSON success schemas, and five bodyless HEAD/DELETE successes; the read-only verifier must stop at contract parity until that exact document is deployed. Public `HEAD` remains bodyless.
- Missing and synthetic invalid bearer credentials returned the documented JSON `401 UNAUTHORIZED` response and bearer challenge without disclosing a secret.
- CORS allowed `https://maps.lalgeo.com`, exposed `X-Request-Id` to that origin, and did not allow an untrusted origin.
- The anonymous-create, immutable [Snapshot API](https://maps.lalgeo.com/api-docs) is also live and returns a private token for revocation.
- Snapshot API source currently exists only on the old, conflicting [PR #151](https://github.com/namanadded/lalgeo-dot-com/pull/151), not on `main`; reconcile that production drift separately rather than importing the divergent branch here. That repair should identify its contract as `LalGeo Maps Snapshot API` and link back to the Authoring API so discovery works from either entry point.
- This repository change adds the one-time Authoring API → Maps handoff. Its stricter verifier can pass transport and health, then must stop at the former OpenAPI contract until this document and both matching migration chains are deployed.

The initial combined-Worker release recorded an authenticated synthetic create/export/delete acceptance in [PR #146](https://github.com/namanadded/lalgeo-dot-com/pull/146). No production key was available for the 2026-09-15 check, and a read-only verifier intentionally cannot repeat that proof. Every release owner should still complete the synthetic open/edit/cleanup acceptance below.

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

The combined gate uses disposable local D1 state, applies migrations `0001` through the latest migration, sends a synthetic hostname-routed Maps journey through `lalgeo-saas-api`, creates and redeems a 256-bit one-time capability, rejects its reuse, validates the editable project copy, and removes its temporary files. It must not require Cloudflare credentials or contact a remote database.

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

For this release, confirm `0005_map_open_links.sql` matches the standalone `lalgeo-maps-api/migrations/0002_map_open_links.sql`: the table contains the SHA-256 `token_hash`, owner and map IDs, expiry and creation timestamps, but never a raw capability. The owner/map foreign key must cascade when its API map is deleted.

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

The verifier sends only credential-free `GET`, `HEAD`, and `OPTIONS` requests. It validates the 22-operation/17-success-schema contract for the public redemption exchange but deliberately does not issue or redeem a capability. It requires exact bodyless `308` redirects for both Maps and non-Maps paths on the shared hostname, valid TLS, at least one year of host-wide HSTS, public bodyless health/OpenAPI `HEAD` responses, browser-readable request IDs, and the complete JSON/OpenAPI/auth/CORS contract. It must pass without `--insecure`, following redirects, a custom host header, response overrides, or fallback HTML.

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

umask 077
curl --fail-with-body --request POST "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP/open-links" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"expires_in":600}' \
  --output /tmp/lalgeo-open-link.json

LALGEO_OPEN_URL="$(jq -er '.open_url' /tmp/lalgeo-open-link.json)"
```

Open `$LALGEO_OPEN_URL` in a browser. Confirm that Maps removes the `#open=…` fragment from the visible address before it shows an accessible **Open editable copy** confirmation. Choose that action, then confirm the project opens at Calgary and the Places layer contains one Central Library point. Make a clearly synthetic local edit, export the local project, and reopen it to prove the edit survives.

Open the original `$LALGEO_OPEN_URL` again and choose **Open editable copy**. It must fail with the same expired-or-used message and must not replace the open project. Issue another link with the command above and confirm it returns `201`; this is the supported recovery after use or expiry. The token must be 64 lowercase hexadecimal characters, the response must not contain the bearer key, and the expiry must be no more than 15 minutes after issuance.

Finally, export the server map and confirm the synthetic local edit is absent—the handoff is an editable copy, not write-through:

```sh
curl --fail-with-body "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP/export" \
  -H "Authorization: Bearer $LALGEO_API_KEY" \
  --output /tmp/lalgeo-api-server-after-open.lal
```

Always remove the synthetic server record, including when the visual check fails:

```sh
curl --fail-with-body --request DELETE "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP" \
  -H "Authorization: Bearer $LALGEO_API_KEY"
rm -f /tmp/lalgeo-open-link.json /tmp/lalgeo-api-server-after-open.lal
unset LALGEO_API_KEY LALGEO_API_BASE LALGEO_ACCEPTANCE_MAP LALGEO_OPEN_URL
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

The Maps tables are additive and can remain unused after a Worker rollback. Clients that have observed HSTS will continue upgrading this hostname to HTTPS for up to one year, so every rollback target must remain HTTPS-compatible. Do not improvise a down migration, delete shared D1 data, restore the former Netlify DNS target, or detach the custom domain.

## Acceptance record

Attach these items to the release review:

- commit, Cloudflare build, and Worker version;
- isolated Maps API check and local release-gate output;
- combined Worker type-check, dry-run bundle metrics, migration list, and local Maps gate output;
- canonical read-only verifier output;
- one-time link fragment scrub/confirmation/open/edit/export/reopen, reuse rejection, server-unchanged proof, and delete response;
- one existing Survey/SaaS smoke result;
- risk notes, rollback version, and the operator who retained the credential source of truth.
