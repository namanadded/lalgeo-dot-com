import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { LalGeoApi, LalGeoApiError } from "../src/lalgeo-api.ts";

const originalFetch = globalThis.fetch;
let requests;

beforeEach(() => {
  requests = [];
  globalThis.fetch = async (url, init) => {
    const requestBody = init.body ? JSON.parse(init.body) : undefined;
    requests.push({
      method: init.method,
      url: `${url.pathname}${url.search}`,
      authorization: init.headers.Authorization,
      ...(init.headers["X-LalGeo-Readiness-Probe"]
        ? { readinessProbe: init.headers["X-LalGeo-Readiness-Probe"] }
        : {}),
      ...(init.headers["Idempotency-Key"] ? { idempotencyKey: init.headers["Idempotency-Key"] } : {}),
      body: requestBody,
    });
    if (url.pathname === "/v1/health") {
      return Response.json({ ok: true, service: "lalgeo-maps-api", version: "v1" }, {
        headers: {
          "X-LalGeo-Readiness-Probe": "map-idempotency-store-v1",
          "X-Request-Id": "request-readiness",
        },
      });
    }
    if (url.pathname === "/v1/maps/fail/export") {
      return Response.json(
        { error: { code: "MAP_NOT_FOUND" } },
        { status: 404, headers: { "x-request-id": "request-404" } },
      );
    }
    if (url.pathname.endsWith("/open-links")) {
      return Response.json({
        open_url: "https://maps.lalgeo.com/maps#open=" + "a".repeat(64),
        expires_at: "2026-09-22T06:10:00.000Z",
      }, { status: 201 });
    }
    const payload = init.method !== "POST"
      ? { ok: true }
      : url.pathname === "/v1/maps"
        ? { map: { id: "map_1" } }
        : url.pathname.endsWith("/features")
          ? { type: "FeatureCollection", features: requestBody.features }
          : { layer: { id: "layer_1", map_id: "map_1" } };
    return Response.json(payload, {
      status: init.method === "POST" ? 201 : 200,
      headers: init.headers["Idempotency-Key"] ? {
        "Idempotency-Replayed": "false",
        "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z",
      } : {},
    });
  };
});

afterEach(() => { globalThis.fetch = originalFetch; });

test("the adapter forwards authoring writes and export to the authenticated API", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  const created = await Promise.all([
    api.createMap({ id: "map_1", name: "Map" }, "map-create-key-0001"),
    api.createLayer("map/with slash", { id: "layer_1", name: "Sites", geometry_type: "Point" }, "layer-create-key-0001"),
    api.addFeatures("map_1", "layer_1", [{ type: "Feature", geometry: { type: "Point", coordinates: [-114, 51] } }], "feature-create-key-0001"),
  ]);
  await api.updateMap("map_1", { name: "Updated" });
  await api.exportMap("map_1");

  assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
    ["GET", "/v1/health"],
    ["POST", "/v1/maps"],
    ["POST", "/v1/maps/map%2Fwith%20slash/layers"],
    ["POST", "/v1/maps/map_1/layers/layer_1/features"],
    ["PATCH", "/v1/maps/map_1"],
    ["GET", "/v1/maps/map_1/export"],
  ]);
  assert.equal(requests[0].authorization, undefined);
  assert.equal(requests[0].readinessProbe, "map-idempotency-store-v1");
  assert.ok(requests.slice(1).every((request) => request.authorization === "Bearer secret-key"));
  assert.deepEqual(requests.slice(1, 4).map((request) => request.idempotencyKey), [
    "map-create-key-0001",
    "layer-create-key-0001",
    "feature-create-key-0001",
  ]);
  assert.deepEqual(requests[3].body, {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-114, 51] } }],
  });
  assert.deepEqual(created, [
    {
      payload: { map: { id: "map_1" } },
      idempotency: { confirmed: true, replayed: false, expires_at: "2026-10-27T07:00:00.000Z" },
    },
    {
      payload: { layer: { id: "layer_1", map_id: "map_1" } },
      idempotency: { confirmed: true, replayed: false, expires_at: "2026-10-27T07:00:00.000Z" },
    },
    {
      payload: {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-114, 51] } }],
      },
      idempotency: { confirmed: true, replayed: false, expires_at: "2026-10-27T07:00:00.000Z" },
    },
  ]);
});

