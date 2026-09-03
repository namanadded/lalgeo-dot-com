import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

import {
  DEFAULT_BASE_URL,
  DEFAULT_ORIGIN,
  VerificationError,
  assertTlsSafety,
  normalizeBaseUrl,
  normalizeOrigin,
  parseArguments,
  validateOpenApi,
  verifyProduction,
} from "../scripts/verify-production.mjs";

function openApiFixture() {
  return {
    openapi: "3.1.0",
    info: { title: "LalGeo Maps API", version: "1.0.0" },
    servers: [{ url: "https://api.lalgeo.com" }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/v1/health": { get: { operationId: "getHealth", security: [] } },
      "/v1/openapi.json": { get: { operationId: "getOpenApi", security: [] } },
      "/v1/maps": {
        get: { operationId: "listMaps" },
        post: { operationId: "createMap" },
      },
      "/v1/maps/{mapId}": {
        get: { operationId: "getMap" },
        patch: { operationId: "updateMap" },
        delete: { operationId: "deleteMap" },
      },
      "/v1/maps/{mapId}/export": { get: { operationId: "exportMap" } },
      "/v1/maps/{mapId}/layers": {
        get: { operationId: "listLayers" },
        post: { operationId: "createLayer" },
      },
      "/v1/maps/{mapId}/layers/{layerId}": {
        get: { operationId: "getLayer" },
        patch: { operationId: "updateLayer" },
        delete: { operationId: "deleteLayer" },
      },
      "/v1/maps/{mapId}/layers/{layerId}/features": {
        get: { operationId: "listFeatures" },
        post: { operationId: "createFeatures" },
      },
      "/v1/maps/{mapId}/layers/{layerId}/features/{featureId}": {
        get: { operationId: "getFeature" },
        patch: { operationId: "updateFeature" },
        delete: { operationId: "deleteFeature" },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

function jsonHeaders(requestId, extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-Id": requestId,
    ...extra,
  };
}

function jsonResponse(payload, { status = 200, requestId = "request_test", headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders(requestId, headers),
  });
}

async function listen(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

test("URL and CLI policy defaults to production and permits HTTP only on loopback", () => {
  assert.deepEqual(parseArguments([]), {
    baseUrl: DEFAULT_BASE_URL,
    origin: DEFAULT_ORIGIN,
    help: false,
  });
  assert.deepEqual(parseArguments([
    "--base-url", "http://127.0.0.1:8787",
    "--origin=https://localhost:3000",
  ]), {
    baseUrl: "http://127.0.0.1:8787",
    origin: "https://localhost:3000",
    help: false,
  });

  assert.equal(normalizeBaseUrl("https://api.lalgeo.com/"), DEFAULT_BASE_URL);
  assert.equal(normalizeBaseUrl("http://localhost:8787"), "http://localhost:8787");
  assert.equal(normalizeBaseUrl("http://127.12.34.56:8787"), "http://127.12.34.56:8787");
  assert.equal(normalizeBaseUrl("http://[::1]:8787"), "http://[::1]:8787");
  assert.equal(normalizeOrigin("http://app.localhost:3000"), "http://app.localhost:3000");

  assert.throws(() => normalizeBaseUrl("http://api.lalgeo.com"), /must use HTTPS/);
  assert.throws(() => normalizeBaseUrl("ftp://127.0.0.1"), /must use HTTPS/);
  assert.throws(() => normalizeBaseUrl("https://user:secret@api.lalgeo.com"), /must not contain credentials/);
  assert.throws(() => normalizeBaseUrl("https://api.lalgeo.com/v1"), /without a path/);
  assert.throws(() => normalizeOrigin("http://maps.lalgeo.com"), /must use HTTPS/);
  assert.throws(() => parseArguments(["--base-url"]), /requires a value/);
  assert.throws(() => parseArguments(["--unknown"]), /Unknown option/);
  assert.throws(() => assertTlsSafety({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }), /disables TLS certificate verification/);
  assert.doesNotThrow(() => assertTlsSafety({}));
});

test("OpenAPI validation enforces the canonical 3.1 bearer contract and operation IDs", () => {
  assert.deepEqual(validateOpenApi(openApiFixture()), { operationCount: 18 });

  const wrongVersion = structuredClone(openApiFixture());
  wrongVersion.openapi = "3.0.3";
  assert.throws(() => validateOpenApi(wrongVersion), /version must be 3\.1/);

  const wrongServer = structuredClone(openApiFixture());
  wrongServer.servers[0].url = "https://example.invalid";
  assert.throws(() => validateOpenApi(wrongServer), /primary server/);

  const missingBearer = structuredClone(openApiFixture());
  delete missingBearer.components.securitySchemes.bearerAuth;
  assert.throws(() => validateOpenApi(missingBearer), /HTTP bearer authentication/);

  const protectedHealth = structuredClone(openApiFixture());
  delete protectedHealth.paths["/v1/health"].get.security;
  assert.throws(() => validateOpenApi(protectedHealth), /explicitly allow unauthenticated/);

  const wrongOperation = structuredClone(openApiFixture());
  wrongOperation.paths["/v1/maps"].get.operationId = "getMaps";
  assert.throws(() => validateOpenApi(wrongOperation), /must use operationId listMaps/);

  const duplicateOperation = structuredClone(openApiFixture());
  duplicateOperation.paths["/v1/extra"] = { get: { operationId: "listMaps" } };
  assert.throws(() => validateOpenApi(duplicateOperation), /operationIds must be unique/);
});

test("production verification sends only credential-free GET and OPTIONS requests", async (t) => {
  const requests = [];
  const origin = "https://maps.lalgeo.com";
  const service = await listen((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });

      if (request.method === "GET" && request.url === "/v1/health") {
        response.writeHead(200, jsonHeaders("request_health", { "Cache-Control": "no-store" }));
        response.end(JSON.stringify({ ok: true, service: "lalgeo-maps-api", version: "v1" }));
      } else if (request.method === "GET" && request.url === "/v1/openapi.json") {
        response.writeHead(200, jsonHeaders("request_openapi", { "Cache-Control": "public, max-age=300" }));
        response.end(JSON.stringify(openApiFixture()));
      } else if (request.method === "GET" && request.url === "/v1/maps") {
        response.writeHead(401, jsonHeaders("request_auth", {
          "Cache-Control": "no-store",
          "WWW-Authenticate": "Bearer realm=\"lalgeo-maps-api\"",
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin",
        }));
        response.end(JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Send an API key using Authorization: Bearer <key>." },
          request_id: "request_auth",
        }));
      } else if (request.method === "OPTIONS" && request.url === "/v1/maps" && request.headers.origin === origin) {
        response.writeHead(204, {
          "X-Request-Id": "request_cors",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        });
        response.end();
      } else if (request.method === "OPTIONS" && request.url === "/v1/maps") {
        response.writeHead(204, { "X-Request-Id": "request_cors_rejected" });
        response.end();
      } else {
        response.writeHead(500);
        response.end("unexpected request");
      }
    });
  });
  t.after(service.close);

  const logs = [];
  const result = await verifyProduction({
    baseUrl: service.baseUrl,
    origin,
    timeoutMs: 1_000,
    logger: { log: (message) => logs.push(message) },
  });

  assert.deepEqual(result, { baseUrl: service.baseUrl, origin, operationCount: 18 });
  assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
    ["GET", "/v1/health"],
    ["GET", "/v1/openapi.json"],
    ["GET", "/v1/maps"],
    ["OPTIONS", "/v1/maps"],
    ["OPTIONS", "/v1/maps"],
  ]);
  for (const request of requests) {
    assert.equal(request.body, "");
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers["proxy-authorization"], undefined);
    assert.equal(request.headers["x-api-key"], undefined);
    assert.equal(request.headers["x-lalgeo-api-key"], undefined);
  }
  assert.equal(requests[2].headers.origin, origin);
  assert.equal(requests[3].headers.origin, origin);
  assert.equal(requests[3].headers["access-control-request-method"], "GET");
  assert.equal(requests[3].headers["access-control-request-headers"], "Authorization, Content-Type");
  assert.equal(requests[4].headers.origin, "https://cors-probe.invalid");
  assert.match(logs.at(-1), /PASS production verifier/);
});

