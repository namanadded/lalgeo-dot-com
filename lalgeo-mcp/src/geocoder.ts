export class GeocodeError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

export type GeocodeResult = {
  query: string;
  coordinates: { latitude: number; longitude: number };
  place: Record<string, unknown>;
};

export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult>;
}

export class AppleMapsGeocoder implements Geocoder {
  constructor(
    private readonly mapsToken: string,
    private readonly baseUrl = "https://maps-api.apple.com",
  ) {}

  async geocode(query: string): Promise<GeocodeResult> {
    const url = new URL("/v1/search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("lang", "en-CA");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.mapsToken}`, Accept: "application/json" },
    });
    const payload = await response.json().catch(() => null) as { results?: unknown[] } | null;
    if (!response.ok) {
      throw new GeocodeError("GEOCODING_FAILED", `LalGeo place search failed with status ${response.status}.`, payload);
    }

    const place = payload?.results?.[0];
    if (!place || typeof place !== "object" || Array.isArray(place)) {
      throw new GeocodeError("PLACE_NOT_FOUND", `No place matched "${query}".`);
    }
    const coordinate = (place as { coordinate?: { latitude?: unknown; longitude?: unknown } }).coordinate;
    if (typeof coordinate?.latitude !== "number" || typeof coordinate.longitude !== "number") {
      throw new GeocodeError("INVALID_PLACE_RESULT", "LalGeo place search returned a match without coordinates.");
    }

    return {
      query,
      coordinates: { latitude: coordinate.latitude, longitude: coordinate.longitude },
      place: place as Record<string, unknown>,
    };
  }
}
