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
      url: url.pathname,
      authorization: init.headers.Authorization,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    if (url.pathname === "/v1/maps/fail/export") {
      return Response.json(
        { error: { code: "MAP_NOT_FOUND" } },
        { status: 404, headers: { "x-request-id": "request-404" } },
      );
    }
    return Response.json({ ok: true }, { status: init.method === "POST" ? 201 : 200 });
  };
});

afterEach(() => { globalThis.fetch = originalFetch; });

test("the adapter forwards all five tools to the existing authenticated API", async () => {
  const api = new LalGeoApi("secret-key", "https://api.example.test");
  await api.createMap({ id: "map_1", name: "Map" });
  await api.createLayer("map/with slash", { id: "layer_1", name: "Sites", geometry_type: "Point" });
  await api.addFeatures("map_1", "layer_1", [{ type: "Feature", geometry: { type: "Point", coordinates: [-114, 51] } }]);
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
  assert.deepEqual(requests[2].body, {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-114, 51] } }],
  });
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
