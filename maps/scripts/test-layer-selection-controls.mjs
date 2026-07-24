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
  /function showSurveyCallout\(annotation, options = \{\}\)[\s\S]*?activateLayerForFeatureInspection\(annotation\.surveyPoint\.layerId\);[\s\S]*?setTableRowSelection\(annotation\.surveyPoint\.rowIndex\);/,
  "Selecting a rendered feature, including a live API feature, should update the table's real selection state."
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
assert.match(
  source,
  /id="layerContextLabelsBtn"[\s\S]*?data-layer-context-action="labels"[\s\S]*?role="menuitemcheckbox"[\s\S]*?aria-checked="false"/,
  "The layer context menu should expose a checkbox-style label visibility control."
);
assert.match(
  source,
  /function ensureLayerLabelSettings\(layer\)[\s\S]*?enabled: previous\.enabled === true,/,
  "Layer labels should default to off unless they were explicitly enabled."
);
assert.match(
  source,
  /if \(action === "labels"\)[\s\S]*?enabled: !labelSettings\.enabled[\s\S]*?updateAnnotationLabels\(\);[\s\S]*?scheduleLocalAutosave\(\);/,
  "The layer context menu should toggle labels, refresh the map, and persist the choice."
);
assert.match(
  source,
  /--mobile-panel-safe-top:\s*calc\(env\(safe-area-inset-top,\s*0px\) \+ 116px\);[\s\S]*?#sidebar \{[\s\S]*?top:\s*var\(--mobile-panel-safe-top\);[\s\S]*?#dataCatalogPane \{[\s\S]*?top:\s*var\(--mobile-panel-safe-top\);/,
  "Mobile Layers and Data Manager panels should share a safe top edge below the floating controls."
);
assert.match(
  source,
  /\.measurement-panel,[\s\S]*?\.advanced-gis-panel,[\s\S]*?\.floating-toolbar \{[\s\S]*?top:\s*var\(--mobile-panel-safe-top\) !important;[\s\S]*?max-height:\s*calc\(100dvh - var\(--mobile-panel-safe-top\) - 16px\);/,
  "Mobile measurement, Advanced GIS, edit, and layer tool panels should use the same unobstructed top edge."
);
assert.match(
  source,
  /toolbar\?\.querySelector\("\.toolbar-quick-actions"\)\?\.addEventListener\("click",[\s\S]*?max-width: 600px[\s\S]*?group\?\.classList\.remove\("expanded"\)[\s\S]*?aria-expanded", "false"/,
  "Choosing a mobile quick action should collapse the icon strip before its panel is displayed."
);

console.log("Layer selection controls checks passed.");
