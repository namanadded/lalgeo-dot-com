import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /id="sidebarLayersTab"[\s\S]*?data-sidebar-tab="layers"[\s\S]*?id="sidebarSelectionTab"[\s\S]*?data-sidebar-tab="selection"[\s\S]*?id="sidebarBasemapTab"[\s\S]*?data-sidebar-tab="basemap"/,
  "Layers, Selection, and Basemap should be adjacent tabs in the workspace sidebar.",
);
assert.match(source, /\.sidebar-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, "The sidebar tab control should reserve equal space for all three tabs.");
assert.match(source, /function renderSidebarBasemapPane\(\)[\s\S]*?data-map-type="standard"[\s\S]*?data-map-type="satellite"[\s\S]*?data-map-type="hybrid"[\s\S]*?data-map-type="custom"[\s\S]*?data-basemap-pois-proxy/, "The Basemap tab should expose every background and the POI toggle.");
assert.match(source, /\["layers", "selection", "basemap"\]\.includes\(tabName\)/, "The sidebar state should recognize Basemap as a first-class tab.");
assert.match(source, /const tabOrder = \["layers", "selection", "basemap"\]/, "Arrow-key navigation should cycle through all three tabs.");
assert.doesNotMatch(source, /id="toolbarMoreBasemapItem"/, "The More menu should no longer duplicate Basemap.");
assert.match(source, /function requestCustomBasemapSetup[\s\S]*?openCreateProjectModal\(\)[\s\S]*?function continuePendingCustomBasemapSetup[\s\S]*?openCustomBasemapDialog/, "Custom should remain actionable even before a project exists.");

console.log("Basemap Layers tab checks passed.");
