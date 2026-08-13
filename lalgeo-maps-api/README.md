# LalGeo Maps API

The agent-facing API behind the “Maps for humans and agents” promise. It lets an authenticated client create maps, add typed layers and GeoJSON features, then export a portable `.lal` project that opens in LalGeo Maps.

## Local development

```sh
npm install
npm run db:migrate:local
wrangler secret put LALGEO_MAPS_API_KEYS
npm run dev
```

`LALGEO_MAPS_API_KEYS` is a JSON object whose keys are SHA-256 API-key hashes and whose values are stable owner IDs:

```json
{"<sha256-of-raw-api-key>": "owner_demo"}
```

The raw API key is sent as `Authorization: Bearer <key>` and is never stored. Health and OpenAPI discovery are public; all map data routes require authentication.

Before the first deployment, create a dedicated D1 database, replace the placeholder `database_id` in `wrangler.jsonc`, apply remote migrations, set the secret, deploy, and route `api.lalgeo.com` to the Worker.

## Contract

See [`openapi.json`](openapi.json) and the public guide at [`../developers/index.html`](../developers/index.html).
