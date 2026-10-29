import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const apiDirectory = fileURLToPath(new URL("..", import.meta.url));
const typescriptDirectory = path.join(apiDirectory, "examples", "typescript");
const pythonQuickstart = path.join(apiDirectory, "examples", "python", "quickstart.py");
const syntheticKey = "lalgeo_synthetic_quickstart_test_key";
const openToken = "a".repeat(64);
const openUrl = `https://maps.lalgeo.com/maps#open=${openToken}`;
const expiresAt = "2026-10-29T08:00:00.000Z";

let temporaryDirectory;
let compiledTypescript;

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "lalgeo-api-examples-"));
  const outputDirectory = path.join(temporaryDirectory, "typescript");
  const result = await execute(
    path.join(apiDirectory, "node_modules", ".bin", "tsc"),
    ["--project", path.join(typescriptDirectory, "tsconfig.json"), "--outDir", outputDirectory, "--noEmit", "false"],
    { cwd: apiDirectory },
  );
  assert.equal(result.code, 0, `TypeScript quickstart did not compile:\n${result.stderr}${result.stdout}`);
  compiledTypescript = await findFile(outputDirectory, "quickstart.js");

  const pythonResult = await execute("python3", ["-m", "py_compile", pythonQuickstart], {
    cwd: apiDirectory,
    env: { PYTHONPYCACHEPREFIX: path.join(temporaryDirectory, "python-cache") },
  });
  assert.equal(pythonResult.code, 0, `Python quickstart did not compile:\n${pythonResult.stderr}${pythonResult.stdout}`);
});

after(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

const clients = [
  {
    name: "TypeScript",
    command: () => process.execPath,
    args: () => [compiledTypescript],
  },
  {
    name: "Python",
    command: () => "python3",
    args: () => [pythonQuickstart],
  },
];

for (const client of clients) {
  test(`${client.name} quickstart verifies service identity before sending credentials`, async () => {
    const scenario = createScenario({ idempotency: false, wrongHealth: true });
    const result = await runScenario(client, scenario);

    assert.notEqual(result.code, 0, "A mismatched service identity must stop the quickstart.");
    assert.deepEqual(scenario.requests.map(({ operation }) => operation), ["health"]);
    assert.equal(scenario.requests.some(({ headers }) => headers.authorization !== undefined), false);
    assert.equal(result.stdout.includes(syntheticKey), false);
    assert.equal(result.stderr.includes(syntheticKey), false);
  });

  test(`${client.name} quickstart completes the legacy contract without undocumented retry headers`, async () => {
    const scenario = createScenario({ idempotency: false });
    const result = await runScenario(client, scenario);

    assertSuccessfulResult(result, scenario);
    assertLegacyRequests(scenario);
  });

  test(`${client.name} quickstart does not blindly retry an ambiguous legacy create`, async () => {
    const scenario = createScenario({ idempotency: false, failLegacyOperation: "createMap" });
    const result = await runScenario(client, scenario);

    assert.notEqual(result.code, 0, "An ambiguous legacy create must stop for reconciliation.");
    assert.equal(scenario.requests.filter(({ operation }) => operation === "createMap").length, 1);
    assert.equal(scenario.requests.some(({ operation }) => operation === "createLayer"), false);
    assert.equal(scenario.requests.some(({ headers }) => headers["idempotency-key"] !== undefined), false);
    assert.equal(result.stdout.includes(syntheticKey), false);
    assert.equal(result.stderr.includes(syntheticKey), false);
    assert.match(result.stderr, /synthetic_createMap_1/);
    assert.match(result.stderr, /\/v1\/maps\/[A-Za-z0-9_-]+/);
  });

  test(`${client.name} quickstart never forwards the API key through a redirect`, async () => {
    const scenario = createScenario({ idempotency: false, redirectOperation: "createMap" });
    const result = await runScenario(client, scenario);

    assert.notEqual(result.code, 0, "Authenticated redirects must stop the quickstart.");
    assert.deepEqual(scenario.requests.map(({ operation }) => operation), ["health", "openApi", "createMap"]);
    assert.equal(result.stdout.includes(syntheticKey), false);
    assert.equal(result.stderr.includes(syntheticKey), false);
    assert.match(result.stderr, /HTTP 307/);
  });

  test(`${client.name} quickstart redacts a credential reflected by the API`, async () => {
    const scenario = createScenario({ idempotency: false, reflectCredentialOperation: "createMap" });
    const result = await runScenario(client, scenario);

    assert.notEqual(result.code, 0);
    assert.equal(scenario.requests.filter(({ operation }) => operation === "createMap").length, 1);
    assert.equal(result.stdout.includes(syntheticKey), false);
    assert.equal(result.stderr.includes(syntheticKey), false);
    assert.match(result.stderr, /\[redacted\]/);
  });

  test(`${client.name} quickstart retries idempotent creates exactly once with unchanged intent`, async () => {
    const scenario = createScenario({ idempotency: true, failEachIdempotentCreate: true });
    const result = await runScenario(client, scenario);

    assertSuccessfulResult(result, scenario);
    assertIdempotentRequests(scenario);
  });

  test(`${client.name} quickstart never retries one-time open-link creation`, async () => {
    const scenario = createScenario({ idempotency: true, failOpenLink: true });
    const result = await runScenario(client, scenario);

    assert.notEqual(result.code, 0, "An ambiguous open-link create must stop without minting another capability.");
    const attempts = scenario.requests.filter(({ operation }) => operation === "createOpenLink");
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].headers["idempotency-key"], undefined);
    assert.equal(result.stdout.includes(syntheticKey), false);
    assert.equal(result.stderr.includes(syntheticKey), false);
    assert.match(result.stderr, /synthetic_createOpenLink_1/);
  });
}

