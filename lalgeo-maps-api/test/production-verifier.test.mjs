import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
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

const repositorySpec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));

function openApiFixture() {
  return structuredClone(repositorySpec);
}

function jsonHeaders(requestId, extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
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

function headResponse({ requestId = "request_head", headers = {} } = {}) {
  return new Response(null, { status: 200, headers: jsonHeaders(requestId, headers) });
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
  assert.deepEqual(validateOpenApi(openApiFixture()), {
    operationCount: 20,
    successSchemaCount: 15,
    bodylessSuccessCount: 5,
    errorResponseCount: 77,
  });

  const wrongVersion = structuredClone(openApiFixture());
  wrongVersion.openapi = "3.0.3";
  assert.throws(() => validateOpenApi(wrongVersion), /version must be 3\.1/);

  const wrongServer = structuredClone(openApiFixture());
  wrongServer.servers[0].url = "https://example.invalid";
  assert.throws(() => validateOpenApi(wrongServer), /primary server/);

  const ambiguousTitle = structuredClone(openApiFixture());
  ambiguousTitle.info.title = "LalGeo Maps API";
  assert.throws(() => validateOpenApi(ambiguousTitle), /must identify itself as LalGeo Maps Authoring API/);

  const missingSnapshotDistinction = structuredClone(openApiFixture());
  missingSnapshotDistinction.info.description = "Create maps with bearer authentication.";
  assert.throws(() => validateOpenApi(missingSnapshotDistinction), /must distinguish private owner-scoped authoring/);

  const missingAccessContact = structuredClone(openApiFixture());
  delete missingAccessContact.info.contact;
  assert.throws(() => validateOpenApi(missingAccessContact), /must provide the canonical Authoring API access path/);

  const wrongExternalDocs = structuredClone(openApiFixture());
  wrongExternalDocs.externalDocs.url = "https://example.invalid/docs";
  assert.throws(() => validateOpenApi(wrongExternalDocs), /externalDocs must link to/);

  const staleIdentityVersion = structuredClone(openApiFixture());
  staleIdentityVersion.info.version = "1.0.0";
  assert.throws(() => validateOpenApi(staleIdentityVersion), /identity and access metadata must match the repository contract/);

  const missingBearer = structuredClone(openApiFixture());
  delete missingBearer.components.securitySchemes.bearerAuth;
  assert.throws(() => validateOpenApi(missingBearer), /HTTP bearer authentication/);

  const unactionableBearer = structuredClone(openApiFixture());
  unactionableBearer.components.securitySchemes.bearerAuth.description = "LalGeo API key";
  assert.throws(() => validateOpenApi(unactionableBearer), /must explain its owner scope and where to request access/);

  const protectedHealth = structuredClone(openApiFixture());
  delete protectedHealth.paths["/v1/health"].get.security;
  assert.throws(() => validateOpenApi(protectedHealth), /explicitly allow unauthenticated/);

  const wrongOperation = structuredClone(openApiFixture());
  wrongOperation.paths["/v1/maps"].get.operationId = "getMaps";
  assert.throws(() => validateOpenApi(wrongOperation), /must use operationId listMaps/);

  const duplicateOperation = structuredClone(openApiFixture());
  duplicateOperation.paths["/v1/extra"] = {
    get: structuredClone(duplicateOperation.paths["/v1/maps"].get),
  };
  assert.throws(() => validateOpenApi(duplicateOperation), /operationIds must be unique/);
});

