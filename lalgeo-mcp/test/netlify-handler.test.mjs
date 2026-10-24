import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handler } from "../src/netlify.ts";

const originalFetch = globalThis.fetch;
const originalApiBaseUrl = process.env.LALGEO_API_BASE_URL;
const originalMapkitToken = process.env.MAPKIT_TOKEN;
const originalSharedKey = process.env.LALGEO_API_KEY;

function event(overrides = {}) {
  return {
    path: "/.netlify/functions/mcp/mcp",
    rawUrl: "https://cloud.lalgeo.com/mcp",
    httpMethod: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "cloud.lalgeo.com",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "hosted-boundary-test", version: "1.0.0" },
      },
    }),
    ...overrides,
  };
}

function body(response) {
  const text = response.isBase64Encoded
    ? Buffer.from(response.body, "base64").toString("utf8")
    : response.body;
  return JSON.parse(text);
}

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalApiBaseUrl === undefined) delete process.env.LALGEO_API_BASE_URL;
  else process.env.LALGEO_API_BASE_URL = originalApiBaseUrl;
  if (originalMapkitToken === undefined) delete process.env.MAPKIT_TOKEN;
  else process.env.MAPKIT_TOKEN = originalMapkitToken;
  if (originalSharedKey === undefined) delete process.env.LALGEO_API_KEY;
  else process.env.LALGEO_API_KEY = originalSharedKey;
}

