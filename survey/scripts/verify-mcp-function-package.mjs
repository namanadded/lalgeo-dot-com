import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const zipPath = path.join(root, ".netlify/functions/mcp.zip");
const extractDir = await mkdtemp(path.join(tmpdir(), "lalgeo-mcp-package-"));
const originalFetch = globalThis.fetch;

function assertEntry(zip, entry) {
  if (!zip.getEntry(entry)) {
    throw new Error(`Missing ${entry} in ${zipPath}`);
  }
}

function decodeNetlifyBody(response) {
  return response.isBase64Encoded
    ? Buffer.from(response.body, "base64").toString("utf8")
    : response.body;
}

try {
  const zip = new AdmZip(zipPath);
  for (const entry of [
    "lalgeo-mcp/dist/geocoder.js",
    "lalgeo-mcp/dist/lalgeo-api.js",
    "lalgeo-mcp/dist/netlify.js",
    "lalgeo-mcp/dist/server.js",
    "lalgeo-mcp/dist/widget.js",
    "lalgeo-mcp/package.json",
    "lalgeo-mcp/node_modules/@modelcontextprotocol/sdk/package.json",
    "lalgeo-mcp/node_modules/zod/package.json",
  ]) {
    assertEntry(zip, entry);
  }

  zip.extractAllTo(extractDir, true);

  process.env.LAMBDA_TASK_ROOT = extractDir;
  process.env.LALGEO_API_BASE_URL = "https://api.example.test";
  process.env.LALGEO_API_KEY = "shared-key-that-must-never-be-used";
  process.env.MAPKIT_TOKEN = "package-test-mapkit-token";

  const { handler } = await import(pathToFileURL(path.join(extractDir, "survey/netlify/functions/mcp.js")).href);
  const health = await handler({ path: "/health", httpMethod: "GET", headers: {}, body: null });
  assert.equal(health.statusCode, 200);
  assert.equal(health.headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(health.body), { ok: true, service: "lalgeo-mcp" });

  let upstreamRequests = 0;
  globalThis.fetch = async () => {
    upstreamRequests += 1;
    throw new Error("Unauthenticated MCP must not call an upstream.");
  };
  const unauthorized = await handler({
    path: "/mcp",
    rawUrl: "https://cloud.lalgeo.com/mcp",
    httpMethod: "POST",
    isBase64Encoded: false,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.headers["www-authenticate"], 'Bearer realm="lalgeo-mcp"');
  assert.equal(unauthorized.headers["cache-control"], "no-store");
  assert.equal(upstreamRequests, 0);

  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: url.toString(), authorization: init.headers.Authorization });
    return Response.json({ error: { code: "MAP_NOT_FOUND" }, request_id: "request-auth-probe" }, {
      status: 404,
      headers: { "x-request-id": "request-auth-probe" },
    });
  };

  const initialize = await handler({
    path: "/mcp",
    rawUrl: "https://cloud.lalgeo.com/mcp",
    httpMethod: "POST",
    isBase64Encoded: false,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer synthetic-caller-key",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "lalgeo-package-test", version: "1.0.0" },
      },
    }),
  });

  assert.equal(initialize.statusCode, 200, decodeNetlifyBody(initialize));
  assert.equal(initialize.headers["cache-control"], "no-store");

  const payload = JSON.parse(decodeNetlifyBody(initialize));
  assert.deepEqual(payload.result?.serverInfo, { name: "lalgeo", version: "0.5.0" });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/api\.example\.test\/v1\/maps\/mcp_credential_probe_[a-f0-9]{32}$/);
  assert.equal(requests[0].authorization, "Bearer synthetic-caller-key");

  console.log("Packaged MCP imports, fail-closed auth, and caller-key discovery verified.");
} finally {
  globalThis.fetch = originalFetch;
  await rm(extractDir, { recursive: true, force: true });
}
