export type JsonObject = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CREDENTIAL_RESPONSE_BYTES = 64_000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_OPEN_LINK_TTL_SECONDS = 900;
const CLOCK_TOLERANCE_SECONDS = 60;
const IDEMPOTENCY_READINESS_HEADER = "X-LalGeo-Readiness-Probe";
const IDEMPOTENCY_READINESS_VALUE = "map-idempotency-store-v1";

const INVALID_RESPONSE = {
  error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid response." },
};

const IDEMPOTENCY_UNAVAILABLE = {
  error: {
    code: "IDEMPOTENCY_UNAVAILABLE",
    message: "LalGeo API did not confirm durable create replay. No create request was sent.",
  },
};

const CREATE_OUTCOME_UNCONFIRMED = {
  error: {
    code: "CREATE_OUTCOME_UNCONFIRMED",
    message: "LalGeo API returned an unverified create response. Do not retry automatically; inspect the stable resource ID first, or report the request ID when no stable ID was supplied.",
  },
};

const EXPORT_RESPONSE_UNCONFIRMED = {
  error: {
    code: "EXPORT_RESPONSE_UNCONFIRMED",
    message: "LalGeo API returned an unverified portable project. No map-open link was requested.",
  },
};

const OPEN_LINK_OUTCOME_UNCONFIRMED = {
  error: {
    code: "OPEN_LINK_OUTCOME_UNCONFIRMED",
    message: "LalGeo API returned an unverified map-open response. Do not retry automatically; an undisclosed single-use link may expire unused.",
  },
};

const IDEMPOTENCY_UNCONFIRMED_WARNING =
  "The create succeeded, but its replay headers were missing or invalid. Preserve the returned IDs and inspect the result before retrying.";

type RequestOptions = {
  idempotencyKey?: string;
  maxResponseBytes?: number;
};

export type IdempotencyMetadata =
  | { confirmed: true; replayed: boolean; expires_at: string }
  | { confirmed: false; replayed: null; expires_at: null; warning: string };

export type RateLimitMetadata = {
  limit: number;
  remaining: number;
  reset_after_seconds: number;
  retry_after_seconds: number;
};

export type IdempotentCreateResult = {
  payload: unknown;
  idempotency: IdempotencyMetadata | null;
};

type CreatePayloadValidator = (payload: unknown) => boolean;

function objectProperty(value: unknown, property: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as JsonObject)[property];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as JsonObject
    : null;
}

function isMapCreatePayload(payload: unknown) {
  const map = objectProperty(payload, "map");
  return typeof map?.id === "string" && map.id.length > 0;
}

function isLayerCreatePayload(payload: unknown) {
  const layer = objectProperty(payload, "layer");
  return typeof layer?.id === "string" && layer.id.length > 0 &&
    typeof layer.map_id === "string" && layer.map_id.length > 0;
}

function isFeatureCreatePayload(payload: unknown) {
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) &&
    (payload as JsonObject).type === "FeatureCollection" && Array.isArray((payload as JsonObject).features));
}

function isPortableLayer(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const layer = value as JsonObject;
  return typeof layer.id === "string" && layer.id.length > 0 &&
    typeof layer.name === "string" && layer.name.length > 0 &&
    ["point", "line", "polygon"].includes(String(layer.geometryType)) &&
    layer.selectable === true &&
    Boolean(layer.styleDefaults && typeof layer.styleDefaults === "object" && !Array.isArray(layer.styleDefaults)) &&
    Array.isArray(layer.schema) && Array.isArray(layer.features) &&
    layer.features.every((feature) => {
      if (!feature || typeof feature !== "object" || Array.isArray(feature)) return false;
      const candidate = feature as JsonObject;
      return typeof candidate.id === "string" && candidate.id.length > 0 &&
        Boolean(candidate.geometry && typeof candidate.geometry === "object" && !Array.isArray(candidate.geometry)) &&
        Boolean(candidate.attributes && typeof candidate.attributes === "object" && !Array.isArray(candidate.attributes)) &&
        candidate.version === 1;
    });
}

