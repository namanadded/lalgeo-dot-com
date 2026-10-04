import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AppleMapsGeocoder } from "./geocoder.js";
import { LalGeoApi, LalGeoApiError } from "./lalgeo-api.js";
import { createServer } from "./server.js";

type EventHeaders = Record<string, string | string[] | undefined>;

export type NetlifyMcpEvent = {
  path: string;
  rawUrl?: string;
  httpMethod: string;
  headers: EventHeaders;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type NetlifyMcpResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
};

const JSON_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};
const BEARER_CHALLENGE = 'Bearer realm="lalgeo-mcp"';
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function header(headers: EventHeaders, name: string) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return typeof entry?.[1] === "string" ? entry[1] : null;
}

export function extractBearerApiKey(headers: EventHeaders) {
  const authorization = header(headers, "authorization");
  const match = authorization?.match(/^Bearer[ \t]+([\x21-\x7e]{1,512})$/i);
  return match?.[1] ?? null;
}

function authoringApiBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const secure = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
    if (!secure || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function jsonResponse(
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): NetlifyMcpResponse {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(payload),
  };
}

function authenticationRequired(message = "A valid LalGeo Authoring API key is required.") {
  return jsonResponse(401, {
    jsonrpc: "2.0",
    error: { code: -32001, message },
    id: null,
  }, { "www-authenticate": BEARER_CHALLENGE });
}

function serviceUnavailable() {
  return jsonResponse(503, {
    jsonrpc: "2.0",
    error: { code: -32603, message: "The hosted LalGeo MCP service is unavailable." },
    id: null,
  });
}

function requestHeaders(headers: EventHeaders) {
  const output = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value !== "string") continue;
    if (["authorization", "content-length", "cookie", "proxy-authorization"].includes(name.toLowerCase())) continue;
    output.set(name, value);
  }
  return output;
}

async function responseFromWeb(response: Response): Promise<NetlifyMcpResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  headers["cache-control"] = "no-store";
  return {
    statusCode: response.status,
    headers,
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
  };
}

export async function handler(event: NetlifyMcpEvent): Promise<NetlifyMcpResponse> {
  const method = event.httpMethod.toUpperCase();
  if (event.path.endsWith("/health")) {
    if (method !== "GET" && method !== "HEAD") {
      return jsonResponse(405, { error: "Method not allowed." }, { allow: "GET, HEAD" });
    }
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: method === "HEAD" ? "" : JSON.stringify({ ok: true, service: "lalgeo-mcp" }),
    };
  }

  // A serverless invocation cannot hold the optional MCP GET event stream open.
  // Streamable HTTP clients treat 405 as the supported signal to use POST only.
  if (method !== "POST") {
    return jsonResponse(405, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }, { allow: "POST" });
  }

  const apiKey = extractBearerApiKey(event.headers);
  if (!apiKey) return authenticationRequired();

  const apiBaseUrl = authoringApiBaseUrl(process.env.LALGEO_API_BASE_URL || "https://api.lalgeo.com");
  if (!apiBaseUrl) return serviceUnavailable();
  const api = new LalGeoApi(apiKey, apiBaseUrl);
  try {
    await api.verifyCredentials();
  } catch (error) {
    if (error instanceof LalGeoApiError && error.status === 401) {
      return authenticationRequired("The LalGeo Authoring API key is invalid.");
    }
    return serviceUnavailable();
  }

  const mapsToken = process.env.MAPKIT_TOKEN;
  if (!mapsToken) return serviceUnavailable();

  const server = createServer(api, new AppleMapsGeocoder(mapsToken));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : undefined;
  const host = header(event.headers, "host") || "mcp.lalgeo.com";
  const url = event.rawUrl || `https://${host}/mcp`;
  const request = new Request(url, {
    method,
    headers: requestHeaders(event.headers),
    body,
  });

  try {
    await server.connect(transport);
    return await responseFromWeb(await transport.handleRequest(request));
  } catch {
    return jsonResponse(500, {
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error." },
      id: null,
    });
  } finally {
    await transport.close();
    await server.close();
  }
}
