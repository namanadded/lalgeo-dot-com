import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadLalGeoProjectContract } from "../../maps/scripts/lib/lalgeo-project-contract.mjs";
import { verifyProduction } from "./verify-production.mjs";

export const DEFAULT_WORKER_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DATABASE = "lalgeo-maps";
export const DEFAULT_REQUEST_HOSTNAME = null;
const localApiKey = "lalgeo_synthetic_runtime_key";
const localOwner = "owner_synthetic_runtime";
const allowedOrigin = "https://maps.lalgeo.com";
const checks = [];
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

export function createSuccessResponseValidator(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validators = new Map();

  for (const pathItem of Object.values(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !operation?.operationId) continue;
      if (method.toLowerCase() === "head") continue;
      for (const [status, response] of Object.entries(operation.responses || {})) {
        if (!/^2\d\d$/.test(status) || status === "204") continue;
        const schema = response?.content?.["application/json"]?.schema;
        assert.ok(schema, `${operation.operationId} ${status} has no application/json success schema`);
        const key = `${operation.operationId}:${status}`;
        validators.set(key, ajv.compile({
          $schema: "https://json-schema.org/draft/2020-12/schema",
          components: spec.components,
          ...structuredClone(schema),
        }));
      }
    }
  }

  const covered = new Set();
  return {
    covered,
    expected: new Set(validators.keys()),
    validate(operationId, status, payload) {
      const key = `${operationId}:${status}`;
      const validator = validators.get(key);
      assert.ok(validator, `No documented success schema for ${key}`);
      assert.ok(
        validator(payload),
        `${key} payload does not match OpenAPI: ${ajv.errorsText(validator.errors, { separator: "; " })}`,
      );
      covered.add(key);
      return payload;
    },
  };
}

export function createErrorResponseValidator(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validator = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    components: spec.components,
    $ref: "#/components/schemas/Error",
  });
  const operations = new Map();
  for (const pathItem of Object.values(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(method.toLowerCase()) && operation?.operationId) {
        operations.set(operation.operationId, operation);
      }
    }
  }

  return {
    async validate(operationId, response) {
      const documented = operations.get(operationId)?.responses?.[response.status];
      assert.equal(
        documented?.$ref?.startsWith("#/components/responses/"), true,
        `No documented error response for ${operationId}:${response.status}`,
      );
      const payload = await json(response);
      assert.ok(validator(payload), `${operationId}:${response.status} error does not match OpenAPI: ${ajv.errorsText(validator.errors)}`);
      assert.ok(response.headers.get("x-request-id"), `${operationId}:${response.status} is missing X-Request-Id`);
      assert.equal(payload.request_id, response.headers.get("x-request-id"), `${operationId}:${response.status} request_id must match X-Request-Id`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (response.status === 401) assert.equal(response.headers.get("www-authenticate"), 'Bearer realm="lalgeo-maps-api"');
      return payload;
    },
  };
}

function readOption(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

export function normalizeDatabaseName(value) {
  const database = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(database)) {
    throw new Error("Database names may contain only letters, numbers, underscores, and hyphens (maximum 128 characters).");
  }
  return database;
}