test("OpenAPI validation requires resolvable JSON schemas and bodyless HEAD/DELETE responses", () => {
  const missingSchema = openApiFixture();
  delete missingSchema.paths["/v1/maps"].get.responses["200"].content;
  assert.throws(
    () => validateOpenApi(missingSchema),
    /listMaps 200 response must define content\.application\/json\.schema/,
  );

  const danglingReference = openApiFixture();
  danglingReference.paths["/v1/maps"].get.responses["200"].content["application/json"].schema.$ref =
    "#/components/schemas/MissingMapList";
  assert.throws(
    () => validateOpenApi(danglingReference),
    /listMaps 200 response schema does not resolve/,
  );

  const responseWithExternalReference = openApiFixture();
  responseWithExternalReference.paths["/v1/maps"].get.responses["200"].content["application/json"].schema.$ref =
    "https://example.invalid/map-list.schema.json";
  assert.throws(
    () => validateOpenApi(responseWithExternalReference),
    /listMaps 200 response schema must use a local OpenAPI reference/,
  );

  const vacuousSchema = openApiFixture();
  vacuousSchema.paths["/v1/maps"].get.responses["200"].content["application/json"].schema = {};
  assert.throws(
    () => validateOpenApi(vacuousSchema),
    /listMaps 200 response schema must reference #\/components\/schemas\/MapListResponse/,
  );

  const wrongReusableSchema = openApiFixture();
  wrongReusableSchema.paths["/v1/maps"].get.responses["200"].content["application/json"].schema.$ref =
    "#/components/schemas/LayerListResponse";
  assert.throws(
    () => validateOpenApi(wrongReusableSchema),
    /listMaps 200 response schema must reference #\/components\/schemas\/MapListResponse/,
  );

  const vacuousReferencedSchema = openApiFixture();
  vacuousReferencedSchema.components.schemas.MapListResponse = {};
  assert.throws(
    () => validateOpenApi(vacuousReferencedSchema),
    /components\.schemas must match the repository contract/,
  );

  const invalidJsonSchema = openApiFixture();
  invalidJsonSchema.components.schemas.Map.properties.name.type = "definitely-invalid";
  assert.throws(
    () => validateOpenApi(invalidJsonSchema),
    /JSON Schemas must compile as Draft 2020-12/,
  );

  const danglingRequestReference = openApiFixture();
  danglingRequestReference.paths["/v1/maps"].post.requestBody.content["application/json"].schema.$ref =
    "#/components/schemas/MissingMapInput";
  assert.throws(
    () => validateOpenApi(danglingRequestReference),
    /OpenAPI document does not resolve.*MissingMapInput/,
  );

  const danglingErrorReference = openApiFixture();
  danglingErrorReference.components.responses.BadRequest.content["application/json"].schema.$ref =
    "#/components/schemas/MissingError";
  assert.throws(
    () => validateOpenApi(danglingErrorReference),
    /createMap 400 response must use the JSON Error schema/,
  );

  const deleteWithContent = openApiFixture();
  deleteWithContent.paths["/v1/maps/{mapId}"].delete.responses["204"].content = {
    "application/json": { schema: { type: "object" } },
  };
  assert.throws(
    () => validateOpenApi(deleteWithContent),
    /deleteMap 204 response must remain bodyless/,
  );

  const headWithContent = openApiFixture();
  headWithContent.paths["/v1/health"].head.responses["200"].content = {
    "application/json": { schema: { "$ref": "#/components/schemas/HealthResponse" } },
  };
  assert.throws(
    () => validateOpenApi(headWithContent),
    /headHealth 200 response must remain bodyless/,
  );
});

test("OpenAPI validation rejects missing or misleading failure contracts", () => {
  const missingAuth = openApiFixture();
  delete missingAuth.paths["/v1/maps/{mapId}/layers"].get.responses["401"];
  assert.throws(() => validateOpenApi(missingAuth), /listLayers must define exactly these error responses/);

  const fictionalRateLimit = openApiFixture();
  fictionalRateLimit.paths["/v1/maps"].get.responses["429"] = { $ref: "#/components/responses/TooManyRequests" };
  assert.throws(() => validateOpenApi(fictionalRateLimit), /listMaps must define exactly these error responses/);

  const missingConflict = openApiFixture();
  delete missingConflict.paths["/v1/maps/{mapId}/layers/{layerId}/features"].post.responses["409"];
  assert.throws(() => validateOpenApi(missingConflict), /createFeatures must define exactly these error responses/);

  const wrongErrorSchema = openApiFixture();
  wrongErrorSchema.components.responses.Conflict.content["application/json"].schema.$ref = "#/components/schemas/MapResponse";
  assert.throws(() => validateOpenApi(wrongErrorSchema), /createMap 409 response must use the JSON Error schema/);

  const missingRequestId = openApiFixture();
  delete missingRequestId.components.responses.NotFound.headers["X-Request-Id"];
  assert.throws(() => validateOpenApi(missingRequestId), /getMap 404 response must document the X-Request-Id header/);

  const successWithoutRequestId = openApiFixture();
  delete successWithoutRequestId.paths["/v1/health"].head.responses["200"].headers;
  assert.throws(() => validateOpenApi(successWithoutRequestId), /headHealth 200 response must document the X-Request-Id header/);

  const missingBearerChallenge = openApiFixture();
  delete missingBearerChallenge.components.responses.Unauthorized.headers["WWW-Authenticate"];
  assert.throws(() => validateOpenApi(missingBearerChallenge), /listMaps 401 response must document the bearer challenge/);
});

