import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";

test("MCP discovery exposes the five authoring tools plus geocode", async () => {
  const calls = [];
  const api = {
    createMap: async (input) => { calls.push(["create_map", input]); return { map: { id: "map_1" } }; },
    createLayer: async () => ({}),
    addFeatures: async () => ({}),
    updateMap: async () => ({}),
    exportMap: async () => ({}),
    createMapOpenLink: async (mapId) => { calls.push(["create_open_link", mapId]); return { open_url: "https://maps.lalgeo.com/maps#open=" + "a".repeat(64) }; },
  };
  const geocoder = { geocode: async () => { throw new Error("unexpected geocode call"); } };
  const server = createServer(api, geocoder);
  const client = new Client({ name: "lalgeo-mcp-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const discovered = await client.listTools();
    assert.deepEqual(discovered.tools.map((tool) => tool.name).sort(), [
      "add_features", "create_layer", "create_map", "export_map", "geocode", "update_map",
    ]);
    assert.ok(discovered.tools.filter((tool) => tool.name !== "geocode").every((tool) => tool._meta?.ui?.resourceUri === "ui://lalgeo/map.html"));
    assert.equal(discovered.tools.find((tool) => tool.name === "geocode")._meta?.ui, undefined);

    const resource = await client.readResource({ uri: "ui://lalgeo/map.html" });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.match(resource.contents[0].text, /ui\/notifications\/tool-result/);
    assert.match(resource.contents[0].text, /Open in LalGeo/);
    assert.match(resource.contents[0].text, /tools\/call/);
    const widgetScript = resource.contents[0].text.match(/<script>([\s\S]*)<\/script>/)?.[1];
    assert.ok(widgetScript);
    assert.doesNotThrow(() => new Function(widgetScript));

    const response = await client.callTool({ name: "create_map", arguments: { name: "Agent map" } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(response.structuredContent, {
      operation: "create_map",
      data: { map: { id: "map_1" } },
      context: { requested_map: { name: "Agent map" } },
    });
    assert.deepEqual(calls, [["create_map", { name: "Agent map" }]]);
  } finally {
    await client.close();
    await server.close();
  }
});

test('end-to-end example: "Create a map of Calgary and add these GeoJSON features."', async () => {
  const calls = [];
  const api = {
    createMap: async (input) => { calls.push(["create_map", input]); return { map: { id: "calgary_map", name: input.name, center: input.center } }; },
    createLayer: async (mapId, input) => { calls.push(["create_layer", mapId, input]); return { layer: { id: "calgary_places", map_id: mapId, ...input } }; },
    addFeatures: async (mapId, layerId, features) => { calls.push(["add_features", mapId, layerId, features]); return { type: "FeatureCollection", features }; },
    updateMap: async () => ({}),
    exportMap: async (mapId) => { calls.push(["export_map", mapId]); return { project: { id: mapId, name: "Calgary", layers: [] } }; },
    createMapOpenLink: async (mapId) => { calls.push(["create_open_link", mapId]); return { open_url: "https://maps.lalgeo.com/maps#open=" + "a".repeat(64), expires_at: "2026-09-22T06:10:00.000Z" }; },
  };
  const geocoder = { geocode: async () => { throw new Error("unexpected geocode call"); } };
  const server = createServer(api, geocoder);
  const client = new Client({ name: "calgary-example", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const features = [
    { type: "Feature", id: "city_hall", geometry: { type: "Point", coordinates: [-114.0575, 51.0466] }, properties: { name: "Calgary City Hall" } },
    { type: "Feature", id: "tower", geometry: { type: "Point", coordinates: [-114.0631, 51.0447] }, properties: { name: "Calgary Tower" } },
  ];

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await client.callTool({ name: "create_map", arguments: { id: "calgary_map", name: "Calgary", center: { latitude: 51.0447, longitude: -114.0719 }, zoom: 12 } });
    await client.callTool({ name: "create_layer", arguments: { map_id: "calgary_map", id: "calgary_places", name: "Calgary places", geometry_type: "Point" } });
    const response = await client.callTool({ name: "add_features", arguments: { map_id: "calgary_map", layer_id: "calgary_places", features } });

    assert.equal(calls.length, 3);
    assert.deepEqual(response.structuredContent, {
      operation: "add_features",
      data: { type: "FeatureCollection", features },
      context: { map_id: "calgary_map", layer_id: "calgary_places", features },
    });

    const openResponse = await client.callTool({ name: "export_map", arguments: { map_id: "calgary_map" } });
    assert.deepEqual(calls.slice(-2), [["export_map", "calgary_map"], ["create_open_link", "calgary_map"]]);
    assert.equal(openResponse._meta["lalgeo/openUrl"], "https://maps.lalgeo.com/maps#open=" + "a".repeat(64));
  } finally {
    await client.close();
    await server.close();
  }
});

test("geocode returns coordinates and matched place information", async () => {
  const match = {
    query: "Calgary Tower",
    coordinates: { latitude: 51.0447, longitude: -114.0631 },
    place: { name: "Calgary Tower", formattedAddress: "101 9 Ave SW, Calgary, AB", coordinate: { latitude: 51.0447, longitude: -114.0631 } },
  };
  const api = {
    createMap: async () => ({}), createLayer: async () => ({}), addFeatures: async () => ({}),
    updateMap: async () => ({}), exportMap: async () => ({}), createMapOpenLink: async () => ({}),
  };
  const queries = [];
  const geocoder = { geocode: async (query) => { queries.push(query); return match; } };
  const server = createServer(api, geocoder);
  const client = new Client({ name: "geocode-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({ name: "geocode", arguments: { query: "Calgary Tower" } });
    assert.deepEqual(queries, ["Calgary Tower"]);
    assert.deepEqual(response.structuredContent, match);
    assert.equal(response.isError, undefined);
  } finally {
    await client.close();
    await server.close();
  }
});