export function normalizeRequestHostname(value) {
  const hostname = String(value || "").trim().toLowerCase();
  const validLabels = hostname.split(".").every((label) => (
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
  if (!hostname || hostname.length > 253 || !validLabels) {
    throw new Error("Request hostname must be a plain DNS hostname without a protocol, port, path, or credentials.");
  }
  return hostname;
}

export function parseArguments(argv, cwd = process.cwd()) {
  let workerDirectory = DEFAULT_WORKER_DIRECTORY;
  let database = DEFAULT_DATABASE;
  let requestHostname = DEFAULT_REQUEST_HOSTNAME;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--worker-directory") {
      workerDirectory = path.resolve(cwd, readOption(argv, index, "--worker-directory"));
      index += 1;
    } else if (argument.startsWith("--worker-directory=")) {
      const value = argument.slice("--worker-directory=".length);
      if (!value) throw new Error("--worker-directory requires a value.");
      workerDirectory = path.resolve(cwd, value);
    } else if (argument === "--database") {
      database = normalizeDatabaseName(readOption(argv, index, "--database"));
      index += 1;
    } else if (argument.startsWith("--database=")) {
      database = normalizeDatabaseName(argument.slice("--database=".length));
    } else if (argument === "--request-hostname") {
      requestHostname = normalizeRequestHostname(readOption(argv, index, "--request-hostname"));
      index += 1;
    } else if (argument.startsWith("--request-hostname=")) {
      requestHostname = normalizeRequestHostname(argument.slice("--request-hostname=".length));
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return { workerDirectory, database, requestHostname, help };
}

export function usage() {
  return [
    "Usage: node scripts/verify-local.mjs [options]",
    "",
    `  --worker-directory <path>  Worker package to exercise (default: ${DEFAULT_WORKER_DIRECTORY})`,
    `  --database <name>          Local D1 database name (default: ${DEFAULT_DATABASE})`,
    "  --request-hostname <host>  Hostname presented to the local Worker",
    "  --help                     Show this help",
    "",
    "Migrations and the development Worker always run locally; deployment is always a dry run.",
  ].join("\n");
}

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
      cwd: options.cwd,
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

async function requireWorkerTarget(workerDirectory, wrangler) {
  const workerStats = await stat(workerDirectory).catch(() => null);
  assert.ok(workerStats?.isDirectory(), `Worker directory does not exist: ${workerDirectory}`);
  await access(path.join(workerDirectory, "package.json"));
  const configPresent = await Promise.any([
    access(path.join(workerDirectory, "wrangler.jsonc")),
    access(path.join(workerDirectory, "wrangler.json")),
    access(path.join(workerDirectory, "wrangler.toml")),
  ]).then(() => true, () => false);
  assert.ok(configPresent, `Worker directory has no Wrangler configuration: ${workerDirectory}`);
  await access(wrangler);
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

async function successJson(response, responseContract, operationId) {
  return responseContract.validate(operationId, response.status, await json(response));
}

async function errorJson(response, errorContract, operationId) {
  return errorContract.validate(operationId, response);
}

async function waitForWorker(baseUrl, child, logs, expectedStatus = 200) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Wrangler stopped before becoming ready.\n${logs().trim()}`);
    }
    try {
      const response = await request(baseUrl, "/v1/health", { redirect: "manual" });
      if (response.status === expectedStatus) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Wrangler did not become ready within 20 seconds.\n${logs().trim()}`);
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

function createRequestValidators(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return Object.fromEntries(
    ["MapInput", "MapPatchInput", "LayerInput", "LayerPatchInput", "Feature"].map((name) => [
      name,
      ajv.compile({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        components: spec.components,
        $ref: `#/components/schemas/${name}`,
      }),
    ]),
  );
}

async function main({ workerDirectory, database, requestHostname }) {
  const wrangler = path.join(workerDirectory, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  await requireWorkerTarget(workerDirectory, wrangler);
  const mapsProjectContract = loadLalGeoProjectContract();
  const openApiSpec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));
  const responseContract = createSuccessResponseValidator(openApiSpec);
  const errorContract = createErrorResponseValidator(openApiSpec);
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
    await run(wrangler, ["d1", "migrations", "apply", database, "--local", "--persist-to", stateDirectory], { cwd: workerDirectory, env: childEnvironment });
    record("fresh D1 migrations apply locally");

    await run(wrangler, ["deploy", "--dry-run", "--outdir", bundleDirectory], { cwd: workerDirectory, env: childEnvironment });
    record("Worker deployment bundle builds without publishing");

    const hostnameArguments = requestHostname ? ["--host", requestHostname] : [];
    const secureHostnameArguments = requestHostname
      ? ["--host", requestHostname, "--upstream-protocol", "https"]
      : [];
    if (requestHostname) {
      const redirectPort = await availablePort();
      assert.ok(redirectPort, "could not reserve a transport-probe port");
      const redirectBaseUrl = `http://127.0.0.1:${redirectPort}`;
      let redirectServer;
      let redirectLogs = "";
      try {
        redirectServer = spawn(wrangler, [
          "dev",
          "--local",
          ...hostnameArguments,
          "--upstream-protocol", "http",
          "--ip", "127.0.0.1",
          "--port", String(redirectPort),
          "--persist-to", stateDirectory,
          "--log-level", "error",
          "--var", `LALGEO_MAPS_API_KEYS:${bindings}`,
          "--var", `CORS_ALLOWED_ORIGINS:${allowedOrigin}`,
        ], {
          cwd: workerDirectory,
          env: childEnvironment,
          stdio: ["ignore", "pipe", "pipe"],
        });
        redirectServer.stdout.on("data", (chunk) => { redirectLogs += chunk; });
        redirectServer.stderr.on("data", (chunk) => { redirectLogs += chunk; });
        await waitForWorker(redirectBaseUrl, redirectServer, () => redirectLogs, 308);
        const redirectResponse = await request(redirectBaseUrl, "/v1/health?probe=transport", { redirect: "manual" });
        assert.equal(redirectResponse.status, 308);
        const redirectLocation = new URL(redirectResponse.headers.get("location"));
        assert.equal(redirectLocation.protocol, "https:");
        assert.equal(redirectLocation.pathname, "/v1/health");
        assert.equal(redirectLocation.search, "?probe=transport");
        assert.equal(redirectResponse.headers.get("cache-control"), "no-store");
        assert.ok(redirectResponse.headers.get("x-request-id"));
        assert.equal(await redirectResponse.text(), "");

        const sharedPathResponse = await request(redirectBaseUrl, "/v1/transport-probe?surface=shared", { redirect: "manual" });
        assert.equal(sharedPathResponse.status, 308);
        const sharedLocation = new URL(sharedPathResponse.headers.get("location"));
        assert.equal(sharedLocation.protocol, "https:");
        assert.equal(sharedLocation.pathname, "/v1/transport-probe");
        assert.equal(sharedLocation.search, "?surface=shared");
        assert.equal(sharedPathResponse.headers.get("cache-control"), "no-store");
        assert.ok(sharedPathResponse.headers.get("x-request-id"));
        assert.equal(await sharedPathResponse.text(), "");
        record(`canonical HTTP requests redirect permanently across the shared ${requestHostname} Worker`);
      } finally {
        await stop(redirectServer);
      }
    }

    devServer = spawn(wrangler, [
      "dev",
      "--local",
      ...secureHostnameArguments,
      "--ip", "127.0.0.1",
      "--port", String(port),
      "--persist-to", stateDirectory,
      "--log-level", "error",
      "--var", `LALGEO_MAPS_API_KEYS:${bindings}`,
      "--var", `CORS_ALLOWED_ORIGINS:${allowedOrigin}`,
    ], {
      cwd: workerDirectory,
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
    assert.equal(publicVerification.operationCount, 22);
    assert.equal(publicVerification.successSchemaCount, 17);
    assert.equal(publicVerification.bodylessSuccessCount, 5);
    assert.equal(publicVerification.errorResponseCount, 87);
    const healthSchemaResponse = await request(baseUrl, "/v1/health");
    assert.equal(healthSchemaResponse.status, 200);
    if (requestHostname) assert.equal(healthSchemaResponse.headers.get("strict-transport-security"), "max-age=31536000");
    await successJson(healthSchemaResponse, responseContract, "getHealth");
    const openApiSchemaResponse = await request(baseUrl, "/v1/openapi.json");
    assert.equal(openApiSchemaResponse.status, 200);
    await successJson(openApiSchemaResponse, responseContract, "getOpenApi");
    if (requestHostname) {
      const sharedPathResponse = await request(baseUrl, "/v1/transport-probe?surface=shared", { redirect: "manual" });
      assert.equal(sharedPathResponse.headers.get("strict-transport-security"), "max-age=31536000");
    }
    record(`strict health, OpenAPI, auth, and bounded CORS checks pass locally${requestHostname ? ` through ${requestHostname}` : ""}`);

    const authorization = { Authorization: `Bearer ${localApiKey}` };
    const unauthenticatedMapResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map");
    assert.equal(unauthenticatedMapResponse.status, 401);
    assert.equal((await errorJson(unauthenticatedMapResponse, errorContract, "getMap")).error.code, "UNAUTHORIZED");
    const invalidMetadataMapResponse = await request(baseUrl, "/v1/maps", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "invalid_metadata_map",
        name: "Invalid metadata fixture",
        metadata: [],
      }),
    });
    assert.equal(invalidMetadataMapResponse.status, 400);
    assert.equal((await errorJson(invalidMetadataMapResponse, errorContract, "createMap")).error?.code, "VALIDATION_ERROR");
    record("protected routes challenge missing keys with the documented error envelope");

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
    assert.equal((await successJson(mapResponse, responseContract, "createMap")).map?.id, "synthetic_runtime_map");
    record("authenticated client creates a synthetic map");

    const requestValidators = createRequestValidators(openApiSpec);
    const rejectInvalidInput = async (pathname, method, schema, payload, code = "VALIDATION_ERROR") => {
      assert.equal(requestValidators[schema](payload), false, `${schema} should reject ${JSON.stringify(payload)}`);
      const result = await request(baseUrl, pathname, {
        method,
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(result.status, 400, `${method} ${pathname}: ${JSON.stringify(payload)}`);
      assert.equal((await json(result)).error?.code, code);
    };
    for (const [payload, code] of [
      [{ id: null, name: "Invalid ID" }, "INVALID_ID"],
      [{ id: "", name: "Invalid ID" }, "INVALID_ID"],
      [{ id: 123, name: "Invalid ID" }, "INVALID_ID"],
      [{ id: "bad_center", name: "Invalid center", center: null }, "VALIDATION_ERROR"],
      [{ id: "bad_center", name: "Invalid center", center: { latitude: 51 } }, "VALIDATION_ERROR"],
      [{ id: "bad_center", name: "Invalid center", center: { latitude: null, longitude: null } }, "VALIDATION_ERROR"],
      [{ id: "bad_zoom", name: "Invalid zoom", zoom: null }, "VALIDATION_ERROR"],
      [{ id: "bad_type", name: "Invalid type", map_type: "terrain" }, "VALIDATION_ERROR"],
      [{ id: "bad_pois", name: "Invalid POIs", show_basemap_pois: "false" }, "VALIDATION_ERROR"],
      [{ id: "bad_description", name: "Invalid description", description: { text: "wrong" } }, "VALIDATION_ERROR"],
      [{ id: "bad_metadata", name: "Invalid metadata", metadata: null }, "VALIDATION_ERROR"],
    ]) {
      await rejectInvalidInput("/v1/maps", "POST", "MapInput", payload, code);
    }
    const mapsAfterInvalidCreates = await request(baseUrl, "/v1/maps", { headers: authorization });
    assert.deepEqual((await successJson(mapsAfterInvalidCreates, responseContract, "listMaps")).maps.map((map) => map.id), ["synthetic_runtime_map"]);
    const generatedMapResponse = await request(baseUrl, "/v1/maps", {
      method: "POST", headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Generated ID fixture" }),
    });
    assert.equal(generatedMapResponse.status, 201);
    const generatedMap = (await successJson(generatedMapResponse, responseContract, "createMap")).map;
    assert.match(generatedMap.id, /^map_[a-f0-9]{32}$/);
    assert.equal(generatedMap.center, null);
    assert.equal(generatedMap.zoom, null);
    const generatedMapDelete = await request(baseUrl, `/v1/maps/${generatedMap.id}`, { method: "DELETE", headers: authorization });
    assert.equal(generatedMapDelete.status, 204);
    record("invalid map fields and explicit IDs fail without creating a map");

    const initialMapResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", { headers: authorization });
    const initialMap = (await successJson(initialMapResponse, responseContract, "getMap")).map;
    for (const payload of [
      { center: { latitude: 51 } },
      { center: { longitude: -114 } },
      { center: { latitude: null, longitude: -114 } },
      { center: {} },
      { show_basemap_pois: "false" },
      { description: 42 },
      { map_type: null },
      { zoom: "12" },
      { metadata: null },
    ]) {
      await rejectInvalidInput("/v1/maps/synthetic_runtime_map", "PATCH", "MapPatchInput", payload);
      const current = await request(baseUrl, "/v1/maps/synthetic_runtime_map", { headers: authorization });
      assert.deepEqual((await successJson(current, responseContract, "getMap")).map, initialMap);
    }
    const unchangedExport = await request(baseUrl, "/v1/maps/synthetic_runtime_map/export", { headers: authorization });
    assert.deepEqual((await successJson(unchangedExport, responseContract, "exportMap")).project.mapOptions.center, { lat: 51.0447, lng: -114.0719 });
    const clearedCenterPayload = { center: null, zoom: null };
    assert.equal(requestValidators.MapPatchInput(clearedCenterPayload), true);
    const clearedCenterResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", {
      method: "PATCH", headers: { ...authorization, "Content-Type": "application/json" }, body: JSON.stringify(clearedCenterPayload),
    });
    assert.equal(clearedCenterResponse.status, 200);
    const clearedMap = (await successJson(clearedCenterResponse, responseContract, "updateMap")).map;
    assert.equal(clearedMap.center, null);
    assert.equal(clearedMap.zoom, null);
    const restoredCenterResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", {
      method: "PATCH", headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ center: initialMap.center, zoom: initialMap.zoom }),
    });
    assert.equal(restoredCenterResponse.status, 200);
    assert.deepEqual((await successJson(restoredCenterResponse, responseContract, "updateMap")).map.center, initialMap.center);
    record("partial centers cannot corrupt maps; explicit null clears center and zoom");

    const invalidMetadataPatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: "not-an-object" }),
    });
    assert.equal(invalidMetadataPatchResponse.status, 400);
    assert.equal((await errorJson(invalidMetadataPatchResponse, errorContract, "updateMap")).error?.code, "VALIDATION_ERROR");
    const unchangedMapResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", { headers: authorization });
    assert.equal(unchangedMapResponse.status, 200);
    assert.deepEqual((await successJson(unchangedMapResponse, responseContract, "getMap")).map?.metadata, {});
    record("schema-breaking map metadata is rejected without mutation");

    const emptyExportResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/export", { headers: authorization });
    assert.equal(emptyExportResponse.status, 200);
    const emptyExport = await successJson(emptyExportResponse, responseContract, "exportMap");
    const repeatedEmptyExportResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/export", { headers: authorization });
    assert.equal(repeatedEmptyExportResponse.status, 200);
    assert.deepEqual(await successJson(repeatedEmptyExportResponse, responseContract, "exportMap"), emptyExport);
    const importedEmptyMap = mapsProjectContract.validateLalGeoProject(emptyExport.project, { fileName: "synthetic-empty-map.lal" });
    assert.equal(importedEmptyMap.layers.length, 1);
    assert.equal(importedEmptyMap.layers[0].id, "empty_points");
    assert.equal(importedEmptyMap.layers[0].name, "Points");
    assert.equal(importedEmptyMap.layers[0].geometryType, "point");
    assert.equal(importedEmptyMap.layers[0].selectable, true);
    assert.equal(importedEmptyMap.layers[0].features.length, 0);
    assert.equal(emptyExport.project.activeLayerId, "empty_points");
    assert.equal(emptyExport.activeLayerId, "empty_points");
    assert.equal(importedEmptyMap.activeLayerId, "empty_points");
    assert.ok(importedEmptyMap.layers[0].schema.some((field) => field.name === "ID"));
    assert.equal(importedEmptyMap.layers[0].styleDefaults.symbol_color, "Red");
    assert.equal(importedEmptyMap.layers[0].styleDefaults.pointAggregation, 60);
    const untouchedLayersResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", { headers: authorization });
    assert.equal(untouchedLayersResponse.status, 200);
    assert.deepEqual((await successJson(untouchedLayersResponse, responseContract, "listLayers")).layers, []);
    record("empty maps export as stable editable Maps projects without mutating API layers");

    const mapListResponse = await request(baseUrl, "/v1/maps?limit=10&offset=0", { headers: authorization });
    assert.equal(mapListResponse.status, 200);
    assert.deepEqual((await successJson(mapListResponse, responseContract, "listMaps")).maps?.map((map) => map.id), ["synthetic_runtime_map"]);
    const mapGetResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", { headers: authorization });
    assert.equal(mapGetResponse.status, 200);
    assert.equal((await successJson(mapGetResponse, responseContract, "getMap")).map?.name, "Synthetic runtime map");
    const mapPatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Disposable local contract fixture" }),
    });
    assert.equal(mapPatchResponse.status, 200);
    assert.equal((await successJson(mapPatchResponse, responseContract, "updateMap")).map?.description, "Disposable local contract fixture");
    record("map list, read, and update routes share one owner scope");

    const invalidStyleLayerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "invalid_style_layer", name: "Invalid style fixture", geometry_type: "Point", style: [] }),
    });
    assert.equal(invalidStyleLayerResponse.status, 400);
    assert.equal((await errorJson(invalidStyleLayerResponse, errorContract, "createLayer")).error?.code, "VALIDATION_ERROR");

    const layerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "places", name: "Places", geometry_type: "Point" }),
    });
    assert.equal(layerResponse.status, 201);
    assert.equal((await successJson(layerResponse, responseContract, "createLayer")).layer?.id, "places");

    for (const position of [null, "2", 1.5, 9007199254740992]) {
      await rejectInvalidInput("/v1/maps/synthetic_runtime_map/layers", "POST", "LayerInput", {
        id: "invalid_position_layer", name: "Invalid position fixture", geometry_type: "Point", position,
      });
    }
    const layersAfterInvalidCreate = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", { headers: authorization });
    assert.deepEqual((await successJson(layersAfterInvalidCreate, responseContract, "listLayers")).layers.map((layer) => layer.id), ["places"]);
    record("invalid layer positions fail without creating a layer");

    const initialLayerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", { headers: authorization });
    const initialLayer = (await successJson(initialLayerResponse, responseContract, "getLayer")).layer;
    for (const position of [null, "2", 1.5, 9007199254740992]) {
      await rejectInvalidInput("/v1/maps/synthetic_runtime_map/layers/places", "PATCH", "LayerPatchInput", { position });
      const current = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", { headers: authorization });
      assert.deepEqual((await successJson(current, responseContract, "getLayer")).layer, initialLayer);
    }
    record("invalid layer updates fail without changing position or timestamps");

    const routeLayerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "routes", name: "Routes", geometry_type: "LineString", position: 1 }),
    });
    assert.equal(routeLayerResponse.status, 201);
    assert.equal((await successJson(routeLayerResponse, responseContract, "createLayer")).layer?.geometry_type, "LineString");

    const areaLayerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "areas", name: "Areas", geometry_type: "Polygon", position: 2 }),
    });
    assert.equal(areaLayerResponse.status, 201);
    assert.equal((await successJson(areaLayerResponse, responseContract, "createLayer")).layer?.geometry_type, "Polygon");
    record("authenticated client creates every supported layer type");

    const emptyLayersExportResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/export", { headers: authorization });
    assert.equal(emptyLayersExportResponse.status, 200);
    const emptyLayersExport = await successJson(emptyLayersExportResponse, responseContract, "exportMap");
    const importedEmptyLayers = mapsProjectContract.validateLalGeoProject(emptyLayersExport.project, { fileName: "synthetic-empty-layers.lal" });
    assert.equal(importedEmptyLayers.layers.length, 3);
    assert.deepEqual([...importedEmptyLayers.layers].map((layer) => layer.id), ["places", "routes", "areas"]);
    assert.ok(importedEmptyLayers.layers.every((layer) => layer.features.length === 0));
    record("maps with empty layers still open through the Maps validator");

    const layerListResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers", { headers: authorization });
    assert.equal(layerListResponse.status, 200);
    assert.deepEqual((await successJson(layerListResponse, responseContract, "listLayers")).layers?.map((layer) => layer.id), ["places", "routes", "areas"]);
    const layerGetResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", { headers: authorization });
    assert.equal(layerGetResponse.status, 200);
    const unstyledLayer = await successJson(layerGetResponse, responseContract, "getLayer");
    assert.equal(unstyledLayer.layer?.geometry_type, "Point");
    assert.deepEqual(unstyledLayer.layer?.style, {});
    const invalidStylePatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ style: "not-an-object" }),
    });
    assert.equal(invalidStylePatchResponse.status, 400);
    assert.equal((await errorJson(invalidStylePatchResponse, errorContract, "updateLayer")).error?.code, "VALIDATION_ERROR");
    const unchangedLayerResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", { headers: authorization });
    assert.equal(unchangedLayerResponse.status, 200);
    assert.deepEqual((await successJson(unchangedLayerResponse, responseContract, "getLayer")).layer?.style, {});
    record("schema-breaking layer styles are rejected without mutation");
    const layerPatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ style: { symbol_color: "Blue" }, position: 2 }),
    });
    assert.equal(layerPatchResponse.status, 200);
    assert.equal((await successJson(layerPatchResponse, responseContract, "updateLayer")).layer?.style?.symbol_color, "Blue");
    record("layer list, read, and update routes preserve type and style");

    await rejectInvalidInput("/v1/maps/synthetic_runtime_map/layers/places/features", "POST", "Feature", {
      type: "Feature", id: null, geometry: { type: "Point", coordinates: [-114.051, 51.0453] }, properties: {},
    }, "INVALID_ID");

    const invalidAltitudeResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "Feature",
        id: "invalid_altitude",
        geometry: { type: "Point", coordinates: [-114.051, 51.0453, "high"] },
        properties: {},
      }),
    });
    assert.equal(invalidAltitudeResponse.status, 400);
    assert.equal((await errorJson(invalidAltitudeResponse, errorContract, "createFeatures")).error?.code, "INVALID_GEOMETRY");

    const extraDimensionResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "Feature",
        id: "unsupported_4d_position",
        geometry: { type: "Point", coordinates: [-114.051, 51.0453, 1048.5, 7] },
        properties: {},
      }),
    });
    assert.equal(extraDimensionResponse.status, 400);
    assert.equal((await errorJson(extraDimensionResponse, errorContract, "createFeatures")).error?.code, "INVALID_GEOMETRY");

    const featureResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "Feature",
        id: "central_library",
        geometry: { type: "Point", coordinates: [-114.051, 51.0453, 1048.5] },
        properties: {
          name: "Central Library · Bibliothèque 🌐",
          source: "synthetic",
          nullable_note: null,
          field_01: "A01", field_02: "A02", field_03: "A03", field_04: "A04",
          field_05: "A05", field_06: "A06", field_07: "A07", field_08: "A08",
          field_09: "A09", field_10: "A10", field_11: "A11", field_12: "A12",
        },
      }),
    });
    assert.equal(featureResponse.status, 201);
    assert.equal((await successJson(featureResponse, responseContract, "createFeatures")).features?.[0]?.id, "central_library");

    const routeFeatureResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/routes/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "Feature",
        id: "river_path",
        geometry: { type: "LineString", coordinates: [[-114.0719, 51.0447, 1045.25], [-114.06, 51.045, 0], [-114.051, 51.0453]] },
        properties: { name: "Réseau rivière α", nullable_note: null },
      }),
    });
    assert.equal(routeFeatureResponse.status, 201);
    await successJson(routeFeatureResponse, responseContract, "createFeatures");

    const areaFeatureResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/areas/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "Feature",
        id: "park_with_pond",
        geometry: {
          type: "Polygon",
          coordinates: [
            [[-114.08, 51.04, -12], [-114.04, 51.04, -10], [-114.04, 51.07, -8], [-114.08, 51.04, -12]],
            [[-114.065, 51.047, 4], [-114.055, 51.047], [-114.055, 51.055, 0], [-114.065, 51.047, 4]],
          ],
        },
        properties: { name: "Parcelle Été", status: "draft" },
      }),
    });
    assert.equal(areaFeatureResponse.status, 201);
    await successJson(areaFeatureResponse, responseContract, "createFeatures");
    record("authenticated client creates valid GeoJSON for every layer type");

    const featureListResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", { headers: authorization });
    assert.equal(featureListResponse.status, 200);
    assert.deepEqual((await successJson(featureListResponse, responseContract, "listFeatures")).features?.map((feature) => feature.id), ["central_library"]);
    const featureGetResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features/central_library", { headers: authorization });
    assert.equal(featureGetResponse.status, 200);
    assert.equal((await successJson(featureGetResponse, responseContract, "getFeature")).properties?.name, "Central Library · Bibliothèque 🌐");
    const featurePatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features/central_library", {
      method: "PATCH",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: {
          name: "Central Library · Bibliothèque 🌐",
          source: "synthetic updated",
          nullable_note: null,
          field_01: "A01", field_02: "A02", field_03: "A03", field_04: "A04",
          field_05: "A05", field_06: "A06", field_07: "A07", field_08: "A08",
          field_09: "A09", field_10: "A10", field_11: "A11", field_12: "A12",
        },
      }),
    });
    assert.equal(featurePatchResponse.status, 200);
    assert.equal((await successJson(featurePatchResponse, responseContract, "updateFeature")).properties?.source, "synthetic updated");
    record("feature list, read, and update routes preserve GeoJSON");

    const conflictResponse = await request(baseUrl, "/v1/maps", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "synthetic_runtime_map", name: "Synthetic retry" }),
    });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await errorJson(conflictResponse, errorContract, "createMap")).error?.code, "ID_CONFLICT");
    record("duplicate client IDs fail without duplicating data");

    const oversizedBatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/geo+json" },
      body: JSON.stringify({
        type: "FeatureCollection",
        features: Array.from({ length: 1_001 }, (_, index) => ({
          type: "Feature", id: `batch_${index}`,
          geometry: { type: "Point", coordinates: [-114.05, 51.04] }, properties: {},
        })),
      }),
    });
    assert.equal(oversizedBatchResponse.status, 413);
    assert.equal((await errorJson(oversizedBatchResponse, errorContract, "createFeatures")).error?.code, "BATCH_TOO_LARGE");
    const afterOversizedBatchResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/layers/places/features", { headers: authorization });
    assert.equal(afterOversizedBatchResponse.status, 200);
    assert.deepEqual((await successJson(afterOversizedBatchResponse, responseContract, "listFeatures")).features.map((feature) => feature.id), ["central_library"]);
    record("oversized feature batches return the documented 413 without partial inserts");

    const issueOpenLink = (payload) => request(baseUrl, "/v1/maps/synthetic_runtime_map/open-links", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json", Origin: allowedOrigin },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const defaultLinkIssuedAt = Date.now();
    const defaultOpenLinkResponse = await issueOpenLink(undefined);
    assert.equal(defaultOpenLinkResponse.status, 201);
    const defaultOpenLink = await successJson(defaultOpenLinkResponse, responseContract, "createMapOpenLink");
    const defaultExpiresAfterMs = Date.parse(defaultOpenLink.expires_at) - defaultLinkIssuedAt;
    assert.ok(defaultExpiresAfterMs >= 599_000 && defaultExpiresAfterMs <= 605_000);
    for (const expiresIn of [60, 900]) {
      const boundaryResponse = await issueOpenLink({ expires_in: expiresIn });
      assert.equal(boundaryResponse.status, 201);
      await successJson(boundaryResponse, responseContract, "createMapOpenLink");
    }
    for (const expiresIn of [59, 901, 60.5, "60", null]) {
      const invalidTtlResponse = await issueOpenLink({ expires_in: expiresIn });
      assert.equal(invalidTtlResponse.status, 400);
      assert.equal((await errorJson(invalidTtlResponse, errorContract, "createMapOpenLink")).error?.code, "VALIDATION_ERROR");
    }
    record("map-open links enforce the documented default and 60–900 second lifetime");

    const linkIssuedAt = Date.now();
    const openLinkResponse = await issueOpenLink({ expires_in: 120 });
    assert.equal(openLinkResponse.status, 201);
    assert.equal(openLinkResponse.headers.get("access-control-allow-origin"), allowedOrigin);
    const openLink = await successJson(openLinkResponse, responseContract, "createMapOpenLink");
    const openUrl = new URL(openLink.open_url);
    assert.equal(openUrl.origin, allowedOrigin);
    assert.equal(openUrl.pathname, "/maps");
    assert.equal(openUrl.search, "");
    assert.equal(openUrl.username, "");
    assert.equal(openUrl.password, "");
    assert.equal(openLink.open_url.includes(localApiKey), false);
    const openToken = new URLSearchParams(openUrl.hash.slice(1)).get("open");
    assert.match(openToken || "", /^[a-f0-9]{64}$/);
    const expiresAfterMs = Date.parse(openLink.expires_at) - linkIssuedAt;
    assert.ok(expiresAfterMs >= 119_000 && expiresAfterMs <= 125_000);

    const redeem = (token) => request(baseUrl, "/v1/map-open/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      body: JSON.stringify({ token }),
    });
    const redeemedResponse = await redeem(openToken);
    assert.equal(redeemedResponse.status, 200);
    assert.equal(redeemedResponse.headers.get("access-control-allow-origin"), allowedOrigin);
    const exported = await successJson(redeemedResponse, responseContract, "redeemMapOpenLink");

    const reusedResponse = await redeem(openToken);
    assert.equal(reusedResponse.status, 404);
    const reusedError = await errorJson(reusedResponse, errorContract, "redeemMapOpenLink");
    assert.equal(reusedError.error?.code, "OPEN_LINK_UNAVAILABLE");
    const invalidResponse = await redeem("0".repeat(64));
    assert.equal(invalidResponse.status, 404);
    const invalidError = await errorJson(invalidResponse, errorContract, "redeemMapOpenLink");
    assert.equal(invalidError.error?.code, "OPEN_LINK_UNAVAILABLE");
    for (const payload of [{}, { token: "short" }]) {
      const malformedResponse = await request(baseUrl, "/v1/map-open/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: allowedOrigin },
        body: JSON.stringify(payload),
      });
      assert.equal(malformedResponse.status, 404);
      const malformedError = await errorJson(malformedResponse, errorContract, "redeemMapOpenLink");
      assert.equal(malformedError.error?.code, reusedError.error.code);
      assert.equal(malformedError.error?.message, reusedError.error.message);
    }
    const oversizedRedeemResponse = await request(baseUrl, "/v1/map-open/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      body: JSON.stringify({ token: "0".repeat(512) }),
    });
    assert.equal(oversizedRedeemResponse.status, 413);
    assert.equal((await errorJson(oversizedRedeemResponse, errorContract, "redeemMapOpenLink")).error?.code, "BODY_TOO_LARGE");

    const concurrentOpenLinkResponse = await issueOpenLink({ expires_in: 120 });
    const concurrentOpenLink = await successJson(concurrentOpenLinkResponse, responseContract, "createMapOpenLink");
    const concurrentToken = new URLSearchParams(new URL(concurrentOpenLink.open_url).hash.slice(1)).get("open");
    const concurrentResponses = await Promise.all([redeem(concurrentToken), redeem(concurrentToken)]);
    assert.deepEqual(concurrentResponses.map((result) => result.status).sort(), [200, 404]);
    const concurrentSuccess = concurrentResponses.find((result) => result.status === 200);
    const concurrentFailure = concurrentResponses.find((result) => result.status === 404);
    assert.deepEqual(await successJson(concurrentSuccess, responseContract, "redeemMapOpenLink"), exported);
    assert.equal((await errorJson(concurrentFailure, errorContract, "redeemMapOpenLink")).error?.code, "OPEN_LINK_UNAVAILABLE");
    record("short-lived fragment links expose no API key and exactly one concurrent redemption succeeds");

    const exportResponse = await request(baseUrl, "/v1/maps/synthetic_runtime_map/export", { headers: authorization });
    assert.equal(exportResponse.status, 200);
    assert.deepEqual(await successJson(exportResponse, responseContract, "exportMap"), exported);
    const imported = mapsProjectContract.validateLalGeoProject(exported.project, { fileName: "synthetic-api-export.lal" });
    assert.equal(imported.layers.length, 3);
    assert.ok(imported.layers.some((layer) => layer.id === imported.activeLayerId));
    assert.equal(imported.source?.type, "lalgeo-maps-api");
    const importedPoint = imported.layers.find((layer) => layer.id === "places").features[0];
    const importedLine = imported.layers.find((layer) => layer.id === "routes").features[0];
    const importedPolygon = imported.layers.find((layer) => layer.id === "areas").features[0];
    assert.equal(importedPoint.id, "central_library");
    assert.equal(importedPoint.attributes.name, "Central Library · Bibliothèque 🌐");
    assert.equal(importedPoint.attributes.nullable_note, null);
    assert.equal(importedPoint.attributes.field_12, "A12");
    assert.equal(importedPoint.geometry.altitude, 1048.5);
    assert.equal(importedLine.geometry.coordinates.length, 3);
    assert.equal(importedLine.geometry.coordinates[0].altitude, 1045.25);
    assert.equal(importedLine.geometry.coordinates[1].altitude, 0);
    assert.equal(Object.hasOwn(importedLine.geometry.coordinates[2], "altitude"), false);
    assert.equal(importedLine.attributes.name, "Réseau rivière α");
    assert.equal(importedPolygon.geometry.rings.length, 2);
    assert.equal(importedPolygon.geometry.rings[0][0].altitude, -12);
    assert.equal(Object.hasOwn(importedPolygon.geometry.rings[1][1], "altitude"), false);
    assert.equal(importedPolygon.geometry.rings[1][2].altitude, 0);
    assert.equal(importedPolygon.attributes.name, "Parcelle Été");
    record("API export passes the Maps project validator");

    importedPoint.attributes.review_status = "Reviewed in Maps";
    importedPoint.version += 1;
    const mapsReExport = JSON.parse(JSON.stringify({
      project: mapsProjectContract.serializeProjectForStorage(imported),
      activeLayerId: imported.activeLayerId,
      survey: null,
    }));
    const reopened = mapsProjectContract.validateLalGeoProject(mapsReExport.project, { fileName: "synthetic-maps-re-export.lal" });
    const reopenedPoint = reopened.layers.find((layer) => layer.id === "places").features[0];
    assert.equal(reopenedPoint.attributes.review_status, "Reviewed in Maps");
    assert.equal(reopenedPoint.version, 2);
    assert.equal(reopenedPoint.geometry.altitude, 1048.5);
    assert.equal(reopened.layers.find((layer) => layer.id === "areas").features[0].geometry.rings.length, 2);
    assert.equal(reopened.layers.find((layer) => layer.id === "areas").features[0].geometry.rings[0][0].altitude, -12);
    assert.equal(reopened.source?.mapId, "synthetic_runtime_map");
    record("Maps validator and serializer preserve covered geometry and attributes");

    assert.deepEqual([...responseContract.covered].sort(), [...responseContract.expected].sort());
    record(`all ${responseContract.expected.size} body-bearing operation payloads match their OpenAPI success schemas`);

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
    assert.equal((await errorJson(deletedMapResponse, errorContract, "getMap")).error?.code, "MAP_NOT_FOUND");
    record("feature, layer, and map deletes leave no local fixture behind");

    // A second disposable Worker proves the auth-configuration failure without
    // changing any credential or production binding. Stop the first process so
    // Wrangler's default inspector port is not shared by two local servers.
    await stop(devServer);
    const misconfiguredPort = await availablePort();
    assert.ok(misconfiguredPort, "could not reserve a misconfiguration-probe port");
    const misconfiguredBaseUrl = `http://127.0.0.1:${misconfiguredPort}`;
    serverLogs = "";
    devServer = spawn(wrangler, [
      "dev", "--local", ...secureHostnameArguments,
      "--ip", "127.0.0.1", "--port", String(misconfiguredPort),
      "--persist-to", stateDirectory, "--log-level", "error",
      "--var", "LALGEO_MAPS_API_KEYS:{invalid-json",
      "--var", `CORS_ALLOWED_ORIGINS:${allowedOrigin}`,
    ], {
      cwd: workerDirectory,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    devServer.stdout.on("data", (chunk) => { serverLogs += chunk; });
    devServer.stderr.on("data", (chunk) => { serverLogs += chunk; });
    await waitForWorker(misconfiguredBaseUrl, devServer, () => serverLogs);
    const badConfigResponse = await request(misconfiguredBaseUrl, "/v1/maps", { headers: authorization });
    assert.equal(badConfigResponse.status, 503);
    assert.equal((await errorJson(badConfigResponse, errorContract, "listMaps")).error?.code, "AUTH_NOT_CONFIGURED");
    record("invalid local authentication configuration returns the documented 503");

    // A valid synthetic key against an intentionally unmigrated *local* D1
    // database checks the unexpected-error envelope without fault hooks in the
    // production Worker or any access to the real database.
    await stop(devServer);
    const unmigratedPort = await availablePort();
    assert.ok(unmigratedPort, "could not reserve an unmigrated-database probe port");
    const unmigratedBaseUrl = `http://127.0.0.1:${unmigratedPort}`;
    serverLogs = "";
    devServer = spawn(wrangler, [
      "dev", "--local", ...secureHostnameArguments,
      "--ip", "127.0.0.1", "--port", String(unmigratedPort),
      "--persist-to", path.join(stateDirectory, "unmigrated"), "--log-level", "error",
      "--var", `LALGEO_MAPS_API_KEYS:${bindings}`,
      "--var", `CORS_ALLOWED_ORIGINS:${allowedOrigin}`,
    ], {
      cwd: workerDirectory,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    devServer.stdout.on("data", (chunk) => { serverLogs += chunk; });
    devServer.stderr.on("data", (chunk) => { serverLogs += chunk; });
    await waitForWorker(unmigratedBaseUrl, devServer, () => serverLogs);
    const missingTableResponse = await request(unmigratedBaseUrl, "/v1/maps", { headers: authorization });
    assert.equal(missingTableResponse.status, 500);
    const missingTableError = await errorJson(missingTableResponse, errorContract, "listMaps");
    assert.equal(missingTableError.error?.code, "INTERNAL_ERROR");
    assert.equal(missingTableError.error?.message, "An unexpected error occurred.");
    assert.equal(Object.hasOwn(missingTableError.error, "details"), false);
    record("unmigrated disposable D1 returns the documented 500 without leaking details");

    process.stdout.write(`\nMaps API local release gate passed ${checks.length}/${checks.length}. No production resources were contacted.\n`);
  } finally {
    await stop(devServer);
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

async function cli() {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    if (arguments_.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    await main(arguments_);
  } catch (error) {
    process.stderr.write(`Maps API local release gate failed after ${checks.length} checks.\n${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

export async function isEntryPoint(candidate = process.argv[1]) {
  if (!candidate) return false;
  const [modulePath, candidatePath] = await Promise.all([
    realpath(fileURLToPath(import.meta.url)),
    realpath(path.resolve(candidate)).catch(() => null),
  ]);
  return candidatePath === modulePath;
}

if (await isEntryPoint()) await cli();
