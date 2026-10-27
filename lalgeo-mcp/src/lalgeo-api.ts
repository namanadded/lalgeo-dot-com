export type JsonObject = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CREDENTIAL_RESPONSE_BYTES = 64_000;

const INVALID_RESPONSE = {
  error: { code: "INVALID_RESPONSE", message: "LalGeo API returned an invalid response." },
};

type RequestOptions = {
  idempotencyKey?: string;
  maxResponseBytes?: number;
};

export type IdempotencyMetadata = {
  replayed: boolean;
  expires_at: string;
};

export type IdempotentCreateResult = {
  payload: unknown;
  idempotency: IdempotencyMetadata | null;
};

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
    return this.requestCreate("/v1/maps", input, idempotencyKey);
  }

  createLayer(mapId: string, input: JsonObject, idempotencyKey?: string) {
    return this.requestCreate(`/v1/maps/${encodeURIComponent(mapId)}/layers`, input, idempotencyKey);
  }

  addFeatures(mapId: string, layerId: string, features: unknown[], idempotencyKey?: string) {
    return this.requestCreate(
      `/v1/maps/${encodeURIComponent(mapId)}/layers/${encodeURIComponent(layerId)}/features`,
      { type: "FeatureCollection", features },
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

  private async requestCreate(path: string, body: JsonObject, idempotencyKey?: string): Promise<IdempotentCreateResult> {
    const { payload, response } = await this.requestResult("POST", path, body, { idempotencyKey });
    if (!idempotencyKey) return { payload, idempotency: null };

    const replayed = response.headers.get("idempotency-replayed");
    const expiresAt = response.headers.get("idempotency-key-expires-at");
    if ((replayed !== "true" && replayed !== "false") || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      throw new LalGeoApiError(502, INVALID_RESPONSE, response.headers.get("x-request-id"));
    }
    return {
      payload,
      idempotency: { replayed: replayed === "true", expires_at: expiresAt },
    };
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
