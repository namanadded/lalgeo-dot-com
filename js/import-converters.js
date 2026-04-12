import { createEmptyLalLayer, fromGeoJSON, generateId, parseLalArrayBuffer } from "./lal-file.js";

export function detectImportType(files) {
  if (!files?.length) throw new Error("Choose a file to import.");
  const names = files.map((file) => file.name.toLowerCase());
  if (names.some((name) => name.endsWith(".lal"))) return "lal";
  if (names.some((name) => name.endsWith(".geojson") || name.endsWith(".json"))) return "geojson";
  if (names.some((name) => name.endsWith(".kml"))) return "kml";
  if (names.some((name) => name.endsWith(".gpx"))) return "gpx";
  if (names.some((name) => name.endsWith(".csv"))) return "csv";
  if (names.some((name) => name.endsWith(".zip") || name.endsWith(".shp") || name.endsWith(".dbf") || name.endsWith(".shx"))) return "shapefile";
  throw new Error("Unsupported file format. Use .lal, GeoJSON, Shapefile, CSV, KML, or GPX.");
}

export async function inspectImportFiles(files) {
  const type = detectImportType(files);
  if (type !== "csv") return { type };
  if (!globalThis.Papa) {
    throw new Error("PapaParse is required to import CSV files.");
  }
  const text = await files[0].text();
  const parsed = globalThis.Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  return {
    type,
    headers: parsed.meta.fields || [],
    previewRows: parsed.data.slice(0, 5),
    csvText: text,
  };
}

export async function convertImportFiles(files, options = {}) {
  const type = detectImportType(files);
  if (type === "lal") {
    return parseLalArrayBuffer(await files[0].arrayBuffer(), files[0].name);
  }
  if (type === "geojson") {
    const text = await files[0].text();
    return fromGeoJSON(JSON.parse(text), {
      layerName: options.layerName || files[0].name.replace(/\.[^.]+$/, ""),
      sourceFormat: "GeoJSON",
    });
  }
  if (type === "kml") {
    const text = await files[0].text();
    return fromGeoJSON(parseKml(text), {
      layerName: options.layerName || files[0].name.replace(/\.[^.]+$/, ""),
      sourceFormat: "KML",
    });
  }
  if (type === "gpx") {
    const text = await files[0].text();
    return fromGeoJSON(parseGpx(text), {
      layerName: options.layerName || files[0].name.replace(/\.[^.]+$/, ""),
      sourceFormat: "GPX",
    });
  }
  if (type === "csv") {
    return convertCsvFile(files[0], options);
  }
  if (type === "shapefile") {
    return convertShapefile(files, options);
  }
  throw new Error("Unsupported import type.");
}

async function convertCsvFile(file, options = {}) {
  if (!globalThis.Papa) throw new Error("PapaParse is required to import CSV files.");
  const text = options.csvText || await file.text();
  const parsed = globalThis.Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const rows = parsed.data || [];
  const latField = options.latField;
  const lonField = options.lonField;
  const wktField = options.wktField;
  if (!rows.length) throw new Error("CSV import found no rows.");
  const layer = createEmptyLalLayer({
    name: options.layerName || file.name.replace(/\.[^.]+$/, ""),
    geometryType: wktField ? "Polygon" : "Point",
  });
  layer.metadata.sourceFormat = "CSV";
  layer.features = rows.map((row, index) => {
    let geometry;
    if (wktField) {
      geometry = parseWkt(String(row[wktField] || ""));
    } else if (latField && lonField) {
      const lat = Number(row[latField]);
      const lon = Number(row[lonField]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`CSV row ${index + 1} is missing valid coordinates.`);
      }
      geometry = { type: "Point", coordinates: [lon, lat] };
    } else {
      throw new Error("Choose latitude and longitude columns or a WKT column.");
    }
    const properties = { ...row };
    if (latField) delete properties[latField];
    if (lonField) delete properties[lonField];
    if (wktField) delete properties[wktField];
    return {
      id: generateId("feature"),
      geometry,
      properties,
    };
  });
  layer.schema = inferSchemaFromRows(rows, { exclude: [latField, lonField, wktField] });
  layer.metadata.featureCount = layer.features.length;
  layer.metadata.geometryType = layer.features[0]?.geometry?.type || layer.metadata.geometryType;
  return layer;
}

