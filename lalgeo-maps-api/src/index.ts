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
const MAX_OPEN_REDEEM_BODY_BYTES = 512;
const MAX_FEATURE_BATCH = 1_000;
const DEFAULT_OPEN_LINK_TTL_SECONDS = 600;
const MIN_OPEN_LINK_TTL_SECONDS = 60;
const MAX_OPEN_LINK_TTL_SECONDS = 900;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPEN_LINK_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_HOSTNAME = "api.lalgeo.com";
const MAPS_OPEN_URL = "https://maps.lalgeo.com/maps";
const STRICT_TRANSPORT_SECURITY = "max-age=31536000";

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

function jsonObject(value: unknown, label: string): JsonObject {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label} must be a JSON object.`);
  }
  return value as JsonObject;
}

function safeId(value: unknown, prefix: string) {
  if (value === undefined) return id(prefix);
  const candidate = value;
  if (typeof candidate !== "string" || !ID_PATTERN.test(candidate)) throw new ApiError(400, "INVALID_ID", "IDs may contain letters, numbers, underscores, and hyphens (maximum 128 characters).");
  return candidate;
}

function requiredName(value: unknown, label = "name") {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new ApiError(400, "VALIDATION_ERROR", `${label} is required.`);
  if (name.length > 200) throw new ApiError(400, "VALIDATION_ERROR", `${label} must be 200 characters or fewer.`);
  return name;
}

function numberInRange(value: unknown, min: number, max: number, label: string, nullable = false) {
  if (value === undefined || (nullable && value === null)) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function mapCenter(value: unknown, nullable = false): { latitude: number | null; longitude: number | null } {
  if (nullable && value === null) return { latitude: null, longitude: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "center requires both latitude and longitude.");
  }
  const center = value as JsonObject;
  const latitude = numberInRange(center.latitude, -90, 90, "center.latitude");
  const longitude = numberInRange(center.longitude, -180, 180, "center.longitude");
  if (latitude === null || longitude === null) {
    throw new ApiError(400, "VALIDATION_ERROR", "center requires both latitude and longitude.");
  }
  return { latitude, longitude };
}

function description(value: unknown) {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new ApiError(400, "VALIDATION_ERROR", "description must be a string.");
  return value;
}

function mapType(value: unknown) {
  if (value === "standard" || value === "satellite" || value === "hybrid") return value;
  throw new ApiError(400, "VALIDATION_ERROR", "map_type must be standard, satellite, or hybrid.");
}

function showBasemapPois(value: unknown) {
  if (typeof value !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", "show_basemap_pois must be a boolean.");
  return value ? 1 : 0;
}

function layerPosition(value: unknown) {
  if (!Number.isSafeInteger(value)) throw new ApiError(400, "VALIDATION_ERROR", "position must be a safe integer.");
  return value as number;
}

async function body(req: Request, maxBytes = MAX_BODY_BYTES): Promise<JsonObject> {
  const limitLabel = maxBytes === MAX_BODY_BYTES ? "2 MB" : `${maxBytes} bytes`;
  const length = Number(req.headers.get("content-length") || "0");
  if (length > maxBytes) throw new ApiError(413, "BODY_TOO_LARGE", `Request bodies are limited to ${limitLabel}.`);
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiError(413, "BODY_TOO_LARGE", `Request bodies are limited to ${limitLabel}.`);
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

function openLinkToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openLinkUnavailable(): never {
  throw new ApiError(404, "OPEN_LINK_UNAVAILABLE", "This map link is unavailable.");
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
  if (!origin) return { Vary: "Origin" };
  const allowed = (env.CORS_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "X-Request-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function httpsRedirect(url: URL, headers: HeadersInit) {
  if (url.hostname !== CANONICAL_HOSTNAME || url.protocol !== "http:") return null;
  const destination = new URL(url);
  destination.protocol = "https:";
  destination.port = "";
  return new Response(null, {
    status: 308,
    headers: { ...headers, "Cache-Control": "no-store", Location: destination.toString() },
  });
}

function withoutBody(result: Response) {
  return new Response(null, { status: result.status, headers: result.headers });
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
  if (value.length > 3) {
    throw new ApiError(400, "INVALID_GEOMETRY", `${label} must use [longitude, latitude] or [longitude, latitude, altitude].`);
  }
  if (value.length === 3 && (typeof value[2] !== "number" || !Number.isFinite(value[2]))) {
    throw new ApiError(400, "INVALID_GEOMETRY", `${label} altitude must be a finite number in metres.`);
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
  const point = (pair: unknown) => {
    const [lng, lat, altitude] = pair as number[];
    return { lat, lng, ...(Number.isFinite(altitude) ? { altitude } : {}) };
  };
  if (geometry.type === "Point") return { type: "Point", ...point(coords) };
  if (geometry.type === "LineString") return { type: "LineString", coordinates: coords.map(point) };
  return { type: "Polygon", rings: (coords as unknown[][]).map((ring) => ring.slice(0, -1).map(point)) };
}

async function exportProject(db: D1Database, ownerId: string, mapId: string) {
  const map = await requireMap(db, ownerId, mapId);
  const layers = (await db.prepare("SELECT * FROM layers WHERE map_id=?1 AND owner_id=?2 ORDER BY position,id").bind(mapId, ownerId).all<Record<string, unknown>>()).results || [];
  const outputLayers: JsonObject[] = layers.length ? [] : [{
    id: "empty_points", name: "Points", geometryType: "point",
    selectable: true, styleDefaults: {}, schema: [], features: [],
  }];
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

async function createOpenLink(req: Request, env: Env, auth: Auth, mapId: string) {
  await requireMap(env.DB, auth.ownerId, mapId);
  const input = await body(req);
  const expiresIn = input.expires_in === undefined ? DEFAULT_OPEN_LINK_TTL_SECONDS : input.expires_in;
  if (!Number.isSafeInteger(expiresIn) || (expiresIn as number) < MIN_OPEN_LINK_TTL_SECONDS || (expiresIn as number) > MAX_OPEN_LINK_TTL_SECONDS) {
    throw new ApiError(400, "VALIDATION_ERROR", `expires_in must be a safe integer from ${MIN_OPEN_LINK_TTL_SECONDS} to ${MAX_OPEN_LINK_TTL_SECONDS}.`);
  }

  const createdAt = now();
  const expiresAt = new Date(Date.now() + (expiresIn as number) * 1_000).toISOString();
  const token = openLinkToken();
  const tokenHash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM map_open_links WHERE expires_at<=?1").bind(createdAt),
    env.DB.prepare("INSERT INTO map_open_links (token_hash,owner_id,map_id,expires_at,created_at) VALUES (?1,?2,?3,?4,?5)")
      .bind(tokenHash, auth.ownerId, mapId, expiresAt, createdAt),
  ]);
  return response({ open_url: `${MAPS_OPEN_URL}#open=${token}`, expires_at: expiresAt }, 201);
}

