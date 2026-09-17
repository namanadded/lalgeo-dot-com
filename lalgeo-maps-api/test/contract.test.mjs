import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REQUIRED_ERROR_RESPONSES, validateOpenApi } from "../scripts/verify-production.mjs";

const spec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));
const worker = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0001_maps.sql", import.meta.url), "utf8");
const developerGuide = await readFile(new URL("../../developers/index.html", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("OpenAPI exposes the complete canonical operation set", () => {
  assert.deepEqual(validateOpenApi(spec), {
    operationCount: 20,
    successSchemaCount: 15,
    bodylessSuccessCount: 5,
    errorResponseCount: 77,
  });
  const ids = Object.values(spec.paths).flatMap((path) => Object.values(path).map((operation) => operation?.operationId).filter(Boolean));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("createMap"));
  assert.ok(ids.includes("createFeatures"));
  assert.ok(ids.includes("exportMap"));
});

test("authoring discovery distinguishes API privacy and provides a key access path", () => {
  assert.equal(spec.info.title, "LalGeo Maps Authoring API");
  assert.equal(spec.info.version, "1.0.1");
  assert.match(spec.info.description, /owner-scoped/);
  assert.match(spec.info.description, /bearer-authenticated authoring API/);
  assert.match(spec.info.description, /https:\/\/maps\.lalgeo\.com\/api-docs/);
  assert.deepEqual(spec.info.contact, {
    name: "LalGeo Maps API access",
    url: "https://lalgeo.com/developers/",
    email: "lalgeospatial@outlook.com",
  });
  assert.deepEqual(spec.externalDocs, {
    description: "Authoring API guide, API choice, and key access",
    url: "https://lalgeo.com/developers/",
  });
  assert.match(spec.components.securitySchemes.bearerAuth.description, /private, owner-scoped Authoring API/);
  assert.match(spec.components.securitySchemes.bearerAuth.description, /https:\/\/lalgeo\.com\/developers\//);

  assert.match(developerGuide, /Choose how the map should live/);
  assert.match(developerGuide, /href="https:\/\/maps\.lalgeo\.com\/api-docs"/);
  assert.match(developerGuide, /private revocation token/);
  assert.match(developerGuide, /Request an authoring key/);
  assert.match(developerGuide, /mailto:lalgeospatial@outlook\.com\?subject=LalGeo%20Maps%20Authoring%20API%20access/);
  assert.match(readme, /Choose the right API/);
  assert.match(readme, /do not send private data to the Snapshot API/);
});

test("every JSON success has its runtime schema and HEAD/DELETE remain bodyless", () => {
  const expected = new Map([
    ["getHealth:200", "HealthResponse"],
    ["getOpenApi:200", "OpenApiDocument"],
    ["listMaps:200", "MapListResponse"],
    ["createMap:201", "MapResponse"],
    ["getMap:200", "MapResponse"],
    ["updateMap:200", "MapResponse"],
    ["exportMap:200", "LalGeoExportResponse"],
    ["listLayers:200", "LayerListResponse"],
    ["createLayer:201", "LayerResponse"],
    ["getLayer:200", "LayerResponse"],
    ["updateLayer:200", "LayerResponse"],
    ["listFeatures:200", "FeatureListResponse"],
    ["createFeatures:201", "CreatedFeatureCollection"],
    ["getFeature:200", "StoredFeature"],
    ["updateFeature:200", "StoredFeature"],
  ]);
  const bodyless = new Set([
    "headHealth:200",
    "headOpenApi:200",
    "deleteMap:204",
    "deleteLayer:204",
    "deleteFeature:204",
  ]);

  for (const pathItem of Object.values(spec.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (!operation?.operationId) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!/^2\d\d$/.test(status)) continue;
        const key = `${operation.operationId}:${status}`;
        if (bodyless.has(key)) {
          assert.ok(bodyless.delete(key), `unexpected bodyless success ${key}`);
          assert.equal(Object.hasOwn(response, "content"), false);
          continue;
        }
        assert.equal(
          response.content?.["application/json"]?.schema?.$ref,
          `#/components/schemas/${expected.get(key)}`,
          `unexpected success schema for ${key}`,
        );
        expected.delete(key);
      }
    }
  }

  assert.deepEqual([...expected.keys()], []);
  assert.deepEqual([...bodyless], []);
});

