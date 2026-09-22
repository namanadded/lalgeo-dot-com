import { MapError, MAX_BYTES, publicUrl, resolveSource, fetchPublicJson } from "./public-data";

export type SharedLayer = { name: string; visible: boolean; color: string; labelField: string; opacity: number; sourceUrl?: string; popoutsVisible?: boolean; labelsVisible?: boolean; geojson: any };
export type SharedMap = { version: 1; title: string; description: string; layers: SharedLayer[]; basemap: string; createdAt: string; featureCount: number };
const colors = ["red", "blue", "green", "orange", "purple"];
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
function text(value: unknown, max: number, fallback = "") {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max) throw new MapError(`Text values must be strings of at most ${max} characters.`);
  return value.trim();
}

export function normalizeGeoJson(input: any) {
  const features = input?.type === "FeatureCollection" ? input.features : input?.type === "Feature" ? [input] : null;
  if (!Array.isArray(features) || features.length > 10000) throw new MapError("Use GeoJSON with at most 10,000 features per layer.", 422);
  let vertices = 0;
  let parts = 0;
  function position(value: any) {
    if (!Array.isArray(value) || value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) ||
      Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new MapError("Geometry must use WGS84 longitude/latitude coordinates.", 422);
    if (++vertices > 150000) throw new MapError("Layer exceeds 150,000 coordinate positions.", 413);
    return [value[0], value[1]];
  }
  function line(value: any, ring = false): number[][] {
    if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) throw new MapError("Invalid line or polygon ring.", 422);
    const result = value.map(position);
    if (ring && (result[0][0] !== result.at(-1)![0] || result[0][1] !== result.at(-1)![1])) throw new MapError("Polygon rings must be closed.", 422);
    return result;
  }
  function polygon(value: any) {
    if (!Array.isArray(value) || !value.length) throw new MapError("Polygon has no rings.", 422);
    return value.map((ring: any) => line(ring, true));
  }
  function geometry(g: any, depth = 0): any {
    if (!g || depth > 5) throw new MapError("Feature has missing or overly nested geometry.", 422);
    const array = (fn: (item: any) => any) => {
      if (!Array.isArray(g.coordinates) || !g.coordinates.length) throw new MapError("Empty multi-geometry.", 422);
      parts += g.coordinates.length;
      return g.coordinates.map((item: any) => fn(item));
    };
    let coordinates;
    switch (g.type) {
      case "Point": parts++; coordinates = position(g.coordinates); break;
      case "LineString": parts++; coordinates = line(g.coordinates); break;
      case "Polygon": parts++; coordinates = polygon(g.coordinates); break;
      case "MultiPoint": coordinates = array(position); break;
      case "MultiLineString": coordinates = array(line); break;
      case "MultiPolygon": coordinates = array(polygon); break;
      case "GeometryCollection":
        if (!Array.isArray(g.geometries) || !g.geometries.length) throw new MapError("Empty geometry collection.", 422);
        return { type: g.type, geometries: g.geometries.map((v: any) => geometry(v, depth + 1)) };
      default: throw new MapError("Unsupported GeoJSON geometry.", 422);
    }
    return { type: g.type, coordinates };
  }
  const normalized = features.map((f: any) => {
    if (f?.type !== "Feature") throw new MapError("Invalid GeoJSON feature.", 422);
    const entries = Object.entries(f.properties || {});
    if (entries.length > 100) throw new MapError("A feature can have at most 100 fields.", 413);
    const properties = Object.fromEntries(entries.map(([key, value]) => {
      if (forbidden.has(key) || key.length > 120) throw new MapError("Invalid property name.");
      if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw new MapError("Feature properties must be strings, numbers, booleans, or null.");
      if (typeof value === "string" && value.length > 10000) throw new MapError("Feature property is too long.", 413);
      return [key, value];
    }));
    return { type: "Feature", properties, geometry: geometry(f.geometry) };
  });
  if (parts > 10000) throw new MapError("Layer expands to more than 10,000 geometry parts.", 413);
  return { geojson: { type: "FeatureCollection", features: normalized }, vertices, parts };
}

export async function createMap(input: any, fetchJson = fetchPublicJson): Promise<SharedMap> {
  if (!input || typeof input !== "object") throw new MapError("Provide a JSON map object.");
  const rawLayers = input.layers || (input.sourceUrl ? [{
    sourceUrl: input.sourceUrl,
    labelField: input.labelField,
    popoutsVisible: input.popoutsVisible,
    labelsVisible: input.labelsVisible
  }] : null);
  if (!Array.isArray(rawLayers) || !rawLayers.length || rawLayers.length > 12) throw new MapError("Provide between 1 and 12 layers or a sourceUrl.");
  const layers: SharedLayer[] = [];
  let totalVertices = 0, totalParts = 0;
  for (const raw of rawLayers) {
    if (!raw || typeof raw !== "object") throw new MapError("Invalid layer.");
    let data = raw.geojson;
    let sourceUrl: string | undefined;
    let title = "Map layer";
    if (raw.sourceUrl !== undefined) sourceUrl = publicUrl(raw.sourceUrl).href;
    if (!data && sourceUrl) {
      const resolved = await resolveSource(sourceUrl, fetchJson);
      data = await fetchJson(resolved.url);
      title = resolved.title;
    }
    const normalized = normalizeGeoJson(data);
    totalVertices += normalized.vertices; totalParts += normalized.parts;
    const fields = Object.keys(normalized.geojson.features[0]?.properties || {});
    const labelField = text(raw.labelField, 120, fields.find((f) => /^name$/i.test(f)) || "");
    layers.push({ name: text(raw.name, 160, title), visible: raw.visible !== false,
      color: colors.includes(raw.color) ? raw.color : "blue", labelField,
      opacity: typeof raw.opacity === "number" && raw.opacity >= 0 && raw.opacity <= 1 ? raw.opacity : 0.25,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(typeof raw.popoutsVisible === "boolean" ? { popoutsVisible: raw.popoutsVisible } : {}),
      ...(typeof raw.labelsVisible === "boolean" ? { labelsVisible: raw.labelsVisible } : {}),
      geojson: normalized.geojson });
  }
  if (!totalParts) throw new MapError("The map has no features. Add data before sharing.", 422);
  if (totalParts > 25000 || totalVertices > 300000) throw new MapError("Map exceeds 25,000 features or 300,000 coordinate positions.", 413);
  const result: SharedMap = { version: 1, title: text(input.title, 160, layers[0].name) || "Shared map",
    description: text(input.description, 2000), layers,
    basemap: ["standard", "satellite", "hybrid"].includes(input.basemap) ? input.basemap : "standard",
    createdAt: new Date().toISOString(), featureCount: layers.reduce((n, l) => n + l.geojson.features.length, 0) };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new MapError("Shared map exceeds 3 MB. Share fewer features or simplify geometry.", 413);
  return result;
}
