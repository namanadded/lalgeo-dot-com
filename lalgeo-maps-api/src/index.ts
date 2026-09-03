import openapi from "../openapi.json";

interface Env {
  DB: D1Database;
  LALGEO_MAPS_API_KEYS?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

type JsonObject = Record<string, unknown>;
type GeometryType = "Point" | "LineString" | "Polygon";
type Auth = { ownerId: string };

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_FEATURE_BATCH = 1_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function response(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`; }
function parseJson(value: unknown, fallback: unknown = {}) {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeId(value: unknown, prefix: string) {
  if (value === undefined || value === null || value === "") return id(prefix);
  const candidate = String(value);
  if (!ID_PATTERN.test(candidate)) throw new ApiError(400, "INVALID_ID", "IDs may contain letters, numbers, underscores, and hyphens (maximum 128 characters).");
  return candidate;
}

function requiredName(value: unknown, label = "name") {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new ApiError(400, "VALIDATION_ERROR", `${label} is required.`);
  if (name.length > 200) throw new ApiError(400, "VALIDATION_ERROR", `${label} must be 200 characters or fewer.`);
  return name;
}

function numberInRange(value: unknown, min: number, max: number, label: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label} must be a number from ${min} to ${max}.`);
  }
  return value;
}

async function body(req: Request): Promise<JsonObject> {
  const length = Number(req.headers.get("content-length") || "0");
  if (length > MAX_BODY_BYTES) throw new ApiError(413, "BODY_TOO_LARGE", "Request bodies are limited to 2 MB.");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new ApiError(413, "BODY_TOO_LARGE", "Request bodies are limited to 2 MB.");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be a JSON object.");
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticate(req: Request, env: Env): Promise<Auth> {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "Send an API key using Authorization: Bearer <key>.");
  let keys: Record<string, string>;
  try { keys = JSON.parse(env.LALGEO_MAPS_API_KEYS || "{}"); }
  catch { throw new ApiError(503, "AUTH_NOT_CONFIGURED", "API authentication is not configured."); }
  const ownerId = keys[await sha256(match[1])];
  if (!ownerId) throw new ApiError(401, "UNAUTHORIZED", "The API key is invalid.");
  return { ownerId };
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const allowed = (env.CORS_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function geometryType(value: unknown): GeometryType {
  if (value === "Point" || value === "LineString" || value === "Polygon") return value;
  throw new ApiError(400, "VALIDATION_ERROR", "geometry_type must be Point, LineString, or Polygon.");
}

function coordinate(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "number" || typeof value[1] !== "number" ||
      !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90) {
    throw new ApiError(400, "INVALID_GEOMETRY", `${label} must be a valid [longitude, latitude] coordinate.`);
  }
}

function validateGeometry(value: unknown, expected: GeometryType): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "INVALID_GEOMETRY", "A GeoJSON geometry object is required.");
  const geometry = value as JsonObject;
  if (geometry.type !== expected) throw new ApiError(400, "GEOMETRY_TYPE_MISMATCH", `This layer accepts ${expected} geometry.`);
  const coords = geometry.coordinates;
  if (expected === "Point") coordinate(coords, "Point");
  if (expected === "LineString") {
    if (!Array.isArray(coords) || coords.length < 2) throw new ApiError(400, "INVALID_GEOMETRY", "LineString requires at least two coordinates.");
    coords.forEach((item, index) => coordinate(item, `LineString coordinate ${index + 1}`));
  }
  if (expected === "Polygon") {
    if (!Array.isArray(coords) || !coords.length) throw new ApiError(400, "INVALID_GEOMETRY", "Polygon requires at least one ring.");
    coords.forEach((ring, ringIndex) => {
      if (!Array.isArray(ring) || ring.length < 4) throw new ApiError(400, "INVALID_GEOMETRY", `Polygon ring ${ringIndex + 1} requires at least four coordinates.`);
      ring.forEach((item, index) => coordinate(item, `Polygon ring ${ringIndex + 1}, coordinate ${index + 1}`));
      if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) throw new ApiError(400, "INVALID_GEOMETRY", `Polygon ring ${ringIndex + 1} must be closed.`);
    });
  }
  return geometry;
}

