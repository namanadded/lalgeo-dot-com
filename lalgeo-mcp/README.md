# LalGeo MCP server

A small Model Context Protocol adapter for the existing LalGeo Maps Authoring API and place search. It exposes seven tools:

- `create_map`
- `create_layer`
- `add_features`
- `update_map`
- `inspect_map`
- `export_map`
- `geocode`

The server does not implement storage, ownership, geometry validation, or export logic. It forwards map tool calls to `https://api.lalgeo.com`, so the existing API remains the source of truth for authentication, owner isolation, and GIS behavior. Local and hosted connections have separate credential boundaries: a localhost process reads `LALGEO_API_KEY`, while the hosted endpoint requires each caller's own LalGeo Authoring API key.

New Authoring API keys are expiring and always include `maps:read`; add `maps:write` for `create_map`, `create_layer`, `add_features`, `update_map`, and `export_map`. A read-only key can use `inspect_map`, while `geocode` uses the separate Apple Maps credential. `export_map` requires write access because it creates a new single-use handoff capability after reading the project. The adapter forwards the caller's key unchanged and preserves the API's `401` expired-or-invalid and `403 INSUFFICIENT_SCOPE` responses. Legacy full-access keys remain supported only for controlled rotation.

The Authoring API limits each owner to 300 protected requests per fixed minute. A verified `429 RATE_LIMITED` tool error includes bounded `rate_limit` metadata and a `retry` instruction; wait for `after_seconds`, then repeat the same tool call once. The adapter does not sleep or retry on the caller's behalf. It trusts backoff metadata only when the API's JSON error, request ID, `RateLimit-*`, and `Retry-After` values agree.

`geocode` accepts a place name or address and delegates to the Apple Maps search service already used by LalGeo's browser map and address components. It returns the best match's latitude and longitude together with the original matched place fields; the MCP adapter does not implement geocoding or spatial matching.

## ChatGPT map component

Each successful map tool result includes the same model-readable JSON plus MCP Apps `structuredContent`. ChatGPT can render the linked `ui://lalgeo/map.html` resource as a compact interactive map with pan, zoom, and feature inspection. The component uses the GeoJSON and portable `.lal` shapes already returned by LalGeo; it does not perform API validation, storage, GIS conversion, or export work.

`create_map`, `create_layer`, and `add_features` accept an optional
`idempotency_key`. Give each intended create a new UUID-like value and reuse it
only for an exact retry; the adapter forwards it as `Idempotency-Key`, and the API
replays the successful result for 24 hours without another mutation. Keep stable
resource IDs as well so an older resource or a retry after the receipt expires can
still be inspected explicitly. The create tools remain conservatively advertised
as non-idempotent because the key is optional. When a key is supplied, the result
context reports whether the API committed or replayed the create and the exact
receipt expiry with `confirmed: true`; it never returns the raw key. Before a
keyed write, the adapter calls the API's public, non-mutating idempotency
readiness probe without the bearer key. An older runtime or missing migration
therefore fails before any create request is sent. If a deployment changes in
the narrow interval after that probe and a successful create omits the replay
headers, the tool returns the successful payload with `confirmed: false` and a
warning to preserve the returned IDs and inspect before retrying; it never turns
a committed create into an error that invites a duplicate write.

The adapter accepts a create as successful only when the API returns exact HTTP
`201`, JSON content, and the expected map, layer, or FeatureCollection envelope.
A website fallback, malformed body, wrong resource shape, or other successful
status returns `CREATE_OUTCOME_UNCONFIRMED` with the request ID and explicit
do-not-retry guidance. Inspect a supplied stable ID before deciding what to do;
never treat an ambiguous upstream response as proof that a resource was created.

Portable export and map-open handoff responses are checked just as strictly. An
export must be exact HTTP `200` JSON for the requested map and contain the
portable LalGeo project identity and layer envelope. A link must be exact HTTP
`201` JSON with a canonical `https://maps.lalgeo.com/maps#open=…` capability and
a valid expiry. Website fallbacks, wrong success statuses, and malformed shapes
fail closed with the upstream request ID. An unverified link response is never
retried automatically because the first request may have created a capability.

`inspect_map` reads the complete current map through the Authoring API's portable-project export and stored-layer listing. It does not create a map-open link, so it is advertised as read-only and idempotent. Use it to reconcile an unkeyed or expired create: after a timeout or `409 ID_CONFLICT`, inspect the map and compare the stable ID and content instead of blindly repeating the write. An API map with no stored layers includes the documented virtual `empty_points` layer in its portable view. The result context reports authoritative `stored_layer_ids`, so an empty list distinguishes that compatibility layer from a stored resource with the same ID.

The widget's **Open in LalGeo** action calls the existing `export_map` MCP tool for the current map ID. The adapter verifies the portable project first, then requests the Developer API's short-lived `/v1/maps/{mapId}/open-links` handoff and passes that URL to the widget as hidden tool-result metadata. This sequence prevents a failed or rate-limited export from leaving an undisclosed capability behind. LalGeo Maps redeems the handoff and opens the API's complete project copy, so every persisted layer and feature is included without sending project data through the widget or adding another MCP tool. Because each call issues a new single-use capability, the tool is intentionally advertised as neither read-only nor idempotent.

The component uses the standard `_meta.ui.resourceUri`, `text/html;profile=mcp-app`, and `ui/notifications/tool-result` conventions. The `openai/outputTemplate` and `window.openai.toolOutput` compatibility aliases are also present for ChatGPT hosts that still use them. It has no external runtime assets or network access.

