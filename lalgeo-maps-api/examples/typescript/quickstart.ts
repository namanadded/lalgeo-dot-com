declare const process: {
  env: Record<string, string | undefined>;
  stdout: { write(value: string): void };
  stderr: { write(value: string): void };
  exitCode?: number;
};

type JsonObject = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const CREATE_OPERATIONS = {
  map: { path: "/v1/maps", operationId: "createMap" },
  layer: { path: "/v1/maps/{mapId}/layers", operationId: "createLayer" },
  features: { path: "/v1/maps/{mapId}/layers/{layerId}/features", operationId: "createFeatures" },
} as const;
const OPEN_LINK_OPERATION = { path: "/v1/maps/{mapId}/open-links", operationId: "createMapOpenLink" } as const;

class RequestFailure extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "RequestFailure";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireApiKey(): string {
  const value = process.env.LALGEO_API_KEY?.trim();
  if (!value) {
    throw new Error("Set LALGEO_API_KEY to a scoped LalGeo Maps Authoring API key.");
  }
  return value;
}

function apiBaseUrl(): string {
  const raw = process.env.LALGEO_API_BASE_URL?.trim() || "https://api.lalgeo.com";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("LALGEO_API_BASE_URL must be an absolute URL.");
  }

  const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback.has(parsed.hostname))) {
    throw new Error("LALGEO_API_BASE_URL must use HTTPS (HTTP is allowed only for a loopback test server).");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new Error("LALGEO_API_BASE_URL must contain only an origin, without credentials, a path, query, or fragment.");
  }
  return parsed.origin;
}

function postOperation(spec: unknown, path: string, operationId: string): JsonObject | undefined {
  if (!isObject(spec) || !isObject(spec.paths)) return undefined;
  const pathItem = spec.paths[path];
  if (!isObject(pathItem) || !isObject(pathItem.post) || pathItem.post.operationId !== operationId) return undefined;
  return pathItem.post;
}

function operationSupportsIdempotency(spec: unknown, path: string, operationId: string): boolean {
  const operation = postOperation(spec, path, operationId);
  if (!operation || !isObject(spec)) return false;
  const componentParameters = isObject(spec.components) && isObject(spec.components.parameters)
    ? spec.components.parameters
    : {};
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  return parameters.some((parameter) => {
    if (!isObject(parameter)) return false;
    if (parameter.name === "Idempotency-Key" && parameter.in === "header") return true;
    if (typeof parameter.$ref !== "string") return false;
    const name = parameter.$ref.split("/").at(-1);
    const resolved = name ? componentParameters[name] : undefined;
    return isObject(resolved) && resolved.name === "Idempotency-Key" && resolved.in === "header";
  });
}

function redact(value: string, sensitiveValue?: string): string {
  return sensitiveValue ? value.split(sensitiveValue).join("[redacted]") : value;
}

function requestId(response: Response, payload: unknown, sensitiveValue?: string): string | undefined {
  const header = response.headers.get("x-request-id")?.trim();
  if (header) return redact(header, sensitiveValue);
  return isObject(payload) && typeof payload.request_id === "string"
    ? redact(payload.request_id, sensitiveValue)
    : undefined;
}

async function responseText(response: Response, sensitiveValue?: string): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new RequestFailure(
      redact(`HTTP ${response.status} returned a response larger than 2 MiB${response.headers.get("x-request-id") ? ` (request ${response.headers.get("x-request-id")})` : ""}.`, sensitiveValue),
      response.status,
    );
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RequestFailure(
        redact(`HTTP ${response.status} returned a response larger than 2 MiB${response.headers.get("x-request-id") ? ` (request ${response.headers.get("x-request-id")})` : ""}.`, sensitiveValue),
        response.status,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function responsePayload(response: Response, sensitiveValue?: string): Promise<unknown> {
  const text = await responseText(response, sensitiveValue);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestFailure(
      redact(`HTTP ${response.status} returned invalid JSON${response.headers.get("x-request-id") ? ` (request ${response.headers.get("x-request-id")})` : ""}.`, sensitiveValue),
      response.status,
      RETRYABLE_STATUSES.has(response.status),
    );
  }
}

