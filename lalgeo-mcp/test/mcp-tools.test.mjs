import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";

test("MCP discovery exposes only the five LalGeo authoring tools", async () => {
  const calls = [];
  const api = {
    createMap: async (input) => { calls.push(["create_map", input]); return { map: { id: "map_1" } }; },
    createLayer: async () => ({}),
    addFeatures: async () => ({}),
    updateMap: async () => ({}),
    exportMap: async () => ({}),
  };
  const server = createServer(api);
  const client = new Client({ name: "lalgeo-mcp-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const discovered = await client.listTools();
    assert.deepEqual(discovered.tools.map((tool) => tool.name).sort(), [
      "add_features", "create_layer", "create_map", "export_map", "update_map",
    ]);

    const response = await client.callTool({ name: "create_map", arguments: { name: "Agent map" } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(calls, [["create_map", { name: "Agent map" }]]);
  } finally {
    await client.close();
    await server.close();
  }
});