See OpenAI's [MCP Apps UI guide](https://developers.openai.com/plugins/build/chatgpt-ui) for the host-side rendering contract.

## Minimal end-to-end example

In ChatGPT, prompt:

> Create a map of Calgary and add these GeoJSON features: Calgary City Hall at `[-114.0575, 51.0466]` and Calgary Tower at `[-114.0631, 51.0447]`.

The model can complete this with the tools above:

1. `create_map` with `{"id":"calgary_map","idempotency_key":"calgary-map-create-0001","name":"Calgary","center":{"latitude":51.0447,"longitude":-114.0719},"zoom":12}`.
2. `create_layer` with stable ID `calgary_places`, a fresh `idempotency_key`, and a `Point` layer named `Calgary places`.
3. `add_features` with stable IDs on the two GeoJSON Point Features and another fresh `idempotency_key`.
4. Retry an uncertain create only with the exact same arguments and key. Use `inspect_map` to reconcile an unkeyed request, an expired receipt, or an `ID_CONFLICT`.

The final `add_features` and `inspect_map` results render both points in the interactive LalGeo component while retaining the ordinary text result for MCP clients without UI support. This flow, header propagation, and the no-side-effect reconciliation path are covered by the automated end-to-end MCP tests.

## Run locally

Node.js 18 or newer is required.

```sh
npm ci
npm run build
LALGEO_API_KEY="your-development-api-key" MAPKIT_TOKEN="your-existing-maps-token" npm start
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`, and `GET /health` is available for process checks. Optional settings are:

- `PORT` (default `3000`)
- `HOST` (default `127.0.0.1`)
- `LALGEO_API_BASE_URL` (default `https://api.lalgeo.com`; useful for local API verification)

Keep `LALGEO_API_KEY` in the process environment. Do not commit it or put it in ChatGPT prompts.

`MAPKIT_TOKEN` is the existing Apple Maps authorization token used by LalGeo's MapKit search integration. Keep it in the process environment as well.

## Connect ChatGPT through Secure MCP Tunnel

This server intentionally binds to localhost and does not add a second authentication system. Connect it through OpenAI's Secure MCP Tunnel so the server and its LalGeo API key remain private:

1. Build and start the server as shown above.
2. In the OpenAI Platform tunnel settings, create a tunnel for an HTTP MCP server whose local URL is `http://127.0.0.1:3000/mcp`.
3. Install and run `tunnel-client` using the profile and `tunnel_id` provided by the tunnel settings. Keep both the LalGeo MCP process and the tunnel client running.
4. In ChatGPT, open **Settings → Security and login** and enable **Developer mode**.
5. Open **ChatGPT Plugins**, select **+**, choose **Tunnel** as the connection, then select the tunnel (or paste its `tunnel_id`).
6. Confirm that ChatGPT discovers only the seven tools listed above, then test with development credentials before using production data.

Account or workspace policy can limit Developer mode and tunnel availability. See OpenAI's [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) and [ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) for the current setup flow.

Do not expose this process directly to the public internet: the tunnel is the access boundary, while `LALGEO_API_KEY` authenticates its calls to the existing LalGeo Developer API.

## Hosted endpoint for generic MCP clients

`https://mcp.lalgeo.com/mcp` is available to MCP clients that can store and attach a static bearer credential securely. Send your own LalGeo Maps Authoring API key on every request:

```text
Authorization: Bearer <caller LalGeo Authoring API key>
```

The hosted adapter validates the key with a bounded, read-only Authoring API request before servicing each MCP `POST`, then uses that same key for owner-scoped map calls. That credential check consumes one owner request, including for initialize and tool discovery. It never falls back to a shared server-side `LALGEO_API_KEY`. If the check reaches the owner limit, the hosted boundary returns exact HTTP `429` plus only the verified `RateLimit-*` and `Retry-After` values; malformed or mismatched upstream backoff fails closed as `503`. Authoring API calls time out after 10 seconds, refuse redirects, and accept only HTTPS upstreams (or loopback HTTP for local verification). The serverless transport uses finite JSON responses over `POST`; it rejects the optional long-lived `GET` event stream with `405`. `https://mcp.lalgeo.com/health` stays public for process checks; health does not authenticate a caller or grant map access.

Deploy the 1.4.0 Authoring API runtime and both `map_idempotency_keys` and `map_rate_limits` migrations before deploying MCP 0.6.1. The keyed-create readiness preflight makes missing idempotency storage fail before mutation, while the API makes every protected request fail closed when quota storage is unavailable. Neither behavior replaces the deployment verifier or owner-key acceptance journey.

Store the key only in the MCP client's protected connection settings. Never put it in a prompt, log, issue, map property, or tool argument.

ChatGPT cannot attach a custom API key to a public MCP connection. OpenAI's [MCP authentication guidance](https://developers.openai.com/plugins/build/auth) requires OAuth 2.1 for user-authenticated hosted tools, and LalGeo does not advertise that flow yet. Use the localhost + Secure MCP Tunnel path above for ChatGPT. Do not configure the hosted endpoint as an unauthenticated ChatGPT connection.

## Verify

```sh
npm run check
npm run build
npm run verify:hosted -- https://deploy-preview-000--lalgeosurvey.netlify.app
```

The hosted deployment verifier needs no real credential. It accepts only exact public health JSON plus `401` challenges for both a missing bearer and a clearly synthetic invalid bearer; the second check proves the deployed handler actually consults Authoring API authentication. It never invokes a tool or sends a usable Authoring API key. A `503` on the synthetic probe means the Authoring API authentication configuration must be repaired before hosted MCP is usable.
