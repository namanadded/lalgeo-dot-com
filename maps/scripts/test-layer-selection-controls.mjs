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
assert.match(
  source,
  /@media \(max-width: 600px\)[\s\S]*?#sidebar \{[\s\S]*?z-index:\s*1300;/,
  "The mobile layer panel should stack above floating toolbar controls."
);
assert.match(
  source,
  /@media \(min-width: 601px\)[\s\S]*?#sidebar \{[\s\S]*?width:\s*286px;[\s\S]*?overflow:\s*hidden;[\s\S]*?#sidebar-content \{[\s\S]*?max-height:\s*min\(420px,\s*calc\(100vh - 186px\)\);[\s\S]*?overflow-y:\s*auto;/,
  "The desktop Layers inspector should size naturally while keeping a bounded scrolling content region."
);
assert.match(
  source,
  /#sidebar \.sidebar-tabs \{[\s\S]*?padding:\s*2px;[\s\S]*?border-radius:\s*8px;[\s\S]*?#sidebar \.sidebar-tab \{[\s\S]*?min-height:\s*28px;/,
  "The desktop Layers and Selection tabs should use a compact segmented control."
);
assert.match(
  source,
  /layer-pane-helper-desktop">Drag layers to change drawing order\.<\/p>[\s\S]*?layer-pane-helper-mobile">Use More to change drawing order\.<\/p>/,
  "Desktop should retain drag guidance while mobile points to the exposed ordering actions."
);
assert.match(
  source,
  /class="layer-visibility-toggle \$\{item\.visible === false \? "is-off" : ""\}"[\s\S]*?class="layer-visibility-check"[\s\S]*?class="layer-visibility-icon"[\s\S]*?<circle cx="12" cy="12" r="2\.5">/,
  "Layer visibility should retain the mobile checkmark and provide an eye icon for desktop."
);
assert.match(
  source,
  /#sidebar \.layer-pane-row \{[\s\S]*?grid-template-columns:\s*18px 26px minmax\(0, 1fr\) 28px;[\s\S]*?#sidebar \.layer-pane-actions \.layer-order-btn \{[\s\S]*?display:\s*none;/,
  "Desktop rows should expose only drag, visibility, layer name, and More."
);
assert.match(
  source,
  /id="layerContextMoveUpBtn"[\s\S]*?data-layer-context-action="move-up"[\s\S]*?id="layerContextMoveDownBtn"[\s\S]*?data-layer-context-action="move-down"/,
  "Move Up and Move Down should remain available from the layer More menu."
);
assert.match(
  source,
  /function updateLayerContextMoveButtons\(layerId\)[\s\S]*?layerContextMoveUpBtn\.disabled = !canMoveUp;[\s\S]*?layerContextMoveDownBtn\.disabled = !canMoveDown;/,
  "Layer menu reorder actions should preserve their boundary-aware disabled states."
);

console.log("Layer selection controls checks passed.");