test("keyed creates preflight readiness and preserve replay metadata without echoing the key", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  const withReadiness = (createResponse) => async (url, init) => {
    requests.push({
      method: init.method,
      url: `${url.pathname}${url.search}`,
      authorization: init.headers.Authorization,
      readinessProbe: init.headers["X-LalGeo-Readiness-Probe"],
    });
    if (url.pathname === "/v1/health") {
      return Response.json({ ok: true, service: "lalgeo-maps-api", version: "v1" }, {
        headers: {
          "X-LalGeo-Readiness-Probe": "map-idempotency-store-v1",
          "X-Request-Id": "request-readiness",
        },
      });
    }
    return createResponse;
  };
  globalThis.fetch = withReadiness(Response.json({ map: { id: "map_1" } }, {
    status: 201,
    headers: {
      "Idempotency-Replayed": "true",
      "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z",
      "X-Request-Id": "request-replay",
    },
  }));

  assert.deepEqual(await api.createMap({ id: "map_1", name: "Map" }, "map-create-key-0001"), {
    payload: { map: { id: "map_1" } },
    idempotency: { confirmed: true, replayed: true, expires_at: "2026-10-27T07:00:00.000Z" },
  });
  assert.deepEqual(requests.slice(0, 2), [
    {
      method: "GET",
      url: "/v1/health",
      authorization: undefined,
      readinessProbe: "map-idempotency-store-v1",
    },
    {
      method: "POST",
      url: "/v1/maps",
      authorization: "Bearer secret-key",
      readinessProbe: undefined,
    },
  ]);

  for (const headers of [
    { "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z" },
    { "Idempotency-Replayed": "false" },
    { "Idempotency-Replayed": "sometimes", "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z" },
    { "Idempotency-Replayed": "false", "Idempotency-Key-Expires-At": "not-a-date" },
  ]) {
    globalThis.fetch = withReadiness(Response.json({ map: { id: "map_1" } }, {
      status: 201,
      headers: { ...headers, "X-Request-Id": "request-invalid-replay" },
    }));
    assert.deepEqual(await api.createMap({ id: "map_1", name: "Map" }, "map-create-key-0001"), {
      payload: { map: { id: "map_1" } },
      idempotency: {
        confirmed: false,
        replayed: null,
        expires_at: null,
        warning: "The create succeeded, but its replay headers were missing or invalid. Preserve the returned IDs and inspect the result before retrying.",
      },
    });
  }

  globalThis.fetch = async () => Response.json({ map: { id: "map_2" } }, { status: 201 });
  assert.deepEqual(await api.createMap({ id: "map_2", name: "Unkeyed" }), {
    payload: { map: { id: "map_2" } },
    idempotency: null,
  });
});

test("keyed creates stop before mutation when durable replay readiness is unavailable", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  const readinessCases = [
    {
      response: Response.json({ ok: true, service: "lalgeo-maps-api", version: "v1" }, {
        headers: { "X-Request-Id": "request-stale-runtime" },
      }),
      expectedCode: "IDEMPOTENCY_UNAVAILABLE",
      expectedRequestId: "request-stale-runtime",
    },
    {
      response: Response.json({
        error: { code: "IDEMPOTENCY_NOT_CONFIGURED", message: "Idempotent creates are temporarily unavailable." },
        request_id: "request-missing-migration",
      }, {
        status: 503,
        headers: { "X-Request-Id": "request-missing-migration" },
      }),
      expectedCode: "IDEMPOTENCY_NOT_CONFIGURED",
      expectedRequestId: "request-missing-migration",
    },
  ];

  for (const { response: readinessResponse, expectedCode, expectedRequestId } of readinessCases) {
    requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({
        method: init.method,
        url: `${url.pathname}${url.search}`,
        authorization: init.headers.Authorization,
        readinessProbe: init.headers["X-LalGeo-Readiness-Probe"],
      });
      return readinessResponse;
    };
    await assert.rejects(api.createMap({ name: "Must not be created" }, "map-create-key-0001"), (error) => {
      assert.ok(error instanceof LalGeoApiError);
      assert.equal(error.status, 503);
      assert.equal(error.requestId, expectedRequestId);
      assert.equal(error.payload?.error?.code, expectedCode);
      return true;
    });
    assert.deepEqual(requests, [{
      method: "GET",
      url: "/v1/health",
      authorization: undefined,
      readinessProbe: "map-idempotency-store-v1",
    }]);
  }
});

test("create responses reject website fallbacks and wrong success contracts without inviting blind retries", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  const cases = [
    new Response("<!doctype html><title>Website fallback</title>", {
      status: 200,
      headers: { "Content-Type": "text/html", "X-Request-Id": "request-html-200" },
    }),
    new Response("<!doctype html><title>Website fallback</title>", {
      status: 201,
      headers: { "Content-Type": "text/html", "X-Request-Id": "request-html-201" },
    }),
    Response.json({ ok: true }, {
      status: 201,
      headers: { "X-Request-Id": "request-wrong-json" },
    }),
    Response.json({ map: { id: "map_1" } }, {
      status: 200,
      headers: { "X-Request-Id": "request-wrong-status" },
    }),
  ];

  for (const createResponse of cases) {
    requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ method: init.method, url: url.pathname });
      if (url.pathname === "/v1/health") {
        return Response.json({ ok: true, service: "lalgeo-maps-api", version: "v1" }, {
          headers: {
            "X-LalGeo-Readiness-Probe": "map-idempotency-store-v1",
            "X-Request-Id": "request-readiness",
          },
        });
      }
      return createResponse;
    };

    await assert.rejects(api.createMap({ id: "map_1", name: "Map" }, "map-create-key-0001"), (error) => {
      assert.ok(error instanceof LalGeoApiError);
      assert.equal(error.status, 502);
      assert.equal(error.requestId, createResponse.headers.get("x-request-id"));
      assert.equal(error.payload?.error?.code, "CREATE_OUTCOME_UNCONFIRMED");
      assert.match(error.payload?.error?.message, /Do not retry automatically/);
      return true;
    });
    assert.deepEqual(requests, [
      { method: "GET", url: "/v1/health" },
      { method: "POST", url: "/v1/maps" },
    ]);
  }

  globalThis.fetch = async () => Response.json({ ok: true }, {
    status: 201,
    headers: { "X-Request-Id": "request-unkeyed-wrong-json" },
  });
  await assert.rejects(api.createMap({ id: "map_1", name: "Map" }), (error) => {
    assert.ok(error instanceof LalGeoApiError);
    assert.equal(error.payload?.error?.code, "CREATE_OUTCOME_UNCONFIRMED");
    assert.equal(error.requestId, "request-unkeyed-wrong-json");
    return true;
  });
});