test("the hosted MCP boundary is public only for health and uses each caller's key", async (t) => {
  t.after(restoreEnvironment);

  await t.test("health returns exact no-store JSON without touching credentials or upstreams", async () => {
    let fetches = 0;
    globalThis.fetch = async () => { fetches += 1; throw new Error("unexpected fetch"); };
    const response = await handler(event({
      path: "/.netlify/functions/mcp/health",
      rawUrl: "https://cloud.lalgeo.com/health",
      httpMethod: "GET",
      body: undefined,
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(body(response), { ok: true, service: "lalgeo-mcp" });
    assert.equal(fetches, 0);

    const head = await handler(event({
      path: "/.netlify/functions/mcp/health",
      rawUrl: "https://cloud.lalgeo.com/health",
      httpMethod: "HEAD",
      body: undefined,
    }));
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, "");
    assert.equal(fetches, 0);
  });

  await t.test("missing and malformed bearer credentials fail before any upstream call", async () => {
    let fetches = 0;
    globalThis.fetch = async () => { fetches += 1; throw new Error("unexpected fetch"); };

    for (const authorization of [undefined, "Basic abc", "Bearer has spaces", "Bearer\t"]) {
      const response = await handler(event({
        headers: { ...event().headers, ...(authorization ? { authorization } : {}) },
      }));
      assert.equal(response.statusCode, 401);
      assert.equal(response.headers["www-authenticate"], 'Bearer realm="lalgeo-mcp"');
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(body(response).error.code, -32001);
    }
    assert.equal(fetches, 0);
  });

  await t.test("the serverless endpoint rejects streaming and unsupported methods without an upstream call", async () => {
    let fetches = 0;
    globalThis.fetch = async () => { fetches += 1; throw new Error("unexpected fetch"); };

    for (const method of ["GET", "DELETE", "OPTIONS"]) {
      const response = await handler(event({
        httpMethod: method,
        headers: { ...event().headers, authorization: "Bearer caller-owner-key" },
        body: undefined,
      }));
      assert.equal(response.statusCode, 405);
      assert.equal(response.headers.allow, "POST");
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(body(response).error.code, -32000);
    }
    assert.equal(fetches, 0);
  });

  await t.test("an insecure Authoring API override fails closed without forwarding the caller key", async () => {
    process.env.LALGEO_API_BASE_URL = "http://api.example.test";
    process.env.MAPKIT_TOKEN = "synthetic-mapkit-token";
    let fetches = 0;
    globalThis.fetch = async () => { fetches += 1; throw new Error("unexpected fetch"); };

    const response = await handler(event({
      headers: { ...event().headers, authorization: "Bearer caller-owner-key" },
    }));

    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(fetches, 0);
  });

  await t.test("a rejected caller key cannot reach MCP or a shared Maps workspace", async () => {
    process.env.LALGEO_API_BASE_URL = "https://api.example.test";
    process.env.MAPKIT_TOKEN = "synthetic-mapkit-token";
    process.env.LALGEO_API_KEY = "shared-key-that-must-never-be-used";
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: url.toString(), authorization: init.headers.Authorization });
      return Response.json({ error: { code: "UNAUTHORIZED" } }, {
        status: 401,
        headers: { "x-request-id": "request-invalid-key" },
      });
    };

    const response = await handler(event({
      headers: { ...event().headers, authorization: "Bearer invalid-caller-key" },
    }));

    assert.equal(response.statusCode, 401);
    assert.match(body(response).error.message, /key is invalid/);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/api\.example\.test\/v1\/maps\/mcp_credential_probe_[a-f0-9]{32}$/);
    assert.equal(requests[0].authorization, "Bearer invalid-caller-key");
  });

  await t.test("a successful website fallback fails closed before MCP discovery", async () => {
    process.env.LALGEO_API_BASE_URL = "https://api.example.test";
    process.env.MAPKIT_TOKEN = "synthetic-mapkit-token";
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      return new Response("<!doctype html><title>Website fallback</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const response = await handler(event({
      headers: { ...event().headers, authorization: "Bearer syntactically-valid-key" },
    }));

    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(body(response), {
      jsonrpc: "2.0",
      error: { code: -32603, message: "The hosted LalGeo MCP service is unavailable." },
      id: null,
    });
    assert.equal(fetches, 1);
  });

  await t.test("a valid caller key is verified read-only and remains the key used by map tools", async () => {
    process.env.LALGEO_API_BASE_URL = "https://api.example.test";
    process.env.MAPKIT_TOKEN = "synthetic-mapkit-token";
    process.env.LALGEO_API_KEY = "shared-key-that-must-never-be-used";
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({
        method: init.method,
        url: url.toString(),
        authorization: init.headers.Authorization,
      });
      if (url.pathname === "/v1/maps" && init.method === "POST") {
        return Response.json({ map: { id: "synthetic_map", name: "Synthetic map" } }, { status: 201 });
      }
      if (/^\/v1\/maps\/mcp_credential_probe_[a-f0-9]{32}$/.test(url.pathname) && init.method === "GET") {
        return Response.json({ error: { code: "MAP_NOT_FOUND" }, request_id: "request-auth-probe" }, {
          status: 404,
          headers: { "x-request-id": "request-auth-probe" },
        });
      }
      throw new Error(`Unexpected upstream request: ${init.method} ${url}`);
    };

    const response = await handler(event({
      headers: { ...event().headers, authorization: "Bearer caller-owner-key" },
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.headers["content-type"], /^application\/json/);
    assert.deepEqual(body(response).result.serverInfo, { name: "lalgeo", version: "0.5.0" });

    const toolsResponse = await handler(event({
      headers: { ...event().headers, authorization: "Bearer caller-owner-key" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    }));
    assert.equal(toolsResponse.statusCode, 200);
    const toolsBody = JSON.stringify(body(toolsResponse));
    for (const tool of ["create_map", "create_layer", "add_features", "update_map", "inspect_map", "export_map", "geocode"]) {
      assert.match(toolsBody, new RegExp(`"name":"${tool}"`));
    }

    const callResponse = await handler(event({
      headers: { ...event().headers, authorization: "Bearer caller-owner-key" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "create_map",
          arguments: { id: "synthetic_map", name: "Synthetic map" },
        },
      }),
    }));
    assert.equal(callResponse.statusCode, 200);
    assert.equal(body(callResponse).result.structuredContent.data.map.id, "synthetic_map");
    assert.equal(requests.length, 4);
    for (const request of requests.slice(0, 3)) {
      assert.equal(request.method, "GET");
      assert.match(request.url, /^https:\/\/api\.example\.test\/v1\/maps\/mcp_credential_probe_[a-f0-9]{32}$/);
      assert.equal(request.authorization, "Bearer caller-owner-key");
    }
    assert.deepEqual(requests[3], {
      method: "POST",
      url: "https://api.example.test/v1/maps",
      authorization: "Bearer caller-owner-key",
    });
  });
});

test("the deployed wrapper and package configuration preserve the fail-closed handler", async () => {
  const [handlerSource, wrapper, config, packageVerifier] = await Promise.all([
    readFile(new URL("../src/netlify.ts", import.meta.url), "utf8"),
    readFile(new URL("../../survey/netlify/functions/mcp.js", import.meta.url), "utf8"),
    readFile(new URL("../../survey/netlify.toml", import.meta.url), "utf8"),
    readFile(new URL("../../survey/scripts/verify-mcp-function-package.mjs", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(handlerSource, /process\.env\.LALGEO_API_KEY/);
  assert.match(handlerSource, /await api\.verifyCredentials\(\)/);
  assert.match(wrapper, /lalgeo-mcp\/dist\/netlify\.js/);
  assert.match(config, /"\.\.\/lalgeo-mcp\/dist\/\*\*"/);
  assert.match(packageVerifier, /lalgeo-mcp\/dist\/netlify\.js/);
});