test("verification rejects an inexact health payload and a missing Bearer challenge", async () => {
  const healthWithExtraField = async () => jsonResponse(
    { ok: true, service: "lalgeo-maps-api", version: "v1", timestamp: "unexpected" },
    { requestId: "request_health", headers: { "Cache-Control": "no-store" } },
  );
  await assert.rejects(
    verifyProduction({
      baseUrl: "http://127.0.0.1:8787",
      timeoutMs: 100,
      fetchImpl: healthWithExtraField,
      logger: { log() {} },
    }),
    /exactly ok, service, and version/,
  );

  const responses = [
    jsonResponse(
      { ok: true, service: "lalgeo-maps-api", version: "v1" },
      { requestId: "request_health", headers: { "Cache-Control": "no-store" } },
    ),
    jsonResponse(openApiFixture(), {
      requestId: "request_openapi",
      headers: { "Cache-Control": "public, max-age=300" },
    }),
    jsonResponse(
      { error: { code: "UNAUTHORIZED", message: "Missing key" }, request_id: "request_auth" },
      {
        status: 401,
        requestId: "request_auth",
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": DEFAULT_ORIGIN,
          Vary: "Origin",
        },
      },
    ),
  ];
  await assert.rejects(
    verifyProduction({
      baseUrl: "http://127.0.0.1:8787",
      timeoutMs: 100,
      fetchImpl: async () => responses.shift(),
      logger: { log() {} },
    }),
    /WWW-Authenticate Bearer challenge/,
  );
});

test("verification refuses redirects and aborts stalled responses at the deadline", async () => {
  await assert.rejects(
    verifyProduction({
      baseUrl: "http://127.0.0.1:8787",
      timeoutMs: 100,
      fetchImpl: async () => new Response(null, { status: 302, headers: { Location: "https://example.invalid" } }),
      logger: { log() {} },
    }),
    /redirected; refusing to follow/,
  );

  const started = Date.now();
  await assert.rejects(
    verifyProduction({
      baseUrl: "http://127.0.0.1:8787",
      timeoutMs: 25,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      logger: { log() {} },
    }),
    /timed out after 25 ms/,
  );
  assert.ok(Date.now() - started < 500, "timeout should be bounded");
});
