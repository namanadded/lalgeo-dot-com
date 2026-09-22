import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LalGeoApi, LalGeoApiError, type JsonObject } from "./lalgeo-api.js";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const jsonObject = z.record(z.unknown());
const center = z.object({ latitude: z.number(), longitude: z.number() });
const mapFields = {
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  center: center.nullable().optional(),
  zoom: z.number().min(0).max(24).nullable().optional(),
  map_type: z.enum(["standard", "satellite", "hybrid"]).optional(),
  show_basemap_pois: z.boolean().optional(),
  metadata: jsonObject.optional(),
};

function result(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function failure(error: unknown) {
  if (error instanceof LalGeoApiError) {
    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: JSON.stringify({ status: error.status, request_id: error.requestId, response: error.payload }, null, 2),
      }],
    };
  }
  throw error;
}

async function call(operation: () => Promise<unknown>) {
  try {
    return result(await operation());
  } catch (error) {
    return failure(error);
  }
}

function without<T extends JsonObject>(input: T, keys: string[]) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
}

export function createServer(api: LalGeoApi) {
  const server = new McpServer({ name: "lalgeo", version: "0.1.0" });

  server.registerTool("create_map", {
    title: "Create LalGeo map",
    description: "Create an owner-scoped map through the LalGeo Developer API.",
    inputSchema: {
      id: id.optional().describe("Stable client-supplied ID for safe retry reconciliation."),
      ...mapFields,
      name: mapFields.name.unwrap(),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => call(() => api.createMap(input)));

  server.registerTool("create_layer", {
    title: "Create LalGeo layer",
    description: "Create a typed layer in an existing LalGeo map.",
    inputSchema: {
      map_id: id,
      id: id.optional().describe("Stable client-supplied ID for safe retry reconciliation."),
      name: z.string().min(1).max(200),
      geometry_type: z.enum(["Point", "LineString", "Polygon"]),
      style: jsonObject.optional(),
      position: z.number().int().safe().optional(),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => call(() => api.createLayer(input.map_id, without(input, ["map_id"]))));

  server.registerTool("add_features", {
    title: "Add GeoJSON features",
    description: "Add GeoJSON Features to an existing typed layer. Geometry rules are enforced by the LalGeo Developer API.",
    inputSchema: {
      map_id: id,
      layer_id: id,
      features: z.array(z.object({
        type: z.literal("Feature"),
        id: id.optional().describe("Stable client-supplied ID for safe retry reconciliation."),
        geometry: jsonObject,
        properties: jsonObject.nullable().optional(),
      })).min(1).max(1000),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => call(() => api.addFeatures(input.map_id, input.layer_id, input.features)));

  server.registerTool("update_map", {
    title: "Update LalGeo map",
    description: "Update fields on an existing LalGeo map.",
    inputSchema: { map_id: id, ...mapFields },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, (input) => call(() => api.updateMap(input.map_id, without(input, ["map_id"]))));

  server.registerTool("export_map", {
    title: "Export LalGeo map",
    description: "Export a map as a portable LalGeo .lal project payload.",
    inputSchema: { map_id: id },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (input) => call(() => api.exportMap(input.map_id)));

  return server;
}
