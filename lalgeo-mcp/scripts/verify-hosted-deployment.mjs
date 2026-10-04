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

const syntheticInvalidCredential = `lalgeo_synthetic_invalid_${crypto.randomUUID().replaceAll("-", "")}`;
const invalidCredential = await request("/mcp", {
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${syntheticInvalidCredential}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "invalid-credential-probe",
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "lalgeo-deployment-verifier", version: "1.0.0" },
    },
  }),
});
assert.equal(
  invalidCredential.response.status,
  401,
  `Synthetic invalid bearer returned ${invalidCredential.response.status}, not 401. A 503 means the Authoring API authentication configuration must be repaired before hosted MCP is usable.`,
);
assert.match(invalidCredential.response.headers.get("content-type") || "", /^application\/json\b/i);
assert.match(invalidCredential.response.headers.get("cache-control") || "", /(?:^|,)\s*no-store(?:,|$)/i);
assert.equal(invalidCredential.response.headers.get("www-authenticate"), 'Bearer realm="lalgeo-mcp"');
assert.deepEqual(JSON.parse(invalidCredential.text), {
  jsonrpc: "2.0",
  error: { code: -32001, message: "The LalGeo Authoring API key is invalid." },
  id: null,
});

assert.equal(health.response.status, 200, `Health returned ${health.response.status}, not 200.`);
assert.match(health.response.headers.get("content-type") || "", /^application\/json\b/i);
assert.match(health.response.headers.get("cache-control") || "", /(?:^|,)\s*no-store(?:,|$)/i);
assert.deepEqual(JSON.parse(health.text), { ok: true, service: "lalgeo-mcp" });

console.log(`PASS hosted MCP deployment: exact health plus missing and invalid bearer rejection at ${baseUrl.origin}`);
