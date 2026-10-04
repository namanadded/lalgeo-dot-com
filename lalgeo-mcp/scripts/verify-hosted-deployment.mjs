#!/usr/bin/env node

import assert from "node:assert/strict";

const rawBaseUrl = process.argv[2];
assert.ok(rawBaseUrl, "Usage: npm run verify:hosted -- https://deploy-preview.example.test");
const baseUrl = new URL(rawBaseUrl);
assert.equal(baseUrl.pathname, "/", "Base URL must not include a path.");
assert.ok(
  baseUrl.protocol === "https:" || ["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname),
  "Base URL must use HTTPS unless it is loopback.",
);

async function request(pathname, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(new URL(pathname, baseUrl), {
      ...init,
      credentials: "omit",
      redirect: "manual",
      signal: controller.signal,
    });
    assert.ok(response.status < 300 || response.status >= 400, `${pathname} must not redirect to a fallback.`);
    const text = await response.text();
    assert.ok(Buffer.byteLength(text) <= 100_000, `${pathname} response is unexpectedly large.`);
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

const health = await request("/health", { headers: { accept: "application/json" } });
const unauthorized = await request("/mcp", {
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "credential-free-probe",
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "lalgeo-deployment-verifier", version: "1.0.0" },
    },
  }),
});
assert.equal(unauthorized.response.status, 401, `Unauthenticated MCP returned ${unauthorized.response.status}, not 401.`);
assert.match(unauthorized.response.headers.get("content-type") || "", /^application\/json\b/i);
assert.match(unauthorized.response.headers.get("cache-control") || "", /(?:^|,)\s*no-store(?:,|$)/i);
assert.equal(unauthorized.response.headers.get("www-authenticate"), 'Bearer realm="lalgeo-mcp"');
assert.deepEqual(JSON.parse(unauthorized.text), {
  jsonrpc: "2.0",
  error: { code: -32001, message: "A valid LalGeo Authoring API key is required." },
  id: null,
});

assert.equal(health.response.status, 200, `Health returned ${health.response.status}, not 200.`);
assert.match(health.response.headers.get("content-type") || "", /^application\/json\b/i);
assert.match(health.response.headers.get("cache-control") || "", /(?:^|,)\s*no-store(?:,|$)/i);
assert.deepEqual(JSON.parse(health.text), { ok: true, service: "lalgeo-mcp" });

console.log(`PASS hosted MCP deployment: exact public health and fail-closed unauthenticated endpoint at ${baseUrl.origin}`);