async function convertShapefile(files, options = {}) {
  if (!globalThis.shp) {
    throw new Error("shpjs is required to import Shapefiles.");
  }
  let arrayBuffer;
  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
    arrayBuffer = await files[0].arrayBuffer();
  } else {
    if (!globalThis.JSZip) throw new Error("JSZip is required to package Shapefile parts.");
    const zip = new globalThis.JSZip();
    await Promise.all(files.map(async (file) => {
      zip.file(file.name, await file.arrayBuffer());
    }));
    arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  }
  const geojson = await globalThis.shp(arrayBuffer);
  const featureCollection = Array.isArray(geojson)
    ? { type: "FeatureCollection", features: geojson.flatMap((item) => item.features || []) }
    : geojson;
  return fromGeoJSON(featureCollection, {
    layerName: options.layerName || files[0].name.replace(/\.[^.]+$/, ""),
    sourceFormat: "Shapefile",
  });
}

function parseKml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const placemarks = [...xml.querySelectorAll("Placemark")];
  return {
    type: "FeatureCollection",
    features: placemarks.map((placemark, index) => {
      const name = placemark.querySelector("name")?.textContent?.trim() || `Placemark ${index + 1}`;
      const description = placemark.querySelector("description")?.textContent?.trim() || "";
      const geometry = parseXmlGeometry(placemark);
      return {
        type: "Feature",
        id: generateId("feature"),
        geometry,
        properties: { name, description },
      };
    }).filter((feature) => feature.geometry),
  };
}

function parseGpx(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const features = [];
  [...xml.querySelectorAll("wpt")].forEach((node, index) => {
    features.push({
      type: "Feature",
      id: generateId("feature"),
      geometry: {
        type: "Point",
        coordinates: [Number(node.getAttribute("lon")), Number(node.getAttribute("lat"))],
      },
      properties: {
        name: node.querySelector("name")?.textContent?.trim() || `Waypoint ${index + 1}`,
        description: node.querySelector("desc")?.textContent?.trim() || "",
      },
    });
  });
  [...xml.querySelectorAll("trk")].forEach((track, index) => {
    const coords = [...track.querySelectorAll("trkpt")].map((point) => [
      Number(point.getAttribute("lon")),
      Number(point.getAttribute("lat")),
    ]);
    if (!coords.length) return;
    features.push({
      type: "Feature",
      id: generateId("feature"),
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        name: track.querySelector("name")?.textContent?.trim() || `Track ${index + 1}`,
        description: track.querySelector("desc")?.textContent?.trim() || "",
      },
    });
  });
  return { type: "FeatureCollection", features };
}

function parseXmlGeometry(scope) {
  const point = scope.querySelector("Point coordinates");
  if (point) {
    const [lon, lat] = parseCoordinateTuple(point.textContent);
    return { type: "Point", coordinates: [lon, lat] };
  }
  const line = scope.querySelector("LineString coordinates");
  if (line) {
    return {
      type: "LineString",
      coordinates: parseCoordinateList(line.textContent),
    };
  }
  const polygon = scope.querySelector("Polygon outerBoundaryIs LinearRing coordinates");
  if (polygon) {
    return {
      type: "Polygon",
      coordinates: [parseCoordinateList(polygon.textContent)],
    };
  }
  return null;
}

function parseCoordinateList(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .map(parseCoordinateTuple)
    .filter((tuple) => tuple.length === 2 && tuple.every(Number.isFinite));
}

function parseCoordinateTuple(value) {
  const [lon, lat] = String(value || "").trim().split(",").map(Number);
  return [lon, lat];
}

function parseWkt(input) {
  const text = String(input || "").trim();
  if (!text) throw new Error("WKT geometry is empty.");
  if (/^POINT/i.test(text)) {
    const match = text.match(/\(\s*([^\s,]+)\s+([^\s,]+)\s*\)/i);
    if (!match) throw new Error("Unsupported POINT WKT.");
    return { type: "Point", coordinates: [Number(match[1]), Number(match[2])] };
  }
  if (/^LINESTRING/i.test(text)) {
    const coords = text.replace(/^LINESTRING\s*\(/i, "").replace(/\)\s*$/, "").split(",").map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    return { type: "LineString", coordinates: coords };
  }
  if (/^POLYGON/i.test(text)) {
    const coords = text.replace(/^POLYGON\s*\(\(/i, "").replace(/\)\)\s*$/, "").split(",").map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    return { type: "Polygon", coordinates: [coords] };
  }
  throw new Error("Only POINT, LINESTRING, and POLYGON WKT are supported.");
}

function inferSchemaFromRows(rows, options = {}) {
  const exclude = new Set((options.exclude || []).filter(Boolean));
  const fields = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => {
    if (!exclude.has(key)) fields.add(key);
  }));
  return [...fields].map((name) => {
    const values = rows.map((row) => row?.[name]).filter((value) => value !== null && value !== undefined && value !== "");
    const allNumbers = values.length > 0 && values.every((value) => typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value)));
    return {
      name,
      type: allNumbers ? "number" : "text",
      nullable: true,
      description: "",
      options: [],
    };
  });
}

