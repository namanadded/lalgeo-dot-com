import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyProduction } from "./verify-production.mjs";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(apiDirectory, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
const localApiKey = "lalgeo_synthetic_runtime_key";
const localOwner = "owner_synthetic_runtime";
const allowedOrigin = "https://maps.lalgeo.com";
const checks = [];

function record(name) {
  checks.push(name);
  process.stdout.write(`✓ ${name}\n`);
}

function commandFailure(command, args, code, output) {
  const detail = output.trim().split("\n").slice(-24).join("\n");
  return new Error(`${command} ${args.join(" ")} exited with ${code}.${detail ? `\n${detail}` : ""}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: apiDirectory,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(commandFailure(command, args, code, output));
    });
  });
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function request(baseUrl, pathname, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(`${baseUrl}${pathname}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function json(response) {
  assert.match(response.headers.get("content-type") || "", /^application\/json\b/i);
  return response.json();
}

async function waitForWorker(baseUrl, child, logs) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Wrangler stopped before becoming ready.\n${logs().trim()}`);
    }
    try {
      const response = await request(baseUrl, "/v1/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Wrangler did not become ready within 20 seconds.\n${logs().trim()}`);
}

function assertImportableByMaps(payload) {
  const project = payload?.project;
  assert.equal(typeof project?.id, "string");
  assert.equal(typeof project?.name, "string");
  assert.ok(Array.isArray(project?.layers) && project.layers.length > 0);
  assert.ok(project.layers.some((layer) => layer.id === project.activeLayerId));
  for (const layer of project.layers) {
    assert.match(layer.geometryType, /^(point|line|polygon)$/);
    assert.ok(Array.isArray(layer.schema));
    assert.ok(Array.isArray(layer.features));
    for (const feature of layer.features) {
      assert.equal(typeof feature.id, "string");
      assert.equal(typeof feature.attributes, "object");
      if (layer.geometryType === "point") {
        assert.equal(feature.geometry?.type, "Point");
        assert.ok(Number.isFinite(feature.geometry?.lat));
        assert.ok(Number.isFinite(feature.geometry?.lng));
      }
    }
  }
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "lalgeo-maps-api-gate-"));
  const bundleDirectory = path.join(stateDirectory, "bundle");
  const logPath = path.join(stateDirectory, "wrangler.log");
  const port = await availablePort();
  assert.ok(port, "could not reserve a loopback port");
  const baseUrl = `http://127.0.0.1:${port}`;
  const keyHash = createHash("sha256").update(localApiKey).digest("hex");
  const bindings = JSON.stringify({ [keyHash]: localOwner });
  const childEnvironment = {
    ...process.env,
    CI: "true",
    WRANGLER_LOG_PATH: logPath,
  };
  let devServer;
  let serverLogs = "";

  try {
    await run(wrangler, ["d1", "migrations", "apply", "lalgeo-maps", "--local", "--persist-to", stateDirectory], { env: childEnvironment });
    record("fresh D1 migrations apply locally");

    await run(wrangler, ["deploy", "--dry-run", "--outdir", bundleDirectory], { env: childEnvironment });
    record("Worker deployment bundle builds without publishing");

    devServer = spawn(wrangler, [
      "dev",
      "--local",
      "--ip", "127.0.0.1",
      "--port", String(port),
      "--persist-to", stateDirectory,
      "--log-level", "error",
      "--var", `LALGEO_MAPS_API_KEYS:${bindings}`,
      "--var", `CORS_ALLOWED_ORIGINS:${allowedOrigin}`,
    ], {
      cwd: apiDirectory,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    devServer.stdout.on("data", (chunk) => { serverLogs += chunk; });
    devServer.stderr.on("data", (chunk) => { serverLogs += chunk; });
    await waitForWorker(baseUrl, devServer, () => serverLogs);

    const publicVerification = await verifyProduction({
      baseUrl,
      origin: allowedOrigin,
      timeoutMs: 5_000,
      logger: { log() {} },
    });
    assert.equal(publicVerification.operationCount, 18);
    record("strict health, OpenAPI, auth, and bounded CORS checks pass locally");

    const authorization = { Authorization: `Bearer ${localApiKey}` };
    const mapResponse = await request(baseUrl, "/v1/maps", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "synthetic_runtime_map",
        name: "Synthetic runtime map",
        center: { latitude: 51.0447, longitude: -114.0719 },
        zoom: 12,
      }),
    });
    assert.equal(mapResponse.status, 201);
    assert.equal((await json(mapResponse)).map?.id, "synthetic_runtime_map");
    record("authenticated client creates a synthetic map");

    const mapListResponse = await request(baseUrl, "/v1/maps?limit=10&offset=0", { headers: authorization });
    assert.equal(mapListResponse.status, 200);
    assert.deepEqual((await json(mapListResponse)).maps?.map((map) => map.id), ["synthetic_runtime_map"]);
    const mapGetResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", { headers: authorization });
    assert.equal(mapGetResponse.status, 200);
    assert.equal((await json(mapGetResponse)).map?.name, "Synthetic runtime map");
    const mapPatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Disposable local contract fixture" }),
    });
    assert.equal(mapPatchResponse.status, 200);
    assert.equal((await json(mapPatchResponse)).map?.description, "Disposable local contract fixture");
    record("map list, read, and update routes share one owner scope");

    const layerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "places", name: "Places", geometry_type: "Point" }),
    });
    assert.equal(layerResponse.status, 201);
    assert.equal((await json(layerResponse)).layer?.id, "places");
    record("authenticated client creates a typed layer");

    const layerListResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", { headers: authorization });
    assert.equal(layerListResponse.status, 200);
    assert.deepEqual((await json(layerListResponse)).layers?.map((layer) => layer.id), ["places"]);
    const layerGetResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", { headers: authorization });
    assert.equal(layerGetResponse.status, 200);
    assert.equal((await json(layerGetResponse)).layer?.geometry_type, "Point");
    const layerPatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ style: { symbol_color: "Blue" }, position: 2 }),
    });
    assert.equal(layerPatchResponse.status, 200);
    assert.equal((await json(layerPatchResponse)).layer?.style?.symbol_color, "Blue");
    record("layer list, read, and update routes preserve type and style");

    const featureResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "Feature",
        id: "central_library",
        geometry: { type: "Point", coordinates: [-114.051, 51.0453] },
        properties: { name: "Central Library", source: "synthetic" },
      }),
    });
    assert.equal(featureResponse.status, 201);
    assert.equal((await json(featureResponse)).features?.[0]?.id, "central_library");
    record("authenticated client creates valid GeoJSON");

    const featureListResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", { headers: authorization });
    assert.equal(featureListResponse.status, 200);
    assert.deepEqual((await json(featureListResponse)).features?.map((feature) => feature.id), ["central_library"]);
    const featureGetResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features/central_library", { headers: authorization });
    assert.equal(featureGetResponse.status, 200);
    assert.equal((await json(featureGetResponse)).properties?.name, "Central Library");
    const featurePatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features/central_library", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { name: "Central Library", source: "synthetic updated" } }),
    });
    assert.equal(featurePatchResponse.status, 200);
    assert.equal((await json(featurePatchResponse)).properties?.source, "synthetic updated");
    record("feature list, read, and update routes preserve GeoJSON");

    const conflictResponse = await request(baseUrl, "/v1/maps", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "synthetic_runtime_map", name: "Synthetic retry" }),
    });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await json(conflictResponse)).error?.code, "ID_CONFLICT");
    record("duplicate client IDs fail without duplicating data");

    const exportResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/export", { headers: authorization });
    assert.equal(exportResponse.status, 200);
    const exported = await json(exportResponse);
    assertImportableByMaps(exported);
    assert.equal(exported.project.layers[0].features[0].attributes.name, "Central Library");
    record("API export satisfies the LalGeo Maps project shape");

    const featureDeleteResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features/central_library", {
      method: "DELETE",
      headers: authorization,
    });
    assert.equal(featureDeleteResponse.status, 204);
    const layerDeleteResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", {
      method: "DELETE",
      headers: authorization,
    });
    assert.equal(layerDeleteResponse.status, 204);
    const mapDeleteResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", {
      method: "DELETE",
      headers: authorization,
    });
    assert.equal(mapDeleteResponse.status, 204);
    const deletedMapResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", { headers: authorization });
    assert.equal(deletedMapResponse.status, 404);
    assert.equal((await json(deletedMapResponse)).error?.code, "MAP_NOT_FOUND");
    record("feature, layer, and map deletes leave no local fixture behind");

    process.stdout.write(`\nMaps API local release gate passed ${checks.length}/${checks.length}. No production resources were contacted.\n`);
  } finally {
    await stop(devServer);
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Maps API local release gate failed after ${checks.length} checks.\n${error.stack || error}\n`);
  process.exitCode = 1;
});
