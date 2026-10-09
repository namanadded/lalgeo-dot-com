import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LalGeoApiError } from "../src/lalgeo-api.ts";
import { createServer } from "../src/server.ts";

test("MCP discovery exposes side-effect-free inspection separately from opening a map", async () => {
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
    assert.deepEqual(client.getServerVersion(), { name: "lalgeo", version: "0.5.0" });
    const discovered = await client.listTools();
    assert.deepEqual(discovered.tools.map((tool) => tool.name).sort(), [
      "add_features", "create_layer", "create_map", "export_map", "geocode", "inspect_map", "update_map",
    ]);
    assert.ok(discovered.tools.filter((tool) => tool.name !== "geocode").every((tool) => tool._meta?.ui?.resourceUri === "ui://lalgeo/map.html"));
    assert.equal(discovered.tools.find((tool) => tool.name === "geocode")._meta?.ui, undefined);
    const exportTool = discovered.tools.find((tool) => tool.name === "export_map");
    assert.match(exportTool.description, /single-use Maps link/);
    assert.deepEqual(exportTool.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    const inspectTool = discovered.tools.find((tool) => tool.name === "inspect_map");
    assert.match(inspectTool.description, /without creating a Maps link/);
    assert.match(inspectTool.description, /timeout or ID_CONFLICT/);
    assert.match(inspectTool.description, /virtual empty_points placeholder/);
    assert.deepEqual(inspectTool.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    for (const name of ["create_map", "create_layer", "add_features"]) {
      assert.match(discovered.tools.find((tool) => tool.name === name).description, /stable ID/);
      assert.match(discovered.tools.find((tool) => tool.name === name).description, /inspect_map/);
    }

    const resource = await client.readResource({ uri: "ui://lalgeo/map.html" });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.match(resource.contents[0].text, /ui\/notifications\/tool-result/);
    assert.match(resource.contents[0].text, /Open in LalGeo/);
    assert.match(resource.contents[0].text, /tools\/call/);
    assert.match(resource.contents[0].text, /result\?\.operation === "export_map" \|\| result\?\.operation === "inspect_map"/);
    assert.match(resource.contents[0].text, /Map inspected · no stored features/);
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
  const features = [
    { type: "Feature", id: "city_hall", geometry: { type: "Point", coordinates: [-114.0575, 51.0466] }, properties: { name: "Calgary City Hall" } },
    { type: "Feature", id: "tower", geometry: { type: "Point", coordinates: [-114.0631, 51.0447] }, properties: { name: "Calgary Tower" } },
  ];
  const portableProject = {
    project: {
      id: "calgary_map",
      name: "Calgary",
      layers: [{
        id: "calgary_places",
        name: "Calgary places",
        geometryType: "point",
        features: features.map((feature) => ({
          id: feature.id,
          geometry: { type: "Point", lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] },
          attributes: feature.properties,
        })),
      }],
    },
  };
  const api = {
    createMap: async (input) => { calls.push(["create_map", input]); return { map: { id: "calgary_map", name: input.name, center: input.center } }; },
    createLayer: async (mapId, input) => { calls.push(["create_layer", mapId, input]); return { layer: { id: "calgary_places", map_id: mapId, ...input } }; },
    addFeatures: async (mapId, layerId, features) => { calls.push(["add_features", mapId, layerId, features]); return { type: "FeatureCollection", features }; },
    updateMap: async () => ({}),
    exportMap: async (mapId) => { calls.push(["export_map", mapId]); return portableProject; },
    listLayerIds: async (mapId) => { calls.push(["list_layer_ids", mapId]); return ["calgary_places"]; },
    createMapOpenLink: async (mapId) => { calls.push(["create_open_link", mapId]); return { open_url: "https://maps.lalgeo.com/maps#open=" + "a".repeat(64), expires_at: "2026-09-22T06:10:00.000Z" }; },
  };
  const geocoder = { geocode: async () => { throw new Error("unexpected geocode call"); } };
  const server = createServer(api, geocoder);
  const client = new Client({ name: "calgary-example", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

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

    const inspectResponse = await client.callTool({ name: "inspect_map", arguments: { map_id: "calgary_map" } });
    assert.deepEqual(calls.slice(-2), [
      ["export_map", "calgary_map"],
      ["list_layer_ids", "calgary_map"],
    ]);
    assert.equal(calls.some(([operation]) => operation === "create_open_link"), false);
    assert.deepEqual(inspectResponse.structuredContent, {
      operation: "inspect_map",
      data: portableProject,
      context: {
        map_id: "calgary_map",
        view: "portable_project",
        stored_layer_ids: ["calgary_places"],
        empty_map_placeholder_id: "empty_points",
      },
    });
    assert.equal(inspectResponse.structuredContent.data.project.layers[0].features.length, 2);
    assert.equal(inspectResponse._meta?.["lalgeo/openUrl"], undefined);

    const openResponse = await client.callTool({ name: "export_map", arguments: { map_id: "calgary_map" } });
    assert.deepEqual(calls.slice(-2), [["export_map", "calgary_map"], ["create_open_link", "calgary_map"]]);
    assert.equal(openResponse._meta["lalgeo/openUrl"], "https://maps.lalgeo.com/maps#open=" + "a".repeat(64));
  } finally {
    await client.close();
    await server.close();
  }
});

test("a stable-ID conflict is reconciled by inspection without a duplicate write or open link", async () => {
  const calls = [];
  const existing = {
    project: {
      id: "field_map",
      name: "Field map",
      layers: [{
        id: "sites",
        name: "Sites",
        geometryType: "point",
        features: [{
          id: "well_1",
          geometry: { type: "Point", lng: -114, lat: 51 },
          attributes: { status: "checked" },
        }],
      }],
    },
  };
  const api = {
    createMap: async (input) => {
      calls.push(["create_map", input]);
      throw new LalGeoApiError(409, {
        error: { code: "ID_CONFLICT", message: "That ID already exists." },
        request_id: "request_conflict",
      }, "request_conflict");
    },
    createLayer: async () => ({}),
    addFeatures: async () => ({}),
    updateMap: async () => ({}),
    exportMap: async (mapId) => { calls.push(["export_map", mapId]); return existing; },
    listLayerIds: async (mapId) => { calls.push(["list_layer_ids", mapId]); return ["sites"]; },
    createMapOpenLink: async (mapId) => { calls.push(["create_open_link", mapId]); return {}; },
  };
  const geocoder = { geocode: async () => { throw new Error("unexpected geocode call"); } };
  const server = createServer(api, geocoder);
  const client = new Client({ name: "reconciliation-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const conflict = await client.callTool({ name: "create_map", arguments: { id: "field_map", name: "Field map" } });
    assert.equal(conflict.isError, true);
    assert.match(conflict.content[0].text, /ID_CONFLICT/);

    const reconciled = await client.callTool({ name: "inspect_map", arguments: { map_id: "field_map" } });
    assert.equal(reconciled.isError, undefined);
    assert.deepEqual(reconciled.structuredContent.data, existing);
    assert.deepEqual(reconciled.structuredContent.context.stored_layer_ids, ["sites"]);
    assert.equal(reconciled.structuredContent.context.empty_map_placeholder_id, "empty_points");
    assert.deepEqual(calls, [
      ["create_map", { id: "field_map", name: "Field map" }],
      ["export_map", "field_map"],
      ["list_layer_ids", "field_map"],
    ]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("inspection labels the virtual empty-map layer without issuing a handoff", async () => {
  const calls = [];
  const portableEmptyMap = {
    project: {
      id: "empty_map",
      name: "Empty map",
      layers: [{
        id: "empty_points",
        name: "Points",
        geometryType: "point",
        features: [],
      }],
    },
  };
  const api = {
    createMap: async () => ({}),
    createLayer: async () => ({}),
    addFeatures: async () => ({}),
    updateMap: async () => ({}),
    exportMap: async (mapId) => { calls.push(["export_map", mapId]); return portableEmptyMap; },
    listLayerIds: async (mapId) => { calls.push(["list_layer_ids", mapId]); return []; },
    createMapOpenLink: async (mapId) => { calls.push(["create_open_link", mapId]); return {}; },
  };
  const geocoder = { geocode: async () => { throw new Error("unexpected geocode call"); } };
  const server = createServer(api, geocoder);
  const client = new Client({ name: "empty-map-inspection-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const inspected = await client.callTool({ name: "inspect_map", arguments: { map_id: "empty_map" } });
    assert.deepEqual(inspected.structuredContent.data, portableEmptyMap);
    assert.deepEqual(inspected.structuredContent.context, {
      map_id: "empty_map",
      view: "portable_project",
      stored_layer_ids: [],
      empty_map_placeholder_id: "empty_points",
    });
    assert.deepEqual(calls, [
      ["export_map", "empty_map"],
      ["list_layer_ids", "empty_map"],
    ]);
    assert.equal(inspected._meta?.["lalgeo/openUrl"], undefined);
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
