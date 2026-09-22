# LalGeo MCP server

A small Model Context Protocol adapter for the existing LalGeo Maps Authoring API. It exposes exactly five tools:

- `create_map`
- `create_layer`
- `add_features`
- `update_map`
- `export_map`

The server does not implement storage, ownership, geometry validation, or export logic. It forwards each tool call to `https://api.lalgeo.com` with the configured LalGeo Developer API key, so the existing API remains the source of truth for authentication and GIS behavior.

## Run locally

Node.js 18 or newer is required.

```sh
npm ci
npm run build
LALGEO_API_KEY="your-development-api-key" npm start
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`, and `GET /health` is available for process checks. Optional settings are:

- `PORT` (default `3000`)
- `HOST` (default `127.0.0.1`)
- `LALGEO_API_BASE_URL` (default `https://api.lalgeo.com`; useful for local API verification)

Keep `LALGEO_API_KEY` in the process environment. Do not commit it or put it in ChatGPT prompts.

## Connect to ChatGPT

This server intentionally binds to localhost and does not add a second authentication system. Connect it through OpenAI's Secure MCP Tunnel so the server and its LalGeo API key remain private:

1. Build and start the server as shown above.
2. In the OpenAI Platform tunnel settings, create a tunnel for an HTTP MCP server whose local URL is `http://127.0.0.1:3000/mcp`.
3. Install and run `tunnel-client` using the profile and `tunnel_id` provided by the tunnel settings. Keep both the LalGeo MCP process and the tunnel client running.
4. In ChatGPT, open **Settings → Security and login** and enable **Developer mode**.
5. Open **ChatGPT Plugins**, select **+**, choose **Tunnel** as the connection, then select the tunnel (or paste its `tunnel_id`).
6. Confirm that ChatGPT discovers only the five tools listed above, then test with a development LalGeo API key before using production data.

Account or workspace policy can limit Developer mode and tunnel availability. See OpenAI's [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) and [ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) for the current setup flow.

Do not expose this process directly to the public internet: the tunnel is the access boundary, while `LALGEO_API_KEY` authenticates its calls to the existing LalGeo Developer API.

## Verify

```sh
npm run check
```