async function redeemOpenLink(req: Request, env: Env) {
  const input = await body(req, MAX_OPEN_REDEEM_BODY_BYTES);
  if (typeof input.token !== "string" || !OPEN_LINK_TOKEN_PATTERN.test(input.token)) openLinkUnavailable();

  const redeemedAt = now();
  const tokenHash = await sha256(input.token as string);
  const link = await env.DB.prepare("SELECT owner_id,map_id FROM map_open_links WHERE token_hash=?1 AND expires_at>?2")
    .bind(tokenHash, redeemedAt).first<{ owner_id: string; map_id: string }>();
  if (!link) openLinkUnavailable();

  let exported: Awaited<ReturnType<typeof exportProject>>;
  try {
    exported = await exportProject(env.DB, link.owner_id, link.map_id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "MAP_NOT_FOUND") openLinkUnavailable();
    throw error;
  }
  const deletion = await env.DB.prepare("DELETE FROM map_open_links WHERE token_hash=?1 AND owner_id=?2 AND map_id=?3 AND expires_at>?4")
    .bind(tokenHash, link.owner_id, link.map_id, redeemedAt).run();
  if (deletion.meta.changes !== 1) openLinkUnavailable();
  return response(exported);
}

async function route(req: Request, env: Env, auth: Auth, url: URL) {
  const path = url.pathname;
  const mapMatch = path.match(/^\/v1\/maps\/([^/]+)$/);
  const exportMatch = path.match(/^\/v1\/maps\/([^/]+)\/export$/);
  const openLinkMatch = path.match(/^\/v1\/maps\/([^/]+)\/open-links$/);
  const layersMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers$/);
  const layerMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers\/([^/]+)$/);
  const featuresMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers\/([^/]+)\/features$/);
  const featureMatch = path.match(/^\/v1\/maps\/([^/]+)\/layers\/([^/]+)\/features\/([^/]+)$/);

  if (path === "/v1/maps" && req.method === "POST") {
    const input = await body(req); const created = now(); const mapId = safeId(input.id, "map");
    const center = input.center === undefined ? { latitude: null, longitude: null } : mapCenter(input.center);
    await env.DB.prepare("INSERT INTO maps (id,owner_id,name,description,center_lat,center_lng,zoom,map_type,show_basemap_pois,metadata_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)")
      .bind(mapId, auth.ownerId, requiredName(input.name), description(input.description), center.latitude, center.longitude, numberInRange(input.zoom, 0, 24, "zoom"), input.map_type === undefined ? "standard" : mapType(input.map_type), input.show_basemap_pois === undefined ? 1 : showBasemapPois(input.show_basemap_pois), JSON.stringify(jsonObject(input.metadata, "metadata")), created).run();
    return response({ map: mapView(await requireMap(env.DB, auth.ownerId, mapId)) }, 201);
  }
  if (path === "/v1/maps" && req.method === "GET") {
    const { limit, offset } = paging(url);
    const rows = (await env.DB.prepare("SELECT * FROM maps WHERE owner_id=?1 ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3").bind(auth.ownerId, limit, offset).all<Record<string, unknown>>()).results || [];
    return response({ maps: rows.map(mapView), pagination: { limit, offset, count: rows.length } });
  }
  if (openLinkMatch && req.method === "POST") return createOpenLink(req, env, auth, decodeURIComponent(openLinkMatch[1]));
  if (exportMatch && req.method === "GET") return response(await exportProject(env.DB, auth.ownerId, decodeURIComponent(exportMatch[1])));
  if (mapMatch) {
    const mapId = decodeURIComponent(mapMatch[1]);
    if (req.method === "GET") return response({ map: mapView(await requireMap(env.DB, auth.ownerId, mapId)) });
    if (req.method === "DELETE") { await requireMap(env.DB, auth.ownerId, mapId); await env.DB.prepare("DELETE FROM maps WHERE id=?1 AND owner_id=?2").bind(mapId, auth.ownerId).run(); return new Response(null, { status: 204 }); }
    if (req.method === "PATCH") {
      await requireMap(env.DB, auth.ownerId, mapId); const input = await body(req); const updates: string[] = []; const values: unknown[] = [];
      const set = (column: string, value: unknown) => { updates.push(`${column}=?${values.length + 1}`); values.push(value); };
      if ("name" in input) set("name", requiredName(input.name));
      if ("description" in input) set("description", description(input.description));
      if ("zoom" in input) set("zoom", numberInRange(input.zoom, 0, 24, "zoom", true));
      if ("metadata" in input) set("metadata_json", JSON.stringify(jsonObject(input.metadata, "metadata")));
      if ("show_basemap_pois" in input) set("show_basemap_pois", showBasemapPois(input.show_basemap_pois));
      if ("map_type" in input) set("map_type", mapType(input.map_type));
      if ("center" in input) { const center = mapCenter(input.center, true); set("center_lat", center.latitude); set("center_lng", center.longitude); }
      if (updates.length) { set("updated_at", now()); values.push(mapId, auth.ownerId); await env.DB.prepare(`UPDATE maps SET ${updates.join(",")} WHERE id=?${values.length - 1} AND owner_id=?${values.length}`).bind(...values).run(); }
      return response({ map: mapView(await requireMap(env.DB, auth.ownerId, mapId)) });
    }
  }
  if (layersMatch) {
    const mapId = decodeURIComponent(layersMatch[1]); await requireMap(env.DB, auth.ownerId, mapId);
    if (req.method === "GET") { const rows = (await env.DB.prepare("SELECT * FROM layers WHERE map_id=?1 AND owner_id=?2 ORDER BY position,id").bind(mapId, auth.ownerId).all<Record<string, unknown>>()).results || []; return response({ layers: rows.map(layerView) }); }
    if (req.method === "POST") { const input = await body(req); const layerId = safeId(input.id, "layer"); const created = now(); const type = geometryType(input.geometry_type); const position = input.position === undefined ? 0 : layerPosition(input.position);
      await env.DB.prepare("INSERT INTO layers (id,map_id,owner_id,name,geometry_type,style_json,position,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)").bind(layerId, mapId, auth.ownerId, requiredName(input.name), type, JSON.stringify(jsonObject(input.style, "style")), position, created).run();
      await env.DB.prepare("UPDATE maps SET updated_at=?1 WHERE id=?2 AND owner_id=?3").bind(created, mapId, auth.ownerId).run(); return response({ layer: layerView(await requireLayer(env.DB, auth.ownerId, mapId, layerId)) }, 201); }
  }
  if (layerMatch) {
    const mapId = decodeURIComponent(layerMatch[1]); const layerId = decodeURIComponent(layerMatch[2]);
    if (req.method === "GET") return response({ layer: layerView(await requireLayer(env.DB, auth.ownerId, mapId, layerId)) });
    if (req.method === "DELETE") { await requireLayer(env.DB, auth.ownerId, mapId, layerId); await env.DB.prepare("DELETE FROM layers WHERE id=?1 AND map_id=?2 AND owner_id=?3").bind(layerId, mapId, auth.ownerId).run(); return new Response(null, { status: 204 }); }
    if (req.method === "PATCH") { const existing = await requireLayer(env.DB, auth.ownerId, mapId, layerId); const input = await body(req); const name = "name" in input ? requiredName(input.name) : existing.name; const style = "style" in input ? jsonObject(input.style, "style") : parseJson(existing.style_json); const position = "position" in input ? layerPosition(input.position) : existing.position; const updated = now();
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
    const url = new URL(req.url);
    const headers = {
      ...cors(req, env),
      ...(url.hostname === CANONICAL_HOSTNAME && url.protocol === "https:"
        ? { "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY }
        : {}),
      "X-Request-Id": requestId,
    };
    try {
      const redirect = httpsRedirect(url, headers);
      if (redirect) return redirect;
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (url.pathname === "/v1/health" && (req.method === "GET" || req.method === "HEAD")) {
        const result = response({ ok: true, service: "lalgeo-maps-api", version: "v1" }, 200, headers);
        return req.method === "HEAD" ? withoutBody(result) : result;
      }
      if (url.pathname === "/v1/openapi.json" && (req.method === "GET" || req.method === "HEAD")) {
        const result = response(openapi, 200, { ...headers, "Cache-Control": "public, max-age=300" });
        return req.method === "HEAD" ? withoutBody(result) : result;
      }
      const result = url.pathname === "/v1/map-open/redeem" && req.method === "POST"
        ? await redeemOpenLink(req, env)
        : await route(req, env, await authenticate(req, env), url);
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
