import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

function extractFunction(name) {
  const start = legacyHtml.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist.`);
  const bodyStart = legacyHtml.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < legacyHtml.length; index += 1) {
    if (legacyHtml[index] === "{") depth += 1;
    if (legacyHtml[index] === "}") depth -= 1;
    if (depth === 0) return legacyHtml.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}.`);
}

const getApiEndpointRequestSource = extractFunction("getApiEndpointRequest");
const getApiEndpointRequest = new Function(
  "SOCRATA_BROWSER_ROW_LIMIT",
  `${getApiEndpointRequestSource}; return getApiEndpointRequest;`,
)(10000);

const optimized = getApiEndpointRequest("https://data.calgary.ca/api/v3/views/vt3t-jpfj/query.json");
assert.equal(optimized.optimized, true, "Unfiltered Socrata v3 queries should use the browser-safe resource route.");
assert.equal(optimized.rowLimit, 10000, "Socrata imports should use the declared browser row limit.");
assert.equal(
  optimized.url,
  "https://data.calgary.ca/resource/vt3t-jpfj.json?%24limit=10000",
  "Socrata optimization should preserve the dataset id and add a stable row limit.",
);

const filtered = "https://data.calgary.ca/api/v3/views/vt3t-jpfj/query.json?where=latitude%3E51";
assert.deepEqual(
  getApiEndpointRequest(filtered),
  { url: filtered, optimized: false },
  "Explicit Socrata query parameters must not be rewritten.",
);

const mapCalls = { batchAdds: 0, singleAdds: 0, batchSize: 0 };
const map = {
  addAnnotations(annotations) {
    mapCalls.batchAdds += 1;
    mapCalls.batchSize += annotations.length;
  },
  addAnnotation() {
    mapCalls.singleAdds += 1;
  },
};
const batching = new Function(
  "map",
  `${extractFunction("queueMapAnnotation")}
   ${extractFunction("flushMapAnnotationBatch")}
   return { queueMapAnnotation, flushMapAnnotationBatch };`,
)(map);
const annotationBatch = [];
for (let index = 0; index < 1000; index += 1) {
  batching.queueMapAnnotation({ id: index }, annotationBatch);
}
batching.flushMapAnnotationBatch(annotationBatch);
assert.deepEqual(
  mapCalls,
  { batchAdds: 1, singleAdds: 0, batchSize: 1000 },
  "Large point annotations should enter MapKit through one batch operation.",
);
assert.equal(annotationBatch.length, 0, "Flushing annotations should clear the reusable render batch.");

const aggregation = new Function(
  "DEFAULT_POINT_AGGREGATION",
  "MAX_POINT_AGGREGATION_CELL_DEGREES",
  "LARGE_POINT_CLUSTER_THRESHOLD",
  `${extractFunction("normalizePointAggregation")}
   ${extractFunction("getPointAggregationCell")}
   ${extractFunction("getAnnotationClusterIdentifier")}
   return { normalizePointAggregation, getAnnotationClusterIdentifier };`,
)(60, 0.08, 250);
const largeMarkerSet = new Set(Array.from({ length: 1000 }, (_, index) => index));
assert.equal(
  aggregation.getAnnotationClusterIdentifier(
    { id: "lights", styleDefaults: { pointAggregation: 0 } },
    largeMarkerSet,
    { id: "feature-1" },
  ),
  null,
  "An aggregation value of zero should disable clustering.",
);
assert.equal(
  aggregation.getAnnotationClusterIdentifier(
    { id: "lights", styleDefaults: { pointAggregation: 100 } },
    largeMarkerSet,
    { id: "feature-1" },
  ),
  "lalgeo-layer-lights",
  "Maximum aggregation should retain one layer-wide cluster identifier.",
);
const moderateClusterIds = new Set(
  [
    { id: "northwest", geometry: { lat: 51.12, lng: -114.18 } },
    { id: "northeast", geometry: { lat: 51.12, lng: -113.95 } },
    { id: "south", geometry: { lat: 50.92, lng: -114.05 } },
  ].map((feature) => aggregation.getAnnotationClusterIdentifier(
    { id: "lights", styleDefaults: { pointAggregation: 60 } },
    largeMarkerSet,
    feature,
  )),
);
assert.ok(
  moderateClusterIds.size > 1,
  "Moderate aggregation should split a layer into stable geographic cluster cells.",
);

assert.match(
  legacyHtml,
  /clusteringIdentifier:\s*getAnnotationClusterIdentifier\(layer,\s*markerFeatureSet,\s*feature\)/,
  "Large marker sets should opt into MapKit annotation clustering.",
);
assert.match(
  legacyHtml,
  /id="layerPointAggregation"[\s\S]*?type="range" min="0" max="100" step="5"[\s\S]*?0 shows individual rendered points\./,
  "Point layer properties should expose a persisted zero-to-one-hundred aggregation control.",
);
assert.match(
  legacyHtml,
  /if \(canEditLayer\(layer\)\) setAnnotationDraggable\(marker\);/,
  "Read-only API reference markers should not receive editing drag handlers.",
);
assert.match(
  legacyHtml,
  /typeof map\.removeAnnotations === "function"[\s\S]*?map\.removeAnnotations\(annotationsToRemove\)/,
  "Large annotation collections should also be removed in one MapKit batch.",
);
assert.match(
  legacyHtml,
  /payload\?\.source\?\.importNote[\s\S]*?escapeHtml\(payload\.source\.importNote\)/,
  "The import review should explain when a browser-safe Socrata subset is used.",
);
assert.match(
  legacyHtml,
  /setActiveProject\(activeProjectRecord,\s*\{\s*preserveRegion,\s*refreshApi:\s*false\s*\}\)[\s\S]*?addProjectToWorkspace\(project,\s*\{\s*preserveRegion:\s*false,\s*refreshApi:\s*false\s*\}\)/,
  "A newly imported live API layer should not be fetched a second time immediately.",
);
assert.match(
  legacyHtml,
  /const allLayersAreFresh = apiReferenceLayers\.every[\s\S]*?now - loadedAt < API_REFERENCE_REFRESH_COOLDOWN_MS/,
  "A just-loaded API reference should ignore project-state refresh races.",
);

console.log("Large API point performance checks passed.");
