# Build and open a map

These two dependency-light quickstarts create the same synthetic Calgary map:

1. create a private map with a stable client ID;
2. add a typed point layer;
3. add two GeoJSON features; and
4. create a short-lived, one-time link to open an editable copy in LalGeo Maps.

Choose [TypeScript](#typescript) or [Python](#python). Both clients read the live OpenAPI contract before writing. On API versions that advertise `Idempotency-Key`, a timed-out or transiently failed create is retried once with the exact same body and key. On older versions, the clients do not retry an ambiguous create; the error names the stable ID and read endpoint to inspect first.

The examples never print the API key. They print only the created map ID, one-time open URL, and expiry.

## Before you run

You need an Authoring API key with `maps:read` and `maps:write`. Keep it in a protected environment variable, not in the source, a prompt, a log, or shell history:

```sh
read -s LALGEO_API_KEY
export LALGEO_API_KEY
```

The examples use `https://api.lalgeo.com` by default. `LALGEO_API_BASE_URL` exists for a local loopback server or an explicitly selected HTTPS deployment.

## TypeScript

Requires Node.js 20 or newer. From `lalgeo-maps-api/`:

```sh
npm ci
quickstart_dir="$(mktemp -d)"
./node_modules/.bin/tsc \
  -p examples/typescript/tsconfig.json \
  --noEmit false \
  --outDir "$quickstart_dir"
node "$quickstart_dir/quickstart.js"
```

Source: [`typescript/quickstart.ts`](typescript/quickstart.ts)

## Python

Requires Python 3.9 or newer and only uses the standard library. From `lalgeo-maps-api/`:

```sh
python3 examples/python/quickstart.py
```

Source: [`python/quickstart.py`](python/quickstart.py)

## Result

A successful run writes one JSON object:

```json
{
  "map_id": "quickstart_…",
  "open_url": "https://maps.lalgeo.com/maps#open=…",
  "expires_at": "2026-10-29T07:10:00.000Z"
}
```

Open `open_url` before it expires, then choose **Open editable copy**. The fragment is a temporary single-use capability; do not paste it into a prompt, issue, analytics event, or log. The imported project is a local editable copy, so later edits do not write through to the API map.

The map remains in the API workspace so it can be inspected after a timeout and reopened with a fresh link. Delete it when it is no longer useful:

```sh
api_base_url="${LALGEO_API_BASE_URL:-https://api.lalgeo.com}"
curl --fail-with-body --request DELETE \
  "${api_base_url%/}/v1/maps/<map_id>" \
  -H "Authorization: Bearer $LALGEO_API_KEY"
```

## Errors and safe recovery

- `401 UNAUTHORIZED`: check that the key is present, valid, and unexpired.
- `403 INSUFFICIENT_SCOPE`: use a key that includes `maps:write` as well as `maps:read`.
- `409 ID_CONFLICT`: the stable ID already exists. Read it and compare the stored content; do not assume it belongs to this run.
- A timeout or transient `5xx` on an idempotent create is retried once with byte-identical intent. If it still fails, keep the named ID and inspect the reconciliation endpoint before trying anything else.
- On an API contract without idempotent create support, an ambiguous create is never retried automatically. Inspect the endpoint named in the error first.
- Map-open link creation is never retried automatically because each successful call mints a new capability. If its response is lost, inspect the map, then request a fresh link.

Every HTTP failure includes the server's `X-Request-Id` when available. Keep that ID for troubleshooting; it is safe to share with an operator.

## Offline regression coverage

`npm run check` compiles the TypeScript client and executes both clients against local synthetic legacy and idempotent contracts. The tests verify paths, bodies, credentials, retry behavior, stable keys, response validation, and secret-free output without contacting production.