function isPortableProject(payload: unknown, mapId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const envelope = payload as JsonObject;
  const project = objectProperty(envelope, "project");
  const source = project ? objectProperty(project, "source") : null;
  const mapOptions = project ? objectProperty(project, "mapOptions") : null;
  const metadata = project ? objectProperty(project, "metadata") : null;
  if (!project || !source || !mapOptions || !metadata ||
      project.id !== mapId || source.type !== "lalgeo-maps-api" || source.mapId !== mapId ||
      typeof project.name !== "string" || !project.name || typeof project.description !== "string" ||
      project.type !== "API project" || project.storageSource !== "LalGeo Maps API" ||
      typeof mapOptions.showBasemapPOIs !== "boolean" ||
      !["standard", "satellite", "hybrid"].includes(String(mapOptions.mapType)) ||
      !Array.isArray(project.layers) || project.layers.length === 0 ||
      !project.layers.every(isPortableLayer) ||
      typeof project.activeLayerId !== "string" || project.activeLayerId !== envelope.activeLayerId ||
      !project.layers.some((layer) => (layer as JsonObject).id === project.activeLayerId) ||
      envelope.survey !== null) return false;
  return true;
}

function rfc3339Millis(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const calendarSecond = Math.min(parts[5], 59);
  const calendar = new Date(0);
  calendar.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  calendar.setUTCHours(parts[3], parts[4], calendarSecond, 0);
  if (calendar.getUTCFullYear() !== parts[0] || calendar.getUTCMonth() !== parts[1] - 1 ||
      calendar.getUTCDate() !== parts[2] || calendar.getUTCHours() !== parts[3] ||
      calendar.getUTCMinutes() !== parts[4] || calendar.getUTCSeconds() !== calendarSecond || parts[5] > 60 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return null;
  const normalized = (parts[5] === 60
    ? value.replace(/:60(?=(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$)/, ":59")
    : value).replace("t", "T").replace(/z$/, "Z");
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? milliseconds + (parts[5] === 60 ? 1_000 : 0) : null;
}

function isOpenLinkPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const link = payload as JsonObject;
  const expiresAt = rfc3339Millis(link.expires_at);
  const currentTime = Date.now();
  return Object.keys(link).length === 2 &&
    typeof link.open_url === "string" && /^https:\/\/maps\.lalgeo\.com\/maps#open=[0-9a-f]{64}$/.test(link.open_url) &&
    expiresAt !== null && expiresAt > currentTime &&
    expiresAt <= currentTime + (MAX_OPEN_LINK_TTL_SECONDS + CLOCK_TOLERANCE_SECONDS) * 1_000;
}

function isJsonResponse(response: Response) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function integerHeader(response: Response, name: string, minimum: number, maximum: number) {
  const value = response.headers.get(name);
  if (!value || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function rateLimitMetadata(response: Response, payload: unknown): RateLimitMetadata | null {
  if (response.status !== 429 || !isJsonResponse(response) ||
      !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as JsonObject;
  const error = objectProperty(body, "error");
  const details = error ? objectProperty(error, "details") : null;
  const requestId = response.headers.get("x-request-id");
  const limit = integerHeader(response, "ratelimit-limit", RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_MAX_REQUESTS);
  const remaining = integerHeader(response, "ratelimit-remaining", 0, 0);
  const resetAfter = integerHeader(response, "ratelimit-reset", 1, RATE_LIMIT_WINDOW_SECONDS);
  const retryAfter = integerHeader(response, "retry-after", 1, RATE_LIMIT_WINDOW_SECONDS);
  if (
    error?.code !== "RATE_LIMITED" ||
    typeof requestId !== "string" || !requestId || body.request_id !== requestId ||
    limit === null || remaining === null ||
    resetAfter === null || retryAfter === null || resetAfter !== retryAfter ||
    details?.retry_after_seconds !== retryAfter
  ) return null;
  return {
    limit,
    remaining,
    reset_after_seconds: resetAfter,
    retry_after_seconds: retryAfter,
  };
}

function redactSecret(value: unknown, secret: string): unknown {
  if (typeof value === "string") return value.replaceAll(secret, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redactSecret(item, secret));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonObject).map(([key, item]) => [
    key.replaceAll(secret, "[REDACTED]"),
    redactSecret(item, secret),
  ]));
}

function redactedRequestId(response: Response, secret: string) {
  const requestId = response.headers.get("x-request-id");
  return typeof requestId === "string" ? requestId.replaceAll(secret, "[REDACTED]") : null;
}

async function readJson(response: Response, maxBytes?: number): Promise<unknown> {
  if (maxBytes === undefined) return response.json();

  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Response is too large.");
  if (!response.body) throw new Error("Response body is missing.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Response is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export class LalGeoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    public readonly requestId: string | null,
    public readonly rateLimit: RateLimitMetadata | null = null,
  ) {
    super(`LalGeo API request failed with status ${status}.`);
  }
}

export class LalGeoApi {
  private idempotencyReadiness: Promise<void> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.lalgeo.com",
  ) {}

  async verifyCredentials() {
    const probeId = `mcp_credential_probe_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await this.request("GET", `/v1/maps/${probeId}`, undefined, {
        maxResponseBytes: MAX_CREDENTIAL_RESPONSE_BYTES,
      });
    } catch (error) {
      const payload = error instanceof LalGeoApiError &&
          error.payload && typeof error.payload === "object" && !Array.isArray(error.payload)
        ? error.payload as JsonObject
        : null;
      const payloadError = payload?.error && typeof payload.error === "object" && !Array.isArray(payload.error)
        ? payload.error as JsonObject
        : null;
      if (
        error instanceof LalGeoApiError &&
        error.status === 404 &&
        payloadError?.code === "MAP_NOT_FOUND" &&
        typeof error.requestId === "string" &&
        error.requestId.length > 0 &&
        payload?.request_id === error.requestId
      ) return;
      throw error;
    }
    throw new LalGeoApiError(502, {
      error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid credential check response." },
    }, null);
  }

  createMap(input: JsonObject, idempotencyKey?: string) {
    return this.requestCreate("/v1/maps", input, isMapCreatePayload, idempotencyKey);
  }

  createLayer(mapId: string, input: JsonObject, idempotencyKey?: string) {
    return this.requestCreate(`/v1/maps/${encodeURIComponent(mapId)}/layers`, input, isLayerCreatePayload, idempotencyKey);
  }

  addFeatures(mapId: string, layerId: string, features: unknown[], idempotencyKey?: string) {
    return this.requestCreate(
      `/v1/maps/${encodeURIComponent(mapId)}/layers/${encodeURIComponent(layerId)}/features`,
      { type: "FeatureCollection", features },
      isFeatureCreatePayload,
      idempotencyKey,
    );
  }

  updateMap(mapId: string, input: JsonObject) {
    return this.request("PATCH", `/v1/maps/${encodeURIComponent(mapId)}`, input);
  }

  async exportMap(mapId: string) {
    const { payload, response } = await this.requestResult("GET", `/v1/maps/${encodeURIComponent(mapId)}/export`);
    if (response.status !== 200 || !isJsonResponse(response) || !isPortableProject(payload, mapId)) {
      throw new LalGeoApiError(502, EXPORT_RESPONSE_UNCONFIRMED, redactedRequestId(response, this.apiKey));
    }
    return payload;
  }

  async listLayerIds(mapId: string) {
    const payload = await this.request("GET", `/v1/maps/${encodeURIComponent(mapId)}/layers`);
    const layers = payload && typeof payload === "object"
      ? (payload as JsonObject).layers
      : undefined;
    if (!Array.isArray(layers)) {
      throw new LalGeoApiError(502, {
        error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid layer list." },
      }, null);
    }
    return layers.map((layer) => {
      if (!layer || typeof layer !== "object" || typeof (layer as JsonObject).id !== "string") {
        throw new LalGeoApiError(502, {
          error: { code: "INVALID_RESPONSE", message: "LalGeo API returned a layer without an ID." },
        }, null);
      }
      return (layer as JsonObject).id as string;
    });
  }

  async createMapOpenLink(mapId: string) {
    const { payload, response } = await this.requestResult(
      "POST",
      `/v1/maps/${encodeURIComponent(mapId)}/open-links`,
      { expires_in: 600 },
    );
    if (response.status !== 201 || !isJsonResponse(response) || !isOpenLinkPayload(payload)) {
      throw new LalGeoApiError(502, OPEN_LINK_OUTCOME_UNCONFIRMED, redactedRequestId(response, this.apiKey));
    }
    return payload;
  }

  private async requestCreate(
    path: string,
    body: JsonObject,
    validatePayload: CreatePayloadValidator,
    idempotencyKey?: string,
  ): Promise<IdempotentCreateResult> {
    if (idempotencyKey) await this.ensureIdempotencyReadiness();
    const { payload, response } = await this.requestResult("POST", path, body, { idempotencyKey });
    if (response.status !== 201 || !isJsonResponse(response) || !validatePayload(payload)) {
      throw new LalGeoApiError(502, CREATE_OUTCOME_UNCONFIRMED, redactedRequestId(response, this.apiKey));
    }
    if (!idempotencyKey) return { payload, idempotency: null };

    const replayed = response.headers.get("idempotency-replayed");
    const expiresAt = response.headers.get("idempotency-key-expires-at");
    if ((replayed !== "true" && replayed !== "false") || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      return {
        payload,
        idempotency: {
          confirmed: false,
          replayed: null,
          expires_at: null,
          warning: IDEMPOTENCY_UNCONFIRMED_WARNING,
        },
      };
    }
    return {
      payload,
      idempotency: { confirmed: true, replayed: replayed === "true", expires_at: expiresAt },
    };
  }

  private async ensureIdempotencyReadiness() {
    const pending = this.idempotencyReadiness ?? this.probeIdempotencyReadiness();
    this.idempotencyReadiness = pending;
    try {
      await pending;
    } finally {
      if (this.idempotencyReadiness === pending) this.idempotencyReadiness = null;
    }
  }

  private async probeIdempotencyReadiness() {
    let response: Response;
    try {
      response = await fetch(new URL("/v1/health", this.baseUrl), {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
          [IDEMPOTENCY_READINESS_HEADER]: IDEMPOTENCY_READINESS_VALUE,
        },
      });
    } catch {
      throw new LalGeoApiError(503, IDEMPOTENCY_UNAVAILABLE, null);
    }

    const requestId = response.headers.get("x-request-id");
    const payload = await readJson(response, MAX_CREDENTIAL_RESPONSE_BYTES).catch(() => INVALID_RESPONSE);
    if (!response.ok) throw new LalGeoApiError(response.status, payload, requestId);
    const exactHealth = payload && typeof payload === "object" && !Array.isArray(payload) &&
      Object.keys(payload).length === 3 &&
      (payload as JsonObject).ok === true &&
      (payload as JsonObject).service === "lalgeo-maps-api" &&
      (payload as JsonObject).version === "v1";
    if (!exactHealth || response.headers.get(IDEMPOTENCY_READINESS_HEADER) !== IDEMPOTENCY_READINESS_VALUE) {
      throw new LalGeoApiError(503, IDEMPOTENCY_UNAVAILABLE, requestId);
    }
  }

  private async request(method: string, path: string, body?: JsonObject, options: RequestOptions = {}) {
    return (await this.requestResult(method, path, body, options)).payload;
  }

  private async requestResult(method: string, path: string, body?: JsonObject, options: RequestOptions = {}) {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload: unknown = await readJson(response, options.maxResponseBytes).catch(() => INVALID_RESPONSE);
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      throw new LalGeoApiError(
        response.status,
        redactSecret(payload, this.apiKey),
        typeof requestId === "string" ? requestId.replaceAll(this.apiKey, "[REDACTED]") : null,
        rateLimitMetadata(response, payload),
      );
    }
    return { payload: redactSecret(payload, this.apiKey), response };
  }
}
