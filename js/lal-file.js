const DEFAULT_STYLE = {
  symbolColor: "Red",
  symbolShape: "Dot",
};

const DEFAULT_SCHEMA = [
  { name: "name", type: "text", nullable: true, description: "Feature name", options: [] },
  { name: "description", type: "text", nullable: true, description: "Feature description", options: [] },
];

export function generateId(prefix = "lal") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyLalLayer({ name = "New Layer", geometryType = "Point", documentType = "layer" } = {}) {
  const now = new Date().toISOString();
  return {
    kind: "lal-layer",
    version: 2,
    metadata: {
      id: generateId("layer"),
      name,
      description: "",
      documentType,
      geometryType,
      createdAt: now,
      updatedAt: now,
      createdBy: "LalGeo Data Manager",
      lastModifiedBy: "LalGeo Data Manager",
      featureCount: 0,
      sourceFormat: "lal",
      projectStorageMode: documentType === "layer" ? "reference" : "embedded",
    },
    schema: cloneSchema(DEFAULT_SCHEMA),
    style: { ...DEFAULT_STYLE },
    features: [],
    revision: {
      dropboxRev: null,
      sourcePath: null,
      lastSyncedAt: null,
    },
  };
}

export function cloneLayer(layer) {
  return JSON.parse(JSON.stringify(layer));
}

export function cloneSchema(schema = DEFAULT_SCHEMA) {
  return schema.map((field) => ({
    name: field.name,
    type: field.type || "text",
    nullable: field.nullable !== false,
    description: field.description || "",
    options: Array.isArray(field.options) ? [...field.options] : [],
  }));
}

export function serializeLalDocument(layer) {
  const normalized = normalizeLalDocument(layer);
  normalized.metadata.featureCount = normalized.features.length;
  normalized.metadata.updatedAt = new Date().toISOString();
  return JSON.stringify(normalized, null, 2);
}

export async function parseLalArrayBuffer(buffer, filename = "layer.lal") {
  const bytes = buffer instanceof ArrayBuffer ? buffer : await buffer.arrayBuffer();
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(bytes);
  const trimmed = text.trim();

  if (trimmed.startsWith("{")) {
    return normalizeLalDocument(JSON.parse(trimmed), filename);
  }

  if (!globalThis.JSZip) {
    throw new Error("JSZip is required to open packaged .lal files.");
  }

  const zip = await globalThis.JSZip.loadAsync(bytes);
  const surveyEntry = zip.file("survey.json");
  const metadataEntry = zip.file("metadata.json");
  if (!surveyEntry || !metadataEntry) {
    throw new Error("Unsupported .lal package. Expected survey.json and metadata.json.");
  }
  const surveyJson = JSON.parse(await surveyEntry.async("string"));
  const metadataJson = JSON.parse(await metadataEntry.async("string"));
  return convertSurveyPackageToLal(surveyJson, metadataJson, filename);
}

export function normalizeLalDocument(input, filename = "layer.lal") {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid LalGeo layer.");
  }

  if (input.kind === "lal-layer" && Array.isArray(input.features)) {
    const layer = cloneLayer(input);
    layer.schema = cloneSchema(layer.schema?.length ? layer.schema : inferSchemaFromFeatures(layer.features));
    layer.style = { ...DEFAULT_STYLE, ...(layer.style || {}) };
    layer.metadata = {
      ...createEmptyLalLayer({ name: filename.replace(/\.lal$/i, ""), documentType: input?.metadata?.documentType || "layer" }).metadata,
      ...(layer.metadata || {}),
      featureCount: Array.isArray(layer.features) ? layer.features.length : 0,
    };
    layer.features = Array.isArray(layer.features) ? layer.features.map(normalizeFeature) : [];
    layer.revision = {
      dropboxRev: layer.revision?.dropboxRev || null,
      sourcePath: layer.revision?.sourcePath || null,
      lastSyncedAt: layer.revision?.lastSyncedAt || null,
    };
    return layer;
  }

  if (input.version && Array.isArray(input.points)) {
    return convertSurveyPackageToLal(input, { name: filename.replace(/\.lal$/i, "") }, filename);
  }

  if (input.type === "FeatureCollection") {
    return fromGeoJSON(input, { layerName: filename.replace(/\.[^.]+$/, "") });
  }

  throw new Error("Unsupported LalGeo document structure.");
}

export function normalizeFeature(feature) {
  return {
    id: feature.id || generateId("feature"),
    geometry: normalizeGeometry(feature.geometry),
    properties: { ...(feature.properties || {}) },
  };
}

export function normalizeGeometry(geometry) {
  if (!geometry || !geometry.type) {
    return { type: "Point", coordinates: [0, 0] };
  }
  return {
    type: geometry.type,
    coordinates: Array.isArray(geometry.coordinates)
      ? JSON.parse(JSON.stringify(geometry.coordinates))
      : geometry.coordinates,
  };
}

