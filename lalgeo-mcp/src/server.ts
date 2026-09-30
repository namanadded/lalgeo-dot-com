import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LalGeoApi, LalGeoApiError, type JsonObject } from "./lalgeo-api.js";
import { GeocodeError, type Geocoder } from "./geocoder.js";
import { MAP_WIDGET_HTML, MAP_WIDGET_URI } from "./widget.js";

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

const widgetOutput = {
  operation: z.enum(["create_map", "create_layer", "add_features", "update_map", "inspect_map", "export_map"]),
  data: z.unknown(),
  context: z.record(z.unknown()),
};

function uiMeta(invoking: string, invoked: string) {
  return {
    ui: { resourceUri: MAP_WIDGET_URI },
    "openai/outputTemplate": MAP_WIDGET_URI,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

function result(operation: string, payload: unknown, context: JsonObject = {}) {
  return {
    structuredContent: { operation, data: payload, context },
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
  if (error instanceof GeocodeError) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: { code: error.code, message: error.message, details: error.details } }, null, 2) }],
    };
  }
  throw error;
}

async function call(name: string, context: JsonObject, operation: () => Promise<unknown>) {
  try {
    return result(name, await operation(), context);
  } catch (error) {
    return failure(error);
  }
}

function without<T extends JsonObject>(input: T, keys: string[]) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
}

export function createServer(api: LalGeoApi, geocoder: Geocoder) {
  const server = new McpServer({ name: "lalgeo", version: "0.4.0" });

  server.registerResource("lalgeo-map", MAP_WIDGET_URI, {}, async () => ({
    contents: [{
      uri: MAP_WIDGET_URI,
      mimeType: "text/html;profile=mcp-app",
      text: MAP_WIDGET_HTML,
      _meta: {
        ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
        "openai/widgetDescription": "Interactive preview of the LalGeo map and GeoJSON returned by the tool.",
        "openai/widgetPrefersBorder": true,
        "openai/widgetCSP": { connect_domains: [], resource_domains: [], redirect_domains: ["https://maps.lalgeo.com"] },
      },
    }],
  }));

  server.registerTool("create_map", {
    title: "Create LalGeo map",
    description: "Create an owner-scoped map. Supply a stable ID; after an uncertain result or ID_CONFLICT, inspect_map before retrying.",
    inputSchema: {
      id: id.optional().describe("Supply a stable client ID so inspect_map can reconcile an uncertain result before retrying."),
      ...mapFields,
      name: mapFields.name.unwrap(),
    },
    outputSchema: widgetOutput,
    _meta: uiMeta("Creating map…", "Map created."),
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => call("create_map", { requested_map: input }, () => api.createMap(input)));

  server.registerTool("create_layer", {
    title: "Create LalGeo layer",
    description: "Create a typed layer in an existing map. Supply a stable ID; after an uncertain result or ID_CONFLICT, inspect_map before retrying.",
    inputSchema: {
      map_id: id,
      id: id.optional().describe("Supply a stable client ID so inspect_map can reconcile an uncertain result before retrying."),
      name: z.string().min(1).max(200),
      geometry_type: z.enum(["Point", "LineString", "Polygon"]),
      style: jsonObject.optional(),
      position: z.number().int().safe().optional(),
    },
    outputSchema: widgetOutput,
    _meta: uiMeta("Creating layer…", "Layer created."),
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => call("create_layer", { map_id: input.map_id }, () => api.createLayer(input.map_id, without(input, ["map_id"]))));

  server.registerTool("add_features", {
    title: "Add GeoJSON features",
    description: "Add GeoJSON Features to an existing typed layer. Give every feature a stable ID; after an uncertain result or ID_CONFLICT, inspect_map before retrying.",
    inputSchema: {
      map_id: id,
      layer_id: id,
      features: z.array(z.object({
        type: z.literal("Feature"),
        id: id.optional().describe("Supply a stable client ID so inspect_map can reconcile an uncertain result before retrying."),
        geometry: jsonObject,
        properties: jsonObject.nullable().optional(),
      })).min(1).max(1000),
    },
    outputSchema: widgetOutput,
    _meta: uiMeta("Adding features…", "Features added."),
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => call("add_features", { map_id: input.map_id, layer_id: input.layer_id, features: input.features }, () => api.addFeatures(input.map_id, input.layer_id, input.features)));

  server.registerTool("update_map", {
    title: "Update LalGeo map",
    description: "Update fields on an existing LalGeo map.",
    inputSchema: { map_id: id, ...mapFields },
    outputSchema: widgetOutput,
    _meta: uiMeta("Updating map…", "Map updated."),
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, (input) => call("update_map", { map_id: input.map_id }, () => api.updateMap(input.map_id, without(input, ["map_id"]))));

  server.registerTool("inspect_map", {
    title: "Inspect LalGeo map",
    description: "Read the complete current map as a portable LalGeo project without creating a Maps link. Use this to reconcile stable IDs after a timeout or ID_CONFLICT before retrying a write. The stored_layer_ids context distinguishes stored layers from the virtual empty_points placeholder used for an empty portable project.",
    inputSchema: { map_id: id },
    outputSchema: widgetOutput,
    _meta: uiMeta("Inspecting map…", "Map inspected."),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input) => {
    try {
      const [payload, storedLayerIds] = await Promise.all([
        api.exportMap(input.map_id),
        api.listLayerIds(input.map_id),
      ]);
      return result("inspect_map", payload, {
        map_id: input.map_id,
        view: "portable_project",
        stored_layer_ids: storedLayerIds,
        empty_map_placeholder_id: "empty_points",
      });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("export_map", {
    title: "Export and open LalGeo map",
    description: "Export a map as a portable LalGeo .lal project payload and create a short-lived, single-use Maps link.",
    inputSchema: { map_id: id },
    outputSchema: widgetOutput,
    _meta: uiMeta("Preparing map…", "Map ready."),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (input) => {
    try {
      const [payload, openLink] = await Promise.all([
        api.exportMap(input.map_id),
        api.createMapOpenLink(input.map_id) as Promise<{ open_url?: unknown; expires_at?: unknown }>,
      ]);
      return {
        ...result("export_map", payload, { map_id: input.map_id }),
        _meta: {
          "lalgeo/openUrl": typeof openLink.open_url === "string" ? openLink.open_url : undefined,
          "lalgeo/openUrlExpiresAt": typeof openLink.expires_at === "string" ? openLink.expires_at : undefined,
        },
      };
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("geocode", {
    title: "Geocode a place",
    description: "Find a place name or address with LalGeo's existing Apple Maps search and return the best match with coordinates.",
    inputSchema: { query: z.string().trim().min(1).max(300).describe("Place name or street address to find.") },
    outputSchema: {
      query: z.string(),
      coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
      place: z.record(z.unknown()),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ query }) => {
    try {
      const payload = await geocoder.geocode(query);
      return {
        structuredContent: payload,
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    } catch (error) {
      return failure(error);
    }
  });

  return server;
}