async function execute(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: { ...process.env, ...options.env },
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? ""),
    };
  }
}

async function findFile(directory, basename) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, basename).catch(() => undefined);
      if (nested) return nested;
    } else if (entry.name === basename) {
      return candidate;
    }
  }
  throw new Error(`Could not find ${basename} below ${directory}.`);
}

async function runScenario(client, scenario) {
  const server = http.createServer((request, response) => {
    handleRequest(scenario, request, response).catch((error) => {
      scenario.serverErrors.push(error);
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json" });
      }
      response.end(JSON.stringify({ error: { code: "TEST_SERVER_ERROR", message: "Synthetic test server failed" } }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    const result = await execute(client.command(), client.args(), {
      cwd: apiDirectory,
      env: {
        LALGEO_API_KEY: syntheticKey,
        LALGEO_API_BASE_URL: `http://127.0.0.1:${address.port}`,
      },
    });
    assert.deepEqual(scenario.serverErrors, []);
    return result;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function createScenario({
  idempotency,
  failEachIdempotentCreate = false,
  failLegacyOperation,
  failOpenLink = false,
  redirectOperation,
  reflectCredentialOperation,
  wrongHealth = false,
} = {}) {
  return {
    idempotency,
    failEachIdempotentCreate,
    failLegacyOperation,
    failOpenLink,
    redirectOperation,
    reflectCredentialOperation,
    wrongHealth,
    attempts: new Map(),
    requests: [],
    serverErrors: [],
    mapId: undefined,
    layerId: undefined,
    featureIds: undefined,
  };
}

async function handleRequest(scenario, request, response) {
  const body = await readBody(request);
  const operation = identifyOperation(request.method, request.url);
  const attempt = (scenario.attempts.get(operation) ?? 0) + 1;
  scenario.attempts.set(operation, attempt);
  scenario.requests.push({
    operation,
    attempt,
    method: request.method,
    url: request.url,
    headers: request.headers,
    body,
  });

  if (operation === "openApi") {
    assert.equal(request.headers.authorization, undefined, "Public discovery must not receive the bearer key.");
    return sendJson(response, 200, openApiDocument(scenario.idempotency), "synthetic_openapi");
  }

  if (operation === "health") {
    assert.equal(request.headers.authorization, undefined, "Public health must not receive the bearer key.");
    return sendJson(response, 200, {
      ok: true,
      service: scenario.wrongHealth ? "not-lalgeo" : "lalgeo-maps-api",
      version: "v1",
    }, "synthetic_health");
  }

  assert.equal(request.headers.authorization, `Bearer ${syntheticKey}`);
  assert.match(request.headers["content-type"] ?? "", /^application\/(?:json|geo\+json)(?:;|$)/i);

  if (scenario.redirectOperation === operation && attempt === 1) {
    response.writeHead(307, {
      "Cache-Control": "no-store",
      Location: "/credential-capture",
      "X-Request-Id": `synthetic_${operation}_redirect`,
    });
    response.end();
    return;
  }

  if (scenario.reflectCredentialOperation === operation && attempt === 1) {
    return sendJson(response, 400, {
      error: { code: "VALIDATION_ERROR", message: `Reflected credential ${syntheticKey}` },
      request_id: `request_${syntheticKey}`,
    }, `request_${syntheticKey}`);
  }

  if ((scenario.failEachIdempotentCreate && scenario.idempotency && isIdempotentCreate(operation) && attempt === 1)
    || (!scenario.idempotency && scenario.failLegacyOperation === operation && attempt === 1)
    || (scenario.failOpenLink && operation === "createOpenLink" && attempt === 1)) {
    return sendJson(response, 503, {
      error: { code: "INTERNAL_ERROR", message: "Synthetic transient failure" },
      request_id: `synthetic_${operation}_1`,
    }, `synthetic_${operation}_1`);
  }

  switch (operation) {
    case "createMap": {
      const input = parseJson(body);
      assert.match(input.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
      assert.equal(typeof input.name, "string");
      assert.equal(input.name.length > 0, true);
      assert.deepEqual(input.metadata, { source: "lalgeo-api-quickstart", synthetic: true });
      scenario.mapId = input.id;
      return sendJson(response, 201, {
        map: {
          ...input,
          description: input.description ?? "",
          center: input.center ?? null,
          zoom: input.zoom ?? null,
          map_type: input.map_type ?? "standard",
          show_basemap_pois: input.show_basemap_pois ?? true,
          metadata: input.metadata ?? {},
          created_at: "2026-10-29T07:00:00.000Z",
          updated_at: "2026-10-29T07:00:00.000Z",
        },
      }, "synthetic_create_map");
    }
    case "createLayer": {
      assert(scenario.mapId, "Map must be created before its layer.");
      assert.equal(request.url, `/v1/maps/${scenario.mapId}/layers`);
      const input = parseJson(body);
      assert.match(input.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
      assert.equal(input.geometry_type, "Point");
      scenario.layerId = input.id;
      return sendJson(response, 201, {
        layer: {
          ...input,
          map_id: scenario.mapId,
          style: input.style ?? {},
          position: input.position ?? 0,
          created_at: "2026-10-29T07:00:01.000Z",
          updated_at: "2026-10-29T07:00:01.000Z",
        },
      }, "synthetic_create_layer");
    }
    case "createFeatures": {
      assert(scenario.mapId && scenario.layerId, "Map and layer must exist before their features.");
      assert.equal(request.url, `/v1/maps/${scenario.mapId}/layers/${scenario.layerId}/features`);
      const input = parseJson(body);
      assert.equal(input.type, "FeatureCollection");
      assert.equal(input.features.length, 2);
      for (const feature of input.features) {
        assert.equal(feature.type, "Feature");
        assert.match(feature.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
        assert.equal(feature.geometry.type, "Point");
        assert.equal(feature.geometry.coordinates.length >= 2, true);
      }
      scenario.featureIds = input.features.map(({ id }) => id);
      return sendJson(response, 201, input, "synthetic_create_features");
    }
    case "createOpenLink": {
      assert(scenario.mapId, "Map must exist before its open link.");
      assert.equal(request.url, `/v1/maps/${scenario.mapId}/open-links`);
      const input = parseJson(body);
      assert.equal(input.expires_in, 600);
      return sendJson(response, 201, { open_url: openUrl, expires_at: expiresAt }, "synthetic_open_link");
    }
    default:
      throw new Error(`Unexpected ${request.method} ${request.url}`);
  }
}

function identifyOperation(method, requestUrl) {
  if (method === "GET" && requestUrl === "/v1/openapi.json") return "openApi";
  if (method === "GET" && requestUrl === "/v1/health") return "health";
  if (method === "POST" && requestUrl === "/v1/maps") return "createMap";
  if (method === "POST" && /^\/v1\/maps\/[^/]+\/layers$/.test(requestUrl)) return "createLayer";
  if (method === "POST" && /^\/v1\/maps\/[^/]+\/layers\/[^/]+\/features$/.test(requestUrl)) return "createFeatures";
  if (method === "POST" && /^\/v1\/maps\/[^/]+\/open-links$/.test(requestUrl)) return "createOpenLink";
  return "unknown";
}

function openApiDocument(idempotency) {
  const parameters = idempotency ? [{ $ref: "#/components/parameters/IdempotencyKey" }] : [];
  return {
    openapi: "3.1.0",
    info: { title: "LalGeo Maps Authoring API", version: idempotency ? "1.3.0" : "1.2.0" },
    paths: {
      "/v1/maps": { post: { operationId: "createMap", parameters } },
      "/v1/maps/{mapId}/layers": { post: { operationId: "createLayer", parameters } },
      "/v1/maps/{mapId}/layers/{layerId}/features": { post: { operationId: "createFeatures", parameters } },
      "/v1/maps/{mapId}/open-links": { post: { operationId: "createMapOpenLink" } },
    },
    components: {
      parameters: idempotency ? {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
      } : {},
    },
  };
}

function assertSuccessfulResult(result, scenario) {
  assert.equal(result.code, 0, `Quickstart failed:\n${result.stderr}${result.stdout}`);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes(syntheticKey), false);
  const output = parseJson(result.stdout);
  assert.deepEqual(Object.keys(output).sort(), ["expires_at", "map_id", "open_url"]);
  assert.equal(output.map_id, scenario.mapId);
  assert.equal(output.open_url, openUrl);
  assert.equal(output.expires_at, expiresAt);
}

function assertLegacyRequests(scenario) {
  assert.deepEqual(
    scenario.requests.map(({ operation }) => operation),
    ["health", "openApi", "createMap", "createLayer", "createFeatures", "createOpenLink"],
  );
  assert.equal(scenario.requests.some(({ headers }) => headers["idempotency-key"] !== undefined), false);
}

function assertIdempotentRequests(scenario) {
  assert.deepEqual(
    scenario.requests.map(({ operation }) => operation),
    ["health", "openApi", "createMap", "createMap", "createLayer", "createLayer", "createFeatures", "createFeatures", "createOpenLink"],
  );

  const keys = [];
  for (const operation of ["createMap", "createLayer", "createFeatures"]) {
    const attempts = scenario.requests.filter((request) => request.operation === operation);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].body, attempts[1].body, `${operation} must retain its exact serialized body.`);
    assert.equal(attempts[0].url, attempts[1].url, `${operation} must retain its exact path.`);
    assert.equal(typeof attempts[0].headers["idempotency-key"], "string");
    assert.equal(attempts[0].headers["idempotency-key"].length >= 8, true);
    assert.equal(attempts[0].headers["idempotency-key"], attempts[1].headers["idempotency-key"]);
    keys.push(attempts[0].headers["idempotency-key"]);
  }
  assert.equal(new Set(keys).size, 3, "Each intended create needs its own idempotency key.");

  const openLink = scenario.requests.filter(({ operation }) => operation === "createOpenLink");
  assert.equal(openLink.length, 1, "Open-link creation must not be retried automatically.");
  assert.equal(openLink[0].headers["idempotency-key"], undefined);
}

function isIdempotentCreate(operation) {
  return operation === "createMap" || operation === "createLayer" || operation === "createFeatures";
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    assert.fail(`Expected JSON, received ${JSON.stringify(value)}: ${error.message}`);
  }
}

function sendJson(response, status, body, requestId) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
  });
  response.end(JSON.stringify(body));
}