export function inferSchemaFromFeatures(features = []) {
  const sample = features.map((feature) => feature.properties || {});
  const names = new Set(DEFAULT_SCHEMA.map((field) => field.name));
  sample.forEach((row) => Object.keys(row || {}).forEach((key) => names.add(key)));
  return [...names].map((name) => {
    const values = sample.map((row) => row?.[name]).filter((value) => value !== null && value !== undefined && value !== "");
    const type = inferFieldType(values);
    return {
      name,
      type,
      nullable: true,
      description: name === "name" ? "Feature name" : "",
      options: type === "dropdown" ? uniqueStrings(values) : [],
    };
  });
}

function inferFieldType(values) {
  if (!values.length) return "text";
  const unique = uniqueStrings(values);
  const allNumbers = values.every((value) => typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value)));
  if (allNumbers) return "number";
  if (unique.length > 0 && unique.length <= 8 && values.length >= unique.length * 2) return "dropdown";
  return "text";
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function fromGeoJSON(geojson, options = {}) {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const layerName = options.layerName || geojson.name || "Imported Layer";
  const geometryType = deriveGeometryType(features[0]?.geometry?.type || options.geometryType || "Point");
  const layer = createEmptyLalLayer({ name: layerName, geometryType, documentType: options.documentType || "layer" });
  layer.features = features.map((feature) => ({
    id: feature.id || generateId("feature"),
    geometry: normalizeGeometry(feature.geometry),
    properties: { ...(feature.properties || {}) },
  }));
  layer.schema = cloneSchema(inferSchemaFromFeatures(layer.features));
  layer.metadata.featureCount = layer.features.length;
  layer.metadata.sourceFormat = options.sourceFormat || "GeoJSON";
  return layer;
}

export function toGeoJSON(layer) {
  const normalized = normalizeLalDocument(layer);
  return {
    type: "FeatureCollection",
    name: normalized.metadata.name,
    features: normalized.features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: normalizeGeometry(feature.geometry),
      properties: { ...(feature.properties || {}) },
    })),
  };
}

export function convertSurveyPackageToLal(surveyJson, metadataJson = {}, filename = "layer.lal") {
  const layerName = metadataJson.name || filename.replace(/\.lal$/i, "");
  const geometryType = deriveGeometryType(metadataJson.geometryType || "Point");
  const layer = createEmptyLalLayer({
    name: layerName,
    geometryType,
    documentType: metadataJson.documentType || "project",
  });
  const points = Array.isArray(surveyJson.points) ? surveyJson.points : [];
  layer.features = points.map((point) => ({
    id: point.id || generateId("feature"),
    geometry: {
      type: "Point",
      coordinates: [Number(point.lon || point.longitude || 0), Number(point.lat || point.latitude || 0)],
    },
    properties: { ...(point.attributes || {}) },
  }));
  layer.schema = cloneSchema(
    Array.isArray(surveyJson.fields)
      ? surveyJson.fields
          .filter((field) => !["id", "date", "lat", "lon"].includes(String(field).toLowerCase()))
          .map((field) => ({
            name: field,
            type: surveyJson.questionMeta?.[field]?.normalizedType || "text",
            nullable: !surveyJson.questionMeta?.[field]?.required,
            description: "",
            options: surveyJson.questionMeta?.[field]?.choices || [],
          }))
      : inferSchemaFromFeatures(layer.features)
  );
  layer.style = {
    symbolColor: surveyJson.mapSymbol?.color || DEFAULT_STYLE.symbolColor,
    symbolShape: surveyJson.mapSymbol?.shape || DEFAULT_STYLE.symbolShape,
  };
  layer.metadata = {
    ...layer.metadata,
    description: metadataJson.description || "",
    documentType: metadataJson.documentType || "project",
    createdAt: metadataJson.createdAt || surveyJson.updatedAt || layer.metadata.createdAt,
    updatedAt: surveyJson.updatedAt || metadataJson.updatedAt || layer.metadata.updatedAt,
    createdBy: metadataJson.createdBy || layer.metadata.createdBy,
    lastModifiedBy: surveyJson.updatedBy || metadataJson.createdBy || layer.metadata.lastModifiedBy,
    featureCount: layer.features.length,
    sourceFormat: "Survey Package",
  };
  return layer;
}

export function exportLayer(layer, format = "lal") {
  if (format === "geojson") {
    return {
      fileName: `${slugify(layer.metadata.name)}.geojson`,
      mimeType: "application/geo+json",
      contents: JSON.stringify(toGeoJSON(layer), null, 2),
    };
  }
  return {
    fileName: `${slugify(layer.metadata.name)}.lal`,
    mimeType: "application/json",
    contents: serializeLalDocument(layer),
  };
}

export function slugify(input) {
  return String(input || "lalgeo-layer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "lalgeo-layer";
}

export function deriveGeometryType(type) {
  const value = String(type || "Point").toLowerCase();
  if (value.includes("polygon")) return "Polygon";
  if (value.includes("line")) return "LineString";
  return "Point";
}
