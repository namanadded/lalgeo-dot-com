import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AppleMapsGeocoder, GeocodeError } from "../src/geocoder.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("geocoder delegates to Apple Maps search and returns the best existing match", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ results: [{
      name: "Calgary Tower",
      formattedAddress: "101 9 Ave SW, Calgary, AB",
      coordinate: { latitude: 51.0447, longitude: -114.0631 },
      poiCategory: "Landmark",
    }] });
  };
  const geocoder = new AppleMapsGeocoder("mapkit-token");

  const result = await geocoder.geocode("Calgary Tower");

  assert.equal(calls[0].url.origin, "https://maps-api.apple.com");
  assert.equal(calls[0].url.pathname, "/v1/search");
  assert.equal(calls[0].url.searchParams.get("q"), "Calgary Tower");
  assert.equal(calls[0].init.headers.Authorization, "Bearer mapkit-token");
  assert.deepEqual(result.coordinates, { latitude: 51.0447, longitude: -114.0631 });
  assert.equal(result.place.formattedAddress, "101 9 Ave SW, Calgary, AB");
});

test("geocoder reports a clear no-match error", async () => {
  globalThis.fetch = async () => Response.json({ results: [] });
  const geocoder = new AppleMapsGeocoder("mapkit-token");

  await assert.rejects(geocoder.geocode("not a real place"), (error) => {
    assert.ok(error instanceof GeocodeError);
    assert.equal(error.code, "PLACE_NOT_FOUND");
    return true;
  });
});
