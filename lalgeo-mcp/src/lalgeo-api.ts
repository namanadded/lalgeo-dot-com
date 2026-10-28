export type JsonObject = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CREDENTIAL_RESPONSE_BYTES = 64_000;
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

const IDEMPOTENCY_UNCONFIRMED_WARNING =
  "The create succeeded, but its replay headers were missing or invalid. Preserve the returned IDs and inspect the result before retrying.";

type RequestOptions = {
  idempotencyKey?: string;
  maxResponseBytes?: number;
};

export type IdempotencyMetadata =
  | { confirmed: true; replayed: boolean; expires_at: string }
  | { confirmed: false; replayed: null; expires_at: null; warning: string };

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

function isJsonResponse(response: Response) {
  return response.headers.get("content-type")?.toLowerCase().startsWith("application/json") === true;
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

  exportMap(mapId: string) {
    return this.request("GET", `/v1/maps/${encodeURIComponent(mapId)}/export`);
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

  createMapOpenLink(mapId: string) {
    return this.request("POST", `/v1/maps/${encodeURIComponent(mapId)}/open-links`, { expires_in: 600 });
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
      throw new LalGeoApiError(502, CREATE_OUTCOME_UNCONFIRMED, response.headers.get("x-request-id"));
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
      throw new LalGeoApiError(response.status, payload, response.headers.get("x-request-id"));
    }
    return { payload, response };
  }
}
