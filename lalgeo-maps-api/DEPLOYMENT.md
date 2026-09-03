# Maps API first deployment

This runbook is for the LalGeo owner. It deliberately separates repository checks from Cloudflare, DNS, credential, and production changes.

## Current production evidence

Last read-only check: 2026-09-03 07:05 UTC.

- `api.lalgeo.com` is a CNAME to `lalgeosurvey.netlify.app`.
- TLS presents `CN=*.netlify.app`, which is not valid for `api.lalgeo.com`.
- Diagnostic requests that ignore TLS verification reach Netlify and return `404 text/plain` for health, OpenAPI, auth, and CORS probes.
- `maps.lalgeo.com` has valid TLS and serves the Maps workspace, but that does not prove the API is deployed.

Until the final verifier below passes, the canonical Maps API is unavailable.

## 1. Prove the candidate locally

These commands are repository-only and use disposable synthetic data:

```sh
cd lalgeo-maps-api
npm ci
npm run check
npm run verify:local
```

Expected final line:

```text
Maps API local release gate passed 12/12. No production resources were contacted.
```

## 2. Prepare Cloudflare (owner only)

Do not run these commands from automation. Confirm the intended Cloudflare account first:

```sh
npx wrangler whoami
npx wrangler d1 list
```

If a dedicated `lalgeo-maps` database does not exist, create it once:

```sh
npx wrangler d1 create lalgeo-maps
```

Copy the returned database ID into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`, review the diff, and rerun the local release gate. Then inspect and apply the additive migration:

```sh
npx wrangler d1 migrations list lalgeo-maps --remote
npx wrangler d1 migrations apply lalgeo-maps --remote
```

Generate the first raw API key in a secure owner terminal, store it in the password manager, and upload only a JSON map of its SHA-256 hash to the Worker secret:

```sh
export LALGEO_API_KEY="$(openssl rand -hex 32)"
export LALGEO_API_KEY_HASH="$(printf %s "$LALGEO_API_KEY" | shasum -a 256 | awk '{print $1}')"
printf '%s\n' "$LALGEO_API_KEY"
printf '{"%s":"owner_initial"}' "$LALGEO_API_KEY_HASH" | npx wrangler secret put LALGEO_MAPS_API_KEYS
unset LALGEO_API_KEY_HASH
```

Do not paste the raw key into a PR, issue, log, chat, shell history, or Wrangler configuration. Keep the complete hash-to-owner JSON in the password manager because secret values cannot be read back from Wrangler. For rotation, upload a document containing both hashes, verify the new key, then upload a document without the old hash.

Build once more without publishing, then deploy:

```sh
npx wrangler deploy --dry-run
npx wrangler deploy
```

Record the Worker version and candidate `workers.dev` URL from the output. Verify that URL before changing DNS:

```sh
npm run verify:production -- --base-url https://REPLACE_WITH_WORKER.workers.dev
```

## 3. Move the canonical hostname (owner only)

In Cloudflare, open the LalGeo zone and record the current `api` DNS record before changing it. Remove the conflicting `api` CNAME to `lalgeosurvey.netlify.app`, then add `api.lalgeo.com` as a Custom Domain for the `lalgeo-maps-api` Worker. Cloudflare must finish issuing a certificate before acceptance.

Read-only DNS and TLS checks:

```sh
dig +short api.lalgeo.com CNAME
curl --fail --silent --show-error --max-time 20 https://api.lalgeo.com/v1/health
npm run verify:production
```

The verifier must pass every check without `--insecure`, redirects, a custom host header, or response overrides.

## 4. Owner acceptance with a synthetic map

This section writes one synthetic map to production and then deletes it. Run it only after the read-only verifier passes, with a dedicated acceptance key where possible.

```sh
export LALGEO_API_BASE="https://api.lalgeo.com"
export LALGEO_API_KEY="REPLACE_WITH_ACCEPTANCE_KEY"
export LALGEO_ACCEPTANCE_MAP="owner_acceptance_YYYYMMDD"

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

Open `https://maps.lalgeo.com/maps`, choose **Projects → Choose files**, and select `/tmp/lalgeo-api-acceptance.lal`. Confirm the project opens at Calgary, the Places layer contains one Central Library point, and editing/exporting the imported copy works. Then remove the synthetic server record:

```sh
curl --fail-with-body --request DELETE "$LALGEO_API_BASE/v1/maps/$LALGEO_ACCEPTANCE_MAP" \
  -H "Authorization: Bearer $LALGEO_API_KEY"
unset LALGEO_API_KEY LALGEO_API_BASE LALGEO_ACCEPTANCE_MAP
```

## Rollback

For a bad Worker release, keep DNS attached and roll back to the last known-good Worker version:

```sh
npx wrangler versions list
npx wrangler rollback REPLACE_WITH_LAST_GOOD_VERSION --message "Rollback Maps API release"
npm run verify:production
```

The initial migration only creates API-owned tables and is not destructive; do not attempt an ad hoc down migration. If the very first custom-domain cutover must be abandoned before any good Worker version exists, remove the Worker custom domain and restore the recorded DNS value. The former Netlify target is only a routing rollback—it was not a healthy API and must not be reported as one.

## Acceptance record

Attach these items to the release review:

- commit and Worker version;
- local `check` and 12/12 release-gate output;
- candidate and canonical read-only verifier output;
- Cloudflare custom-domain certificate status;
- synthetic `.lal` open/edit/export result and cleanup response;
- risks, rollback version, and the operator who retained the credential source of truth.