test("production verification sends only credential-free GET, HEAD, and OPTIONS requests", async (t) => {
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
      } else if (request.method === "HEAD" && request.url === "/v1/health") {
        response.writeHead(200, jsonHeaders("request_health_head", { "Cache-Control": "no-store" }));
        response.end();
      } else if (request.method === "HEAD" && request.url === "/v1/openapi.json") {
        response.writeHead(200, jsonHeaders("request_openapi_head", { "Cache-Control": "public, max-age=300" }));
        response.end();
      } else if (request.method === "GET" && request.url === "/v1/maps") {
        response.writeHead(401, jsonHeaders("request_auth", {
          "Cache-Control": "no-store",
          "WWW-Authenticate": "Bearer realm=\"lalgeo-maps-api\"",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Expose-Headers": "X-Request-Id",
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
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Expose-Headers": "X-Request-Id",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        });
        response.end();
      } else if (request.method === "OPTIONS" && request.url === "/v1/maps") {
        response.writeHead(204, { "X-Request-Id": "request_cors_rejected", Vary: "Origin" });
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

  assert.deepEqual(result, {
    baseUrl: service.baseUrl,
    origin,
    operationCount: 20,
    successSchemaCount: 15,
    bodylessSuccessCount: 5,
    errorResponseCount: 77,
  });
  assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
    ["GET", "/v1/health"],
    ["GET", "/v1/openapi.json"],
    ["HEAD", "/v1/health"],
    ["HEAD", "/v1/openapi.json"],
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
  assert.equal(requests[4].headers.origin, origin);
  assert.equal(requests[5].headers.origin, origin);
  assert.equal(requests[5].headers["access-control-request-method"], "GET");
  assert.equal(requests[5].headers["access-control-request-headers"], "Authorization, Content-Type");
  assert.equal(requests[6].headers.origin, "https://cors-probe.invalid");
  assert.match(logs.at(-1), /PASS production verifier/);
});

test("canonical verification requires exact HTTPS redirect, HSTS, and public HEAD", async () => {
  const calls = [];
  const origin = DEFAULT_ORIGIN;
  const secureHeaders = { "Strict-Transport-Security": "max-age=31536000" };
  const fetchImpl = async (target, init) => {
    const url = new URL(target);
    calls.push({ url: url.toString(), method: init.method, headers: Object.fromEntries(init.headers) });
    if (url.protocol === "http:") {
      const destination = new URL(url);
      destination.protocol = "https:";
      return new Response(null, {
        status: 308,
        headers: {
          "Cache-Control": "no-store",
          Location: destination.toString(),
          "X-Request-Id": "request_redirect",
        },
      });
    }
    if (init.method === "GET" && url.pathname === "/v1/health") {
      return jsonResponse(
        { ok: true, service: "lalgeo-maps-api", version: "v1" },
        { requestId: "request_health", headers: { ...secureHeaders, "Cache-Control": "no-store" } },
      );
    }
    if (init.method === "GET" && url.pathname === "/v1/transport-probe") {
      return jsonResponse(
        { error: "UNAUTHORIZED" },
        { status: 401, requestId: "request_shared_transport", headers: secureHeaders },
      );
    }
    if (init.method === "GET" && url.pathname === "/v1/openapi.json") {
      return jsonResponse(openApiFixture(), {
        requestId: "request_openapi",
        headers: { ...secureHeaders, "Cache-Control": "public, max-age=300" },
      });
    }
    if (init.method === "HEAD" && url.pathname === "/v1/health") {
      return headResponse({ requestId: "request_health_head", headers: { ...secureHeaders, "Cache-Control": "no-store" } });
    }
    if (init.method === "HEAD" && url.pathname === "/v1/openapi.json") {
      return headResponse({ requestId: "request_openapi_head", headers: { ...secureHeaders, "Cache-Control": "public, max-age=300" } });
    }
    if (init.method === "GET" && url.pathname === "/v1/maps") {
      return jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "Missing key" }, request_id: "request_auth" },
        {
          status: 401,
          requestId: "request_auth",
          headers: {
            ...secureHeaders,
            "Cache-Control": "no-store",
            "WWW-Authenticate": "Bearer realm=\"lalgeo-maps-api\"",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Expose-Headers": "X-Request-Id",
          },
        },
      );
    }
    if (init.method === "OPTIONS" && init.headers.get("origin") === origin) {
      return new Response(null, {
        status: 204,
        headers: {
          ...secureHeaders,
          "X-Request-Id": "request_cors",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Expose-Headers": "X-Request-Id",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }
    if (init.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...secureHeaders, "X-Request-Id": "request_cors_rejected", Vary: "Origin" },
      });
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`);
  };

  const result = await verifyProduction({ fetchImpl, timeoutMs: 100, logger: { log() {} } });
  assert.equal(result.baseUrl, DEFAULT_BASE_URL);
  assert.deepEqual(calls.map(({ method, url }) => [method, url]), [
    ["GET", "http://api.lalgeo.com/v1/health"],
    ["GET", "https://api.lalgeo.com/v1/health"],
    ["GET", "http://api.lalgeo.com/v1/transport-probe?surface=shared"],
    ["GET", "https://api.lalgeo.com/v1/transport-probe?surface=shared"],
    ["GET", "https://api.lalgeo.com/v1/openapi.json"],
    ["HEAD", "https://api.lalgeo.com/v1/health"],
    ["HEAD", "https://api.lalgeo.com/v1/openapi.json"],
    ["GET", "https://api.lalgeo.com/v1/maps"],
    ["OPTIONS", "https://api.lalgeo.com/v1/maps"],
    ["OPTIONS", "https://api.lalgeo.com/v1/maps"],
  ]);
  for (const call of calls) {
    assert.equal(call.headers.authorization, undefined);
    assert.equal(call.headers.cookie, undefined);
  }
});

test("canonical verification rejects an unprotected transport", async () => {
  await assert.rejects(
    verifyProduction({
      fetchImpl: async () => new Response(null, {
        status: 200,
        headers: { "Cache-Control": "no-store", "X-Request-Id": "request_http" },
      }),
      timeoutMs: 100,
      logger: { log() {} },
    }),
    /Plain-HTTP health endpoint returned HTTP 200; expected 308/,
  );

  const responses = [
    new Response(null, {
      status: 308,
      headers: {
        "Cache-Control": "no-store",
        Location: "https://api.lalgeo.com/v1/health",
        "X-Request-Id": "request_redirect",
      },
    }),
    jsonResponse(
      { ok: true, service: "lalgeo-maps-api", version: "v1" },
      { requestId: "request_health", headers: { "Cache-Control": "no-store" } },
    ),
  ];
  await assert.rejects(
    verifyProduction({
      fetchImpl: async () => responses.shift(),
      timeoutMs: 100,
      logger: { log() {} },
    }),
    /Strict-Transport-Security/,
  );
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
    headResponse({ requestId: "request_health_head", headers: { "Cache-Control": "no-store" } }),
    headResponse({ requestId: "request_openapi_head", headers: { "Cache-Control": "public, max-age=300" } }),
    jsonResponse(
      { error: { code: "UNAUTHORIZED", message: "Missing key" }, request_id: "request_auth" },
      {
        status: 401,
        requestId: "request_auth",
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": DEFAULT_ORIGIN,
          "Access-Control-Expose-Headers": "X-Request-Id",
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