function featureInput(value: unknown, expected: GeometryType) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "VALIDATION_ERROR", "Each feature must be a GeoJSON Feature.");
  const input = value as JsonObject;
  if (input.type !== "Feature") throw new ApiError(400, "VALIDATION_ERROR", "Each item must have type Feature.");
  const properties = input.properties === null || input.properties === undefined ? {} : input.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new ApiError(400, "VALIDATION_ERROR", "Feature properties must be an object.");
  return { id: safeId(input.id, "feature"), geometry: validateGeometry(input.geometry, expected), properties: properties as JsonObject };
}

function mapView(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name, description: row.description,
    center: row.center_lat === null ? null : { latitude: row.center_lat, longitude: row.center_lng },
    zoom: row.zoom, map_type: row.map_type, show_basemap_pois: Boolean(row.show_basemap_pois),
    metadata: parseJson(row.metadata_json), created_at: row.created_at, updated_at: row.updated_at,
  };
}

function layerView(row: Record<string, unknown>) {
  return { id: row.id, map_id: row.map_id, name: row.name, geometry_type: row.geometry_type, style: parseJson(row.style_json), position: row.position, created_at: row.created_at, updated_at: row.updated_at };
}

function featureView(row: Record<string, unknown>) {
  return { type: "Feature", id: row.id, geometry: parseJson(row.geometry_json, null), properties: parseJson(row.properties_json), created_at: row.created_at, updated_at: row.updated_at };
}

async function requireMap(db: D1Database, ownerId: string, mapId: string) {
  const row = await db.prepare("SELECT * FROM maps WHERE id=?1 AND owner_id=?2").bind(mapId, ownerId).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "MAP_NOT_FOUND", "Map not found.");
  return row;
}

async function requireLayer(db: D1Database, ownerId: string, mapId: string, layerId: string) {
  const row = await db.prepare("SELECT * FROM layers WHERE id=?1 AND map_id=?2 AND owner_id=?3").bind(layerId, mapId, ownerId).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "LAYER_NOT_FOUND", "Layer not found.");
  return row;
}

async function requireFeature(db: D1Database, ownerId: string, mapId: string, layerId: string, featureId: string) {
  const row = await db.prepare("SELECT * FROM features WHERE id=?1 AND layer_id=?2 AND map_id=?3 AND owner_id=?4").bind(featureId, layerId, mapId, ownerId).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "FEATURE_NOT_FOUND", "Feature not found.");
  return row;
}

function paging(url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0) || 0, 0);
  return { limit, offset };
}

function lalGeometry(geometry: JsonObject) {
  const coords = geometry.coordinates as unknown[];
  const point = (pair: unknown) => ({ lat: (pair as number[])[1], lng: (pair as number[])[0] });
  if (geometry.type === "Point") return { type: "Point", ...point(coords) };
  if (geometry.type === "LineString") return { type: "LineString", coordinates: coords.map(point) };
  return { type: "Polygon", rings: (coords as unknown[][]).map((ring) => ring.slice(0, -1).map(point)) };
}

async function exportProject(db: D1Database, ownerId: string, mapId: string) {
  const map = await requireMap(db, ownerId, mapId);
  const layers = (await db.prepare("SELECT * FROM layers WHERE map_id=?1 AND owner_id=?2 ORDER BY position,id").bind(mapId, ownerId).all<Record<string, unknown>>()).results || [];
  const outputLayers: JsonObject[] = [];
  for (const layer of layers) {
    const rows = (await db.prepare("SELECT * FROM features WHERE layer_id=?1 AND map_id=?2 AND owner_id=?3 ORDER BY created_at,id").bind(layer.id, mapId, ownerId).all<Record<string, unknown>>()).results || [];
    const properties = rows.map((row) => parseJson(row.properties_json) as JsonObject);
    const fields = [...new Set(properties.flatMap((item) => Object.keys(item)))];
    outputLayers.push({
      id: layer.id, name: layer.name,
      geometryType: layer.geometry_type === "LineString" ? "line" : layer.geometry_type === "Polygon" ? "polygon" : "point",
      selectable: true, styleDefaults: parseJson(layer.style_json),
      schema: fields.map((name) => ({ name, type: "text", options: [], locked: false })),
      features: rows.map((row, index) => ({ id: row.id, geometry: lalGeometry(parseJson(row.geometry_json) as JsonObject), attributes: properties[index], version: 1 })),
    });
  }
  return {
    project: {
      id: map.id, name: map.name, description: map.description, type: "API project", storageSource: "LalGeo Maps API",
      source: { type: "lalgeo-maps-api", mapId: map.id },
      mapOptions: { showBasemapPOIs: Boolean(map.show_basemap_pois), mapType: map.map_type, center: map.center_lat === null ? undefined : { lat: map.center_lat, lng: map.center_lng }, zoom: map.zoom ?? undefined },
      metadata: { ...(parseJson(map.metadata_json) as JsonObject), createdAt: map.created_at, updatedAt: map.updated_at },
      layers: outputLayers, activeLayerId: outputLayers[0]?.id || null,
    },
    activeLayerId: outputLayers[0]?.id || null, survey: null,
  };
}

