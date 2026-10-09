import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AppleMapsGeocoder, GeocodeError } from "../src/geocoder.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("geocoder delegates to Apple Maps search and returns the best existing match", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps-access-token", expiresInSeconds: 1800 });
    }
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
  assert.equal(calls[0].url.pathname, "/v1/token");
  assert.equal(calls[0].init.headers.Authorization, "Bearer mapkit-token");
  assert.equal(calls[1].url.origin, "https://maps-api.apple.com");
  assert.equal(calls[1].url.pathname, "/v1/search");
  assert.equal(calls[1].url.searchParams.get("q"), "Calgary Tower");
  assert.equal(calls[1].init.headers.Authorization, "Bearer maps-access-token");
  assert.equal(calls[1].init.headers.Origin, "https://mcp.lalgeo.com");
  assert.equal(calls[1].init.headers.Referer, "https://mcp.lalgeo.com/");
  assert.deepEqual(result.coordinates, { latitude: 51.0447, longitude: -114.0631 });
  assert.equal(result.place.formattedAddress, "101 9 Ave SW, Calgary, AB");
});

test("geocoder reports a clear no-match error", async () => {
  globalThis.fetch = async (url) => {
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "maps-access-token", expiresInSeconds: 1800 });
    }
    return Response.json({ results: [] });
  };
  const geocoder = new AppleMapsGeocoder("mapkit-token");

  await assert.rejects(geocoder.geocode("not a real place"), (error) => {
    assert.ok(error instanceof GeocodeError);
    assert.equal(error.code, "PLACE_NOT_FOUND");
    return true;
  });
});

test("geocoder reuses a fresh Apple Maps access token", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.pathname === "/v1/token") {
      return Response.json({ accessToken: "cached-access-token", expiresInSeconds: 1800 });
    }
    return Response.json({ results: [{
      name: "Calgary Tower",
      coordinate: { latitude: 51.0447, longitude: -114.0631 },
    }] });
  };
  const geocoder = new AppleMapsGeocoder("mapkit-token");

  await geocoder.geocode("Calgary Tower");
  await geocoder.geocode("Calgary Tower");

  assert.equal(calls.filter((call) => call.url.pathname === "/v1/token").length, 1);
  assert.equal(calls.filter((call) => call.url.pathname === "/v1/search").length, 2);
});
