import AdmZip from "adm-zip";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const root = path.resolve(import.meta.dirname, "..");
const zipPath = path.join(root, ".netlify/functions/mcp.zip");
const extractDir = await mkdtemp(path.join(tmpdir(), "lalgeo-mcp-package-"));

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
    "lalgeo-mcp/dist/server.js",
    "lalgeo-mcp/dist/widget.js",
    "lalgeo-mcp/package.json",
    "lalgeo-mcp/node_modules/@modelcontextprotocol/sdk/package.json",
    "lalgeo-mcp/node_modules/zod/package.json",
    "survey/node_modules/@modelcontextprotocol/sdk/package.json",
  ]) {
    assertEntry(zip, entry);
  }

  zip.extractAllTo(extractDir, true);

  process.env.LAMBDA_TASK_ROOT = extractDir;
  process.env.LALGEO_API_KEY = "package-test-api-key";
  process.env.MAPKIT_TOKEN = "package-test-mapkit-token";

  const { handler } = await import(pathToFileURL(path.join(extractDir, "survey/netlify/functions/mcp.js")).href);
  const health = await handler({ path: "/health", httpMethod: "GET", headers: {}, body: null });
  if (health.statusCode !== 200) {
    throw new Error(`Packaged health check failed: ${health.statusCode} ${health.body}`);
  }

  const initialize = await handler({
    path: "/mcp",
    rawUrl: "https://mcp.lalgeo.com/mcp",
    httpMethod: "POST",
    isBase64Encoded: false,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
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

  if (initialize.statusCode !== 200) {
    throw new Error(`Packaged MCP initialize failed: ${initialize.statusCode} ${decodeNetlifyBody(initialize)}`);
  }

  const payload = JSON.parse(decodeNetlifyBody(initialize).split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "{}");
  if (payload.result?.serverInfo?.name !== "lalgeo") {
    throw new Error(`Unexpected packaged MCP initialize payload: ${JSON.stringify(payload)}`);
  }

  console.log("Packaged MCP function runtime imports verified.");
} finally {
  await rm(extractDir, { recursive: true, force: true });
}
