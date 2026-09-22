export type JsonObject = Record<string, unknown>;

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

  createMap(input: JsonObject) {
    return this.request("POST", "/v1/maps", input);
  }

  createLayer(mapId: string, input: JsonObject) {
    return this.request("POST", `/v1/maps/${encodeURIComponent(mapId)}/layers`, input);
  }

  addFeatures(mapId: string, layerId: string, features: unknown[]) {
    return this.request(
      "POST",
      `/v1/maps/${encodeURIComponent(mapId)}/layers/${encodeURIComponent(layerId)}/features`,
      { type: "FeatureCollection", features },
    );
  }

  updateMap(mapId: string, input: JsonObject) {
    return this.request("PATCH", `/v1/maps/${encodeURIComponent(mapId)}`, input);
  }

  exportMap(mapId: string) {
    return this.request("GET", `/v1/maps/${encodeURIComponent(mapId)}/export`);
  }

  createMapOpenLink(mapId: string) {
    return this.request("POST", `/v1/maps/${encodeURIComponent(mapId)}/open-links`, { expires_in: 600 });
  }

  private async request(method: string, path: string, body?: JsonObject) {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload: unknown = await response.json().catch(() => ({
      error: { code: "INVALID_RESPONSE", message: "LalGeo API returned a non-JSON response." },
    }));
    if (!response.ok) {
      throw new LalGeoApiError(response.status, payload, response.headers.get("x-request-id"));
    }
    return payload;
  }
}