test("hosted credential verification performs one bounded authenticated read", async () => {
  globalThis.fetch = async (url, init) => {
    requests.push({
      method: init.method,
      url: `${url.pathname}${url.search}`,
      authorization: init.headers.Authorization,
      redirect: init.redirect,
      body: undefined,
    });
    return Response.json({ error: { code: "MAP_NOT_FOUND" }, request_id: "request-auth-probe" }, {
      status: 404,
      headers: { "x-request-id": "request-auth-probe" },
    });
  };
  const api = new LalGeoApi("caller-key", "https://api.example.test");

  await api.verifyCredentials();

  assert.equal(requests.length, 1);
  assert.deepEqual({ ...requests[0], url: undefined }, {
    method: "GET",
    url: undefined,
    authorization: "Bearer caller-key",
    redirect: "error",
    body: undefined,
  });
  assert.match(requests[0].url, /^\/v1\/maps\/mcp_credential_probe_[a-f0-9]{32}$/);
});

test("hosted credential verification rejects website fallbacks, malformed JSON, oversized responses, and fictitious 404s", async () => {
  const responses = [
    new Response("<!doctype html><title>Website fallback</title>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    Response.json({ ok: true }),
    new Response("{}", { headers: { "content-length": "64001" } }),
    new Response(`{"padding":"${"x".repeat(64_000)}"}`),
    Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }),
    Response.json({ error: { code: "MAP_NOT_FOUND" }, request_id: "payload-request" }, {
      status: 404,
      headers: { "x-request-id": "different-header-request" },
    }),
  ];
  const api = new LalGeoApi("caller-key", "https://api.example.test");

  for (const response of responses) {
    globalThis.fetch = async () => response;
    await assert.rejects(api.verifyCredentials(), (error) => {
      assert.ok(error instanceof LalGeoApiError);
      assert.ok([404, 502].includes(error.status));
      if (error.status === 502) {
        assert.deepEqual(error.payload, {
          error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid credential check response." },
        });
      }
      return true;
    });
  }
});

test("API errors retain the existing response and request ID", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  await assert.rejects(api.exportMap("fail"), (error) => {
    assert.ok(error instanceof LalGeoApiError);
    assert.equal(error.status, 404);
    assert.equal(error.requestId, "request-404");
    assert.deepEqual(error.payload, { error: { code: "MAP_NOT_FOUND" } });
    return true;
  });
});

test("the generated LalGeo open URL is requested for the correct map", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  const result = await api.createMapOpenLink("calgary/map");

  assert.deepEqual(requests[0], {
    method: "POST",
    url: "/v1/maps/calgary%2Fmap/open-links",
    authorization: "Bearer secret-key",
    body: { expires_in: 600 },
  });
  assert.equal(result.open_url, "https://maps.lalgeo.com/maps#open=" + "a".repeat(64));
});

test("stored layer IDs are read from the authenticated layer listing", async () => {
  globalThis.fetch = async (url, init) => {
    requests.push({
      method: init.method,
      url: `${url.pathname}${url.search}`,
      authorization: init.headers.Authorization,
    });
    return Response.json({
      layers: Array.from({ length: 101 }, (_, index) => ({ id: `layer_${index}` })),
    });
  };
  const api = new LalGeoApi("secret-key", "https://api.example.test");

  const ids = await api.listLayerIds("map/with slash");

  assert.equal(ids.length, 101);
  assert.equal(ids[0], "layer_0");
  assert.equal(ids.at(-1), "layer_100");
  assert.deepEqual(requests, [
    {
      method: "GET",
      url: "/v1/maps/map%2Fwith%20slash/layers",
      authorization: "Bearer secret-key",
    },
  ]);
});

test("invalid layer listings fail closed instead of inventing stored IDs", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");

  await assert.rejects(api.listLayerIds("map_1"), (error) => {
    assert.ok(error instanceof LalGeoApiError);
    assert.equal(error.status, 502);
    assert.deepEqual(error.payload, {
      error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid layer list." },
    });
    return true;
  });
});
