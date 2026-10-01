import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AppleMapsGeocoder } from "lalgeo-mcp/src/geocoder";
import { LalGeoApi } from "lalgeo-mcp/src/lalgeo-api";
import { createServer } from "lalgeo-mcp/src/server";

function responseFromWeb(response) {
  return response.arrayBuffer().then((body) => {
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      statusCode: response.status,
      headers,
      body: Buffer.from(body).toString("base64"),
      isBase64Encoded: true,
    };
  });
}

export async function handler(event) {
  if (event.path.endsWith("/health")) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true, service: "lalgeo-mcp" }),
    };
  }

  const apiKey = process.env.LALGEO_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "LALGEO_API_KEY is required." }),
    };
  }
  const mapsToken = process.env.MAPKIT_TOKEN;
  if (!mapsToken) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "MAPKIT_TOKEN is required for LalGeo place search." }),
    };
  }

  const apiBaseUrl = process.env.LALGEO_API_BASE_URL || "https://api.lalgeo.com";
  const server = createServer(new LalGeoApi(apiKey, apiBaseUrl), new AppleMapsGeocoder(mapsToken));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : undefined;
  const url = event.rawUrl || `https://${event.headers.host || "mcp.lalgeo.com"}/mcp`;
  const request = new Request(url, {
    method: event.httpMethod,
    headers: event.headers,
    body: event.httpMethod === "GET" || event.httpMethod === "HEAD" ? undefined : body,
  });

  try {
    await server.connect(transport);
    return await responseFromWeb(await transport.handleRequest(request));
  } finally {
    await transport.close();
    await server.close();
  }
}