test("response models preserve nullable maps, feature lifecycle shapes, and portable exports", () => {
  const schemas = spec.components.schemas;
  assert.deepEqual(schemas.Map.properties.zoom.type, ["number", "null"]);
  assert.deepEqual(schemas.Map.properties.center.oneOf[1], { type: "null" });
  assert.equal(schemas.Pagination.description.includes("not the total"), true);

  assert.ok(schemas.CreatedFeature.required.includes("id"));
  assert.equal(schemas.CreatedFeature.required.includes("created_at"), false);
  assert.ok(schemas.StoredFeature.required.includes("created_at"));
  assert.ok(schemas.StoredFeature.required.includes("updated_at"));
  assert.equal(schemas.CreatedFeatureCollection.properties.features.minItems, 1);
  assert.equal(Object.hasOwn(schemas.FeatureListResponse.properties.features, "minItems"), false);

  assert.equal(schemas.LalGeoExportResponse.properties.survey.type, "null");
  assert.equal(schemas.LalGeoProject.properties.layers.minItems, 1);
  assert.equal(schemas.LalGeoPolygonGeometry.properties.rings.items.minItems, 3);
  assert.deepEqual(
    schemas.LalGeoMapOptions.required,
    ["showBasemapPOIs", "mapType"],
  );
});

test("every documented data path is implemented by the worker", () => {
  for (const path of Object.keys(spec.paths).filter((path) => path.startsWith("/v1/maps"))) {
    const stableFragment = path.split("{")[0];
    assert.ok(worker.includes(stableFragment.replaceAll("/", "\\/")) || worker.includes(stableFragment), `missing ${path}`);
  }
});

test("tenant ownership is present on every stored resource", () => {
  for (const table of ["maps", "layers", "features"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?owner_id TEXT NOT NULL`));
  }
  assert.match(worker, /LALGEO_MAPS_API_KEYS/);
  assert.match(worker, /Authorization: Bearer/);
  assert.match(migration, /PRIMARY KEY \(owner_id, id\)/);
  assert.match(migration, /PRIMARY KEY \(owner_id, map_id, id\)/);
  assert.match(migration, /PRIMARY KEY \(owner_id, map_id, layer_id, id\)/);
});

test("authentication failures advertise the bearer challenge", () => {
  assert.match(worker, /WWW-Authenticate/);
  assert.match(worker, /Bearer realm=["']lalgeo-maps-api/);
  const unauthorized = spec.components.responses.Unauthorized;
  assert.equal(unauthorized.headers["WWW-Authenticate"].schema.const, 'Bearer realm="lalgeo-maps-api"');
});

test("canonical transport and public diagnostics stay hardened", () => {
  assert.match(worker, /CANONICAL_HOSTNAME = ["']api\.lalgeo\.com["']/);
  assert.match(worker, /url\.hostname !== CANONICAL_HOSTNAME \|\| url\.protocol !== ["']http:["']/);
  assert.match(worker, /destination\.protocol = ["']https:["']/);
  assert.match(worker, /status: 308/);
  assert.match(worker, /Strict-Transport-Security/);
  assert.match(worker, /max-age=31536000/);
  assert.match(worker, /Access-Control-Expose-Headers["']?: ["']X-Request-Id/);
  assert.match(worker, /if \(!origin\) return \{ Vary: ["']Origin["'] \}/);
  assert.match(worker, /req\.method === ["']GET["'] \|\| req\.method === ["']HEAD["']/);
  assert.match(worker, /return req\.method === ["']HEAD["'] \? withoutBody\(result\) : result/);
});

test("agent safety limits and portable export remain part of the contract", () => {
  assert.match(worker, /MAX_BODY_BYTES = 2_000_000/);
  assert.match(worker, /MAX_FEATURE_BATCH = 1_000/);
  assert.match(worker, /function lalGeometry/);
  const exportOperation = spec.paths["/v1/maps/{mapId}/export"].get;
  assert.match(exportOperation.description, /deterministic empty point layer/);
  assert.match(spec.components.schemas.Position.description, /altitude in metres/);
  assert.match(worker, /id: "empty_points", name: "Points"/);
  assert.match(worker, /Number\.isFinite\(altitude\)/);
});

test("every protected route advertises its actual errors and every response has a request ID", () => {
  assert.equal(Object.keys(REQUIRED_ERROR_RESPONSES).length, 16);
  const documented = new Set();
  for (const pathItem of Object.values(spec.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (!operation?.operationId) continue;
      const expected = Object.entries(REQUIRED_ERROR_RESPONSES[operation.operationId] || {});
      const errors = Object.keys(operation.responses).filter((status) => /^[45]\d\d$/.test(status)).sort();
      assert.deepEqual(errors, expected.map(([status]) => status).sort(), operation.operationId);
      for (const [status, component] of expected) {
        documented.add(`${operation.operationId}:${status}`);
        assert.equal(operation.responses[status].$ref, `#/components/responses/${component}`);
      }
      for (const response of Object.values(operation.responses)) {
        const resolved = response.$ref
          ? spec.components.responses[response.$ref.split("/").at(-1)]
          : response;
        assert.equal(resolved.headers?.["X-Request-Id"]?.$ref, "#/components/headers/RequestId");
      }
    }
  }
  assert.equal(documented.size, 77);
  assert.equal(spec.components.responses.Conflict.description.includes("Idempotency-Key replay is not supported"), true);
  assert.equal(Object.hasOwn(spec.components.responses, "TooManyRequests"), false);
});
