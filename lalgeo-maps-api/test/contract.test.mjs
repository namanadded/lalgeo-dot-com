import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateOpenApi } from "../scripts/verify-production.mjs";

const spec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));
const worker = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0001_maps.sql", import.meta.url), "utf8");

test("OpenAPI exposes the complete canonical operation set", () => {
  assert.deepEqual(validateOpenApi(spec), { operationCount: 18 });
  const ids = Object.values(spec.paths).flatMap((path) => Object.values(path).map((operation) => operation?.operationId).filter(Boolean));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("createMap"));
  assert.ok(ids.includes("createFeatures"));
  assert.ok(ids.includes("exportMap"));
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

test("agent safety limits and portable export remain part of the contract", () => {
  assert.match(worker, /MAX_BODY_BYTES = 2_000_000/);
  assert.match(worker, /MAX_FEATURE_BATCH = 1_000/);
  assert.match(worker, /function lalGeometry/);
  assert.ok(spec.paths["/v1/maps/{mapId}/export"]);
});
