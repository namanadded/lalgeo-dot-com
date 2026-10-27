import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { LalGeoApi, LalGeoApiError } from "../src/lalgeo-api.ts";

const originalFetch = globalThis.fetch;
let requests;

beforeEach(() => {
  requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({
      method: init.method,
      url: `${url.pathname}${url.search}`,
      authorization: init.headers.Authorization,
      ...(init.headers["Idempotency-Key"] ? { idempotencyKey: init.headers["Idempotency-Key"] } : {}),
      body: init.body ? JSON.parse(init.body) : undefined,
    });
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
    return Response.json({ ok: true }, {
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
    ["POST", "/v1/maps"],
    ["POST", "/v1/maps/map%2Fwith%20slash/layers"],
    ["POST", "/v1/maps/map_1/layers/layer_1/features"],
    ["PATCH", "/v1/maps/map_1"],
    ["GET", "/v1/maps/map_1/export"],
  ]);
  assert.ok(requests.every((request) => request.authorization === "Bearer secret-key"));
  assert.deepEqual(requests.slice(0, 3).map((request) => request.idempotencyKey), [
    "map-create-key-0001",
    "layer-create-key-0001",
    "feature-create-key-0001",
  ]);
  assert.deepEqual(requests[2].body, {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-114, 51] } }],
  });
  assert.deepEqual(created, Array.from({ length: 3 }, () => ({
    payload: { ok: true },
    idempotency: { replayed: false, expires_at: "2026-10-27T07:00:00.000Z" },
  })));
});

test("keyed creates preserve validated replay metadata without echoing the key", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  globalThis.fetch = async () => Response.json({ map: { id: "map_1" } }, {
    status: 201,
    headers: {
      "Idempotency-Replayed": "true",
      "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z",
      "X-Request-Id": "request-replay",
    },
  });

  assert.deepEqual(await api.createMap({ id: "map_1", name: "Map" }, "map-create-key-0001"), {
    payload: { map: { id: "map_1" } },
    idempotency: { replayed: true, expires_at: "2026-10-27T07:00:00.000Z" },
  });

  for (const headers of [
    { "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z" },
    { "Idempotency-Replayed": "false" },
    { "Idempotency-Replayed": "sometimes", "Idempotency-Key-Expires-At": "2026-10-27T07:00:00.000Z" },
    { "Idempotency-Replayed": "false", "Idempotency-Key-Expires-At": "not-a-date" },
  ]) {
    globalThis.fetch = async () => Response.json({ map: { id: "map_1" } }, {
      status: 201,
      headers: { ...headers, "X-Request-Id": "request-invalid-replay" },
    });
    await assert.rejects(api.createMap({ id: "map_1", name: "Map" }, "map-create-key-0001"), (error) => {
      assert.ok(error instanceof LalGeoApiError);
      assert.equal(error.status, 502);
      assert.equal(error.requestId, "request-invalid-replay");
      assert.deepEqual(error.payload, {
        error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid response." },
      });
      return true;
    });
  }

  globalThis.fetch = async () => Response.json({ map: { id: "map_2" } }, { status: 201 });
  assert.deepEqual(await api.createMap({ id: "map_2", name: "Unkeyed" }), {
    payload: { map: { id: "map_2" } },
    idempotency: null,
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