async function route(req: Request, env: Env, auth: Auth, url: URL) {
  const path = url.pathname;
  const mapMatch = path.match(/^\/v1\/maps\/([^/]+)$/);
  const exportMatch = path.match(/^\/v1\/maps\/([^/]+)\/export$/);
  const layersMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers$/);
  const layerMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers\/([^/]+)$/);
  const featuresMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers\/([^/]+)\/features$/);
  const featureMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers\/([^/]+)\/features\/([^/]+)$/);

  if (path === "/v1/maps" && req.method === "POST") {
    const input = await body(req); const created = now(); const mapId = safeId(input.id, "map");
    const center = input.center as JsonObject | undefined;
    const lat = center ? numberInRange(center.latitude, -90, 90, "center.latitude") : null;
    const lng = center ? numberInRange(center.longitude, -180, 180, "center.longitude") : null;
    if ((lat === null) !== (lng === null)) throw new ApiError(400, "VALIDATION_ERROR", "center requires both latitude and longitude.");
    await env.DB.prepare("INSERT INTO maps (id,owner_id,name,description,center_lat,center_lng,zoom,map_type,show_basemap_pois,metadata_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)")
      .bind(mapId, auth.ownerId, requiredName(input.name), String(input.description || ""), lat, lng, numberInRange(input.zoom, 0, 24, "zoom"), input.map_type === "satellite" || input.map_type === "hybrid" ? input.map_type : "standard", input.show_basemap_pois === false ? 0 : 1, JSON.stringify(input.metadata || {}), created).run();
    return response({ map: mapView(await requireMap(env.DB, auth.ownerId, mapId)) }, 201);
  }
  if (path === "/v1/maps" && req.method === "GET") {
    const { limit, offset } = paging(url);
    const rows = (await env.DB.prepare("SELECT * FROM maps WHERE owner_id=?1 ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3").bind(auth.ownerId, limit, offset).all<Record<string, unknown>>()).results || [];
    return response({ maps: rows.map(mapView), pagination: { limit, offset, count: rows.length } });
  }
  if (exportMatch && req.method === "GET") return response(await exportProject(env.DB, auth.ownerId, decodeURIComponent(exportMatch[1])));
  if (mapMatch) {
    const mapId = decodeURIComponent(mapMatch[1]);
    if (req.method === "GET") return response({ map: mapView(await requireMap(env.DB, auth.ownerId, mapId)) });
    if (req.method === "DELETE") { await requireMap(env.DB, auth.ownerId, mapId); await env.DB.prepare("DELETE FROM maps WHERE id=?1 AND owner_id=?2").bind(mapId, auth.ownerId).run(); return new Response(null, { status: 204 }); }
    if (req.method === "PATCH") {
      await requireMap(env.DB, auth.ownerId, mapId); const input = await body(req); const updates: string[] = []; const values: unknown[] = [];
      const set = (column: string, value: unknown) => { updates.push(`${column}=?${values.length + 1}`); values.push(value); };
      if ("name" in input) set("name", requiredName(input.name));
      if ("description" in input) set("description", String(input.description || ""));
      if ("zoom" in input) set("zoom", numberInRange(input.zoom, 0, 24, "zoom"));
      if ("metadata" in input) set("metadata_json", JSON.stringify(input.metadata || {}));
      if ("show_basemap_pois" in input) set("show_basemap_pois", input.show_basemap_pois === false ? 0 : 1);
      if ("map_type" in input) { if (!["standard", "satellite", "hybrid"].includes(String(input.map_type))) throw new ApiError(400, "VALIDATION_ERROR", "map_type must be standard, satellite, or hybrid."); set("map_type", input.map_type); }
      if ("center" in input) { const center = input.center as JsonObject; set("center_lat", numberInRange(center?.latitude, -90, 90, "center.latitude")); set("center_lng", numberInRange(center?.longitude, -180, 180, "center.longitude")); }
      if (updates.length) { set("updated_at", now()); values.push(mapId, auth.ownerId); await env.DB.prepare(`UPDATE maps SET ${updates.join(",")} WHERE id=?${values.length - 1} AND owner_id=?${values.length}`).bind(...values).run(); }
      return response({ map: mapView(await requireMap(env.DB, auth.ownerId, mapId)) });
    }
  }
  if (layersMatch) {
    const mapId = decodeURIComponent(layersMatch[1]); await requireMap(env.DB, auth.ownerId, mapId);
    if (req.method === "GET") { const rows = (await env.DB.prepare("SELECT * FROM layers WHERE map_id=?1 AND owner_id=?2 ORDER BY position,id").bind(mapId, auth.ownerId).all<Record<string, unknown>>()).results || []; return response({ layers: rows.map(layerView) }); }
    if (req.method === "POST") { const input = await body(req); const layerId = safeId(input.id, "layer"); const created = now(); const type = geometryType(input.geometry_type); const position = Number.isInteger(input.position) ? Number(input.position) : 0;
      await env.DB.prepare("INSERT INTO layers (id,map_id,owner_id,name,geometry_type,style_json,position,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)").bind(layerId, mapId, auth.ownerId, requiredName(input.name), type, JSON.stringify(input.style || {}), position, created).run();
      await env.DB.prepare("UPDATE maps SET updated_at=?1 WHERE id=?2 AND owner_id=?3").bind(created, mapId, auth.ownerId).run(); return response({ layer: layerView(await requireLayer(env.DB, auth.ownerId, mapId, layerId)) }, 201); }
  }
  if (layerMatch) {
    const mapId = decodeURIComponent(layerMatch[1]); const layerId = decodeURIComponent(layerMatch[2]);
    if (req.method === "GET") return response({ layer: layerView(await requireLayer(env.DB, auth.ownerId, mapId, layerId)) });
    if (req.method === "DELETE") { await requireLayer(env.DB, auth.ownerId, mapId, layerId); await env.DB.prepare("DELETE FROM layers WHERE id=?1 AND map_id=?2 AND owner_id=?3").bind(layerId, mapId, auth.ownerId).run(); return new Response(null, { status: 204 }); }
    if (req.method === "PATCH") { const existing = await requireLayer(env.DB, auth.ownerId, mapId, layerId); const input = await body(req); const name = "name" in input ? requiredName(input.name) : existing.name; const style = "style" in input ? input.style : parseJson(existing.style_json); const position = "position" in input && Number.isInteger(input.position) ? input.position : existing.position; const updated = now();
      await env.DB.prepare("UPDATE layers SET name=?1,style_json=?2,position=?3,updated_at=?4 WHERE id=?5 AND map_id=?6 AND owner_id=?7").bind(name, JSON.stringify(style || {}), position, updated, layerId, mapId, auth.ownerId).run(); return response({ layer: layerView(await requireLayer(env.DB, auth.ownerId, mapId, layerId)) }); }
  }
  if (featuresMatch) {
    const mapId = decodeURIComponent(featuresMatch[1]); const layerId = decodeURIComponent(featuresMatch[2]); const layer = await requireLayer(env.DB, auth.ownerId, mapId, layerId); const expected = geometryType(layer.geometry_type);
    if (req.method === "GET") { const { limit, offset } = paging(url); const rows = (await env.DB.prepare("SELECT * FROM features WHERE layer_id=?1 AND map_id=?2 AND owner_id=?3 ORDER BY created_at,id LIMIT ?4 OFFSET ?5").bind(layerId, mapId, auth.ownerId, limit, offset).all<Record<string, unknown>>()).results || []; return response({ type: "FeatureCollection", features: rows.map(featureView), pagination: { limit, offset, count: rows.length } }); }
    if (req.method === "POST") { const input = await body(req); const items = input.type === "FeatureCollection" ? input.features : [input]; if (!Array.isArray(items) || !items.length) throw new ApiError(400, "VALIDATION_ERROR", "Provide a GeoJSON Feature or a non-empty FeatureCollection."); if (items.length > MAX_FEATURE_BATCH) throw new ApiError(413, "BATCH_TOO_LARGE", "A batch may contain at most 1,000 features."); const parsed = items.map((item) => featureInput(item, expected)); const created = now();
      await env.DB.batch(parsed.map((item) => env.DB.prepare("INSERT INTO features (id,layer_id,map_id,owner_id,geometry_json,properties_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)").bind(item.id, layerId, mapId, auth.ownerId, JSON.stringify(item.geometry), JSON.stringify(item.properties), created)));
      await env.DB.prepare("UPDATE maps SET updated_at=?1 WHERE id=?2 AND owner_id=?3").bind(created, mapId, auth.ownerId).run(); return response({ type: "FeatureCollection", features: parsed.map((item) => ({ type: "Feature", ...item })) }, 201); }
  }
  if (featureMatch) {
    const mapId = decodeURIComponent(featureMatch[1]); const layerId = decodeURIComponent(featureMatch[2]); const featureId = decodeURIComponent(featureMatch[3]); const existing = await requireFeature(env.DB, auth.ownerId, mapId, layerId, featureId);
    if (req.method === "GET") return response(featureView(existing));
    if (req.method === "DELETE") { await env.DB.prepare("DELETE FROM features WHERE id=?1 AND layer_id=?2 AND map_id=?3 AND owner_id=?4").bind(featureId, layerId, mapId, auth.ownerId).run(); return new Response(null, { status: 204 }); }
    if (req.method === "PATCH") { const input = await body(req); const layer = await requireLayer(env.DB, auth.ownerId, mapId, layerId); const geometry = "geometry" in input ? validateGeometry(input.geometry, geometryType(layer.geometry_type)) : parseJson(existing.geometry_json); const properties = "properties" in input ? input.properties : parseJson(existing.properties_json); if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new ApiError(400, "VALIDATION_ERROR", "properties must be an object.");
      await env.DB.prepare("UPDATE features SET geometry_json=?1,properties_json=?2,updated_at=?3 WHERE id=?4 AND layer_id=?5 AND map_id=?6 AND owner_id=?7").bind(JSON.stringify(geometry), JSON.stringify(properties), now(), featureId, layerId, mapId, auth.ownerId).run(); return response(featureView(await requireFeature(env.DB, auth.ownerId, mapId, layerId, featureId))); }
  }
  throw new ApiError(404, "NOT_FOUND", "Endpoint not found.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const requestId = req.headers.get("cf-ray") || crypto.randomUUID();
    const headers = { ...cors(req, env), "X-Request-Id": requestId };
    try {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (url.pathname === "/v1/health" && req.method === "GET") return response({ ok: true, service: "lalgeo-maps-api", version: "v1" }, 200, headers);
      if (url.pathname === "/v1/openapi.json" && req.method === "GET") return response(openapi, 200, { ...headers, "Cache-Control": "public, max-age=300" });
      const result = await route(req, env, await authenticate(req, env), url);
      const outgoing = new Headers(result.headers); Object.entries(headers).forEach(([key, value]) => outgoing.set(key, value));
      return new Response(result.body, { status: result.status, headers: outgoing });
    } catch (error) {
      if (error instanceof ApiError) {
        const errorHeaders = error.status === 401
          ? { ...headers, "WWW-Authenticate": 'Bearer realm="lalgeo-maps-api"' }
          : headers;
        return response({ error: { code: error.code, message: error.message, details: error.details }, request_id: requestId }, error.status, errorHeaders);
      }
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) return response({ error: { code: "ID_CONFLICT", message: "That ID already exists. Reuse the existing resource or choose another ID." }, request_id: requestId }, 409, headers);
      console.error(error);
      return response({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." }, request_id: requestId }, 500, headers);
    }
  },
};
