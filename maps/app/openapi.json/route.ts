const sourceUrl = { type: "string", format: "uri", description: "Public HTTPS GeoJSON endpoint or Open Calgary dataset link; not a portal homepage." };
const response = (description: string, schema: object = { type: "object", additionalProperties: true }) => ({ description, content: { "application/json": { schema } } });
const layer = {
  type: "object",
  properties: {
    name: { type: "string", maxLength: 160 }, sourceUrl,
    geojson: { type: "object", additionalProperties: true, description: "WGS84 GeoJSON FeatureCollection or Feature with scalar properties." },
    labelField: { type: "string" }, color: { type: "string", enum: ["red", "blue", "green", "orange", "purple"] },
    opacity: { type: "number", minimum: 0, maximum: 1 }, visible: { type: "boolean" },
    popoutsVisible: { type: "boolean", description: "For polygon and line layers, defaults to false in shared views to avoid clustered popout pins." },
    labelsVisible: { type: "boolean", description: "For polygon and line layers, defaults to true with zoom-dependent label thinning." }
  },
  anyOf: [{ required: ["sourceUrl"] }, { required: ["geojson"] }]
};
export async function GET() {
  const schema = {
    openapi: "3.1.0",
    info: { title: "LalGeo Maps", version: "1.0.0", description: "Create immutable shared map snapshots. No authentication for creation; 20 attempts/IP/hour. Share only data intended for anyone with the link." },
    servers: [{ url: "https://maps.lalgeo.com" }],
    paths: {
      "/api/v1/datasets": {
        get: {
          operationId: "searchCalgaryDatasets", summary: "Find Open Calgary datasets by topic",
          parameters: [{ in: "query", name: "q", required: true, schema: { type: "string", maxLength: 160 } }],
          responses: { "200": response("Dataset results with name, sourceUrl, dataId, type and updatedAt"), "429": response("Rate limit") }
        }
      },
      "/api/v1/maps": {
        post: {
          operationId: "createSharedMap", summary: "Create a map snapshot and return a shareable URL",
          description: "Return shareUrl to the user; keep deleteToken private. 3 MB, 12 layers, 10,000 features/layer maximum. Search first when only a portal homepage is supplied.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: true,
            content: { "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", maxLength: 160 }, description: { type: "string", maxLength: 2000 }, sourceUrl,
                  labelField: { type: "string" },
                  popoutsVisible: { type: "boolean" },
                  labelsVisible: { type: "boolean" },
                  layers: { type: "array", minItems: 1, maxItems: 12, items: layer },
                  basemap: { type: "string", enum: ["standard", "satellite", "hybrid"] }
                },
                anyOf: [{ required: ["sourceUrl"] }, { required: ["layers"] }]
              },
              example: { title: "Calgary communities", sourceUrl: "https://data.calgary.ca/d/ab7m-fwn6", labelField: "name", labelsVisible: true, popoutsVisible: false }
            } }
          },
          responses: {
            "201": response("Created", { type: "object", properties: {
              id: { type: "string" }, shareUrl: { type: "string", format: "uri" }, apiUrl: { type: "string", format: "uri" },
              deleteToken: { type: "string", description: "Private revocation capability. Never include in the share URL." },
              featureCount: { type: "integer" }, title: { type: "string" }, createdAt: { type: "string", format: "date-time" }
            } }),
            "400": response("Invalid input"), "413": response("Too large"), "422": response("Unusable dataset"), "429": response("Rate limit"), "503": response("Service unavailable")
          }
        }
      },
      "/api/v1/maps/{id}": {
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", pattern: "^[a-f0-9]{32}$" } }],
        get: { operationId: "getSharedMap", summary: "Read a saved map snapshot", responses: { "200": response("Saved map and GeoJSON layers"), "404": response("Missing or revoked") } },
        delete: {
          operationId: "revokeSharedMap", summary: "Revoke a shared link", "x-openai-isConsequential": true,
          security: [{ deletionToken: [] }],
          responses: { "200": response("Revoked"), "401": response("Token required"), "403": response("Invalid token"), "404": response("Not found") }
        }
      }
    },
    components: { securitySchemes: { deletionToken: { type: "http", scheme: "bearer", description: "deleteToken returned by map creation." } } }
  };
  return Response.json(schema, { headers: { "Access-Control-Allow-Origin": "*" } });
}
