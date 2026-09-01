import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /id="sidebarTabs"[^>]*role="tablist"[\s\S]*?data-sidebar-tab="layers"[\s\S]*?data-sidebar-tab="selection"[\s\S]*?>Selection<\/button>/,
  "The Layers pop-up should expose Layers and Selection tabs."
);
assert.match(
  source,
  /data-selection-all>All<\/button>[\s\S]*?data-selection-none>None<\/button>[\s\S]*?data-layer-selectable=/,
  "Selection should provide All, None, and per-layer checkbox controls."
);
assert.match(
  source,
  /function ensureLayerStructure\(layer\)[\s\S]*?layer\.selectable = layer\.selectable !== false;/,
  "Existing layers should default to selectable unless explicitly disabled."
);
assert.match(
  source,
  /function createLayerRecord[\s\S]*?visible: true,[\s\S]*?selectable: true,/,
  "New layers should be selectable by default."
);
assert.match(
  source,
  /function setLayerSelectable\(layerId, selectable[\s\S]*?layer\.selectable = Boolean\(selectable\);[\s\S]*?updateRenderedLayerSelectability\(layerId\);[\s\S]*?scheduleLocalAutosave\(\);/,
  "Per-layer selection changes should update rendered features and persist."
);
assert.match(
  source,
  /function setAllLayersSelectable\(selectable\)[\s\S]*?layers\.forEach\(\(layer\) => setLayerSelectable\(layer\.id, selectable, \{ render: false \}\)\)/,
  "All and None should update every project layer."
);
assert.match(
  source,
  /const visibleLayers = \(activeProjectRecord\.layers \|\| \[\]\)\.filter\(\(layer\) => layer\.visible !== false && isLayerSelectable\(layer\)\)/,
  "Map hit testing should ignore layers whose selection is disabled."
);
assert.match(
  source,
  /const overlayAnnotation = surveyOverlays[\s\S]*?surveyFeatureAnnotation[\s\S]*?annotation\.surveyPoint\.rowIndex === rowIndex/,
  "Fallback hit testing should resolve line and polygon overlay feature metadata."
);
assert.match(
  source,
  /renderFeatureGeometryOnMap\(feature, layer,[\s\S]*?rowIndex: index,[\s\S]*?projectName,/,
  "Every rendered feature should retain its row index, including features outside the active layer."
);
assert.match(
  source,
  /new mapkit\.MarkerAnnotation\(coord, \{[\s\S]*?enabled: isLayerSelectable\(layer\),[\s\S]*?new mapkit\.PolylineOverlay\(coords, \{[\s\S]*?enabled: isLayerSelectable\(layer\),[\s\S]*?new mapkit\.PolygonOverlay\([\s\S]*?enabled: isLayerSelectable\(layer\),/,
  "Points, lines, and polygons should all respect layer selectability."
);
assert.match(
  source,
  /sidebarContent\?\.addEventListener\("change",[\s\S]*?data-layer-selectable[\s\S]*?setLayerSelectable\(checkbox\.dataset\.layerSelectable, checkbox\.checked\)/,
  "Selection checkboxes should update their corresponding layers."
);

console.log("Layer selection controls checks passed.");