function httpFailure(response: Response, payload: unknown, sensitiveValue?: string): RequestFailure {
  const error = isObject(payload) && isObject(payload.error) ? payload.error : undefined;
  const code = error && typeof error.code === "string" ? ` ${error.code}` : "";
  const message = error && typeof error.message === "string" ? `: ${error.message}` : "";
  const id = requestId(response, payload, sensitiveValue);
  return new RequestFailure(
    redact(`HTTP ${response.status}${code}${message}${id ? ` (request ${id})` : ""}.`, sensitiveValue),
    response.status,
    RETRYABLE_STATUSES.has(response.status),
  );
}

async function fetchJson(
  url: string,
  init: RequestInit,
  expectedStatus: number,
  sensitiveValue?: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
    const payload = await responsePayload(response, sensitiveValue);
    if (response.status !== expectedStatus) throw httpFailure(response, payload, sensitiveValue);
    return payload;
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    const detail = error instanceof Error && error.name === "AbortError"
      ? `timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds`
      : "failed before a response was received";
    throw new RequestFailure(`Request ${detail}.`, undefined, true);
  } finally {
    clearTimeout(timeout);
  }
}

function ambiguousCreateMessage(operation: string, reconciliation: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : "The request failed without a confirmed response.";
  return new Error(
    `${operation} has an uncertain result. ${detail} Do not repeat it blindly; reconcile with ${reconciliation}.`,
  );
}

async function createResource(options: {
  baseUrl: string;
  apiKey: string;
  path: string;
  body: JsonObject;
  contentType?: string;
  supportsIdempotency: boolean;
  operation: string;
  reconciliation: string;
}): Promise<unknown> {
  const serializedBody = JSON.stringify(options.body);
  const idempotencyKey = options.supportsIdempotency ? crypto.randomUUID() : undefined;
  const attempts = idempotencyKey ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchJson(`${options.baseUrl}${options.path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": options.contentType || "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: serializedBody,
      }, 201, options.apiKey);
    } catch (error) {
      const retryable = error instanceof RequestFailure && error.retryable;
      if (idempotencyKey && attempt === 0 && retryable) continue;
      if (!retryable) {
        if (error instanceof RequestFailure && error.status === 409) {
          throw new Error(`${error.message} Reconcile with ${options.reconciliation} before another create.`);
        }
        throw error;
      }
      throw ambiguousCreateMessage(options.operation, options.reconciliation, error);
    }
  }

  throw new Error(`${options.operation} did not return a result.`);
}

function expectMap(payload: unknown, expectedId: string): void {
  if (!isObject(payload) || !isObject(payload.map) || payload.map.id !== expectedId) {
    throw new Error(`Create map returned an unexpected response for ${expectedId}; reconcile with GET /v1/maps/${expectedId}.`);
  }
}

function expectLayer(payload: unknown, mapId: string, layerId: string): void {
  if (!isObject(payload) || !isObject(payload.layer)
    || payload.layer.id !== layerId || payload.layer.map_id !== mapId) {
    throw new Error(
      `Create layer returned an unexpected response for ${layerId}; reconcile with GET /v1/maps/${mapId}/layers/${layerId}.`,
    );
  }
}

function expectFeatures(payload: unknown, expectedIds: string[]): void {
  if (!isObject(payload) || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("Create features returned an unexpected response; list the layer features before retrying.");
  }
  const ids = payload.features.map((feature) => isObject(feature) ? feature.id : undefined);
  if (ids.length !== expectedIds.length || expectedIds.some((id) => !ids.includes(id))) {
    throw new Error("Create features returned unexpected IDs; list the layer features before retrying.");
  }
}

function expectOpenLink(payload: unknown): { open_url: string; expires_at: string } {
  if (!isObject(payload)
    || typeof payload.open_url !== "string"
    || !/^https:\/\/maps\.lalgeo\.com\/maps#open=[0-9a-f]{64}$/.test(payload.open_url)
    || typeof payload.expires_at !== "string"
    || !Number.isFinite(Date.parse(payload.expires_at))) {
    throw new Error("Map-open link creation returned an unexpected response. Request a new link instead of retrying this request.");
  }
  return { open_url: payload.open_url, expires_at: payload.expires_at };
}

async function main(): Promise<void> {
  const apiKey = requireApiKey();
  const baseUrl = apiBaseUrl();
  const health = await fetchJson(`${baseUrl}/v1/health`, {
    headers: { Accept: "application/json" },
  }, 200);
  if (!isObject(health)
    || health.ok !== true
    || health.service !== "lalgeo-maps-api"
    || health.version !== "v1"
    || Object.keys(health).sort().join(",") !== "ok,service,version") {
    throw new Error("Health discovery did not return the exact LalGeo Maps API identity.");
  }
  const spec = await fetchJson(`${baseUrl}/v1/openapi.json`, {
    headers: { Accept: "application/json" },
  }, 200);
  if (!isObject(spec)
    || spec.openapi !== "3.1.0"
    || !isObject(spec.info)
    || spec.info.title !== "LalGeo Maps Authoring API") {
    throw new Error("OpenAPI discovery did not return the LalGeo 3.1 contract.");
  }
  for (const operation of [...Object.values(CREATE_OPERATIONS), OPEN_LINK_OPERATION]) {
    if (!postOperation(spec, operation.path, operation.operationId)) {
      throw new Error(`OpenAPI discovery is missing ${operation.operationId} at ${operation.path}.`);
    }
  }
  const supports = {
    map: operationSupportsIdempotency(spec, CREATE_OPERATIONS.map.path, CREATE_OPERATIONS.map.operationId),
    layer: operationSupportsIdempotency(spec, CREATE_OPERATIONS.layer.path, CREATE_OPERATIONS.layer.operationId),
    features: operationSupportsIdempotency(spec, CREATE_OPERATIONS.features.path, CREATE_OPERATIONS.features.operationId),
  };

  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const mapId = `quickstart_${suffix}`;
  const layerId = "places";
  const featureIds = ["central_library", "city_hall"];
  const mapPath = `/v1/maps/${encodeURIComponent(mapId)}`;
  const layerPath = `${mapPath}/layers/${encodeURIComponent(layerId)}`;

  const map = await createResource({
    baseUrl,
    apiKey,
    path: "/v1/maps",
    body: {
      id: mapId,
      name: "LalGeo API quickstart",
      description: "Synthetic map created by the LalGeo API quickstart.",
      center: { latitude: 51.0447, longitude: -114.0719 },
      zoom: 13,
      metadata: { source: "lalgeo-api-quickstart", synthetic: true },
    },
    supportsIdempotency: supports.map,
    operation: "Map creation",
    reconciliation: `GET ${mapPath}`,
  });
  expectMap(map, mapId);

  const layer = await createResource({
    baseUrl,
    apiKey,
    path: `${mapPath}/layers`,
    body: { id: layerId, name: "Places", geometry_type: "Point" },
    supportsIdempotency: supports.layer,
    operation: "Layer creation",
    reconciliation: `GET ${layerPath}`,
  });
  expectLayer(layer, mapId, layerId);

  const features = await createResource({
    baseUrl,
    apiKey,
    path: `${layerPath}/features`,
    body: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: featureIds[0],
          geometry: { type: "Point", coordinates: [-114.0510, 51.0453] },
          properties: { name: "Central Library", synthetic: true },
        },
        {
          type: "Feature",
          id: featureIds[1],
          geometry: { type: "Point", coordinates: [-114.0708, 51.0465] },
          properties: { name: "City Hall", synthetic: true },
        },
      ],
    },
    contentType: "application/geo+json",
    supportsIdempotency: supports.features,
    operation: "Feature creation",
    reconciliation: `GET ${layerPath}/features?limit=100&offset=0 and verify IDs ${featureIds.join(", ")}`,
  });
  expectFeatures(features, featureIds);

  let openPayload: unknown;
  try {
    openPayload = await fetchJson(`${baseUrl}${mapPath}/open-links`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_in: 600 }),
    }, 201, apiKey);
  } catch (error) {
    if (error instanceof RequestFailure && !error.retryable) throw error;
    const detail = error instanceof Error ? error.message : "The request failed.";
    throw new Error(
      `Map-open link creation is never retried automatically. ${detail} Inspect GET ${mapPath}, then request a fresh link when ready.`,
    );
  }
  const openLink = expectOpenLink(openPayload);

  process.stdout.write(`${JSON.stringify({ map_id: mapId, ...openLink })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  process.stderr.write(`LalGeo quickstart failed: ${message}\n`);
  process.exitCode = 1;
});
