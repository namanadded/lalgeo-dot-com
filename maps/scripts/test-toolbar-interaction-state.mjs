import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

assert.match(
  legacyHtml,
  /function setEditSessionActive\(nextActive,[\s\S]*?if \(nextActive\) \{[\s\S]*?setMeasurementActive\(false\)[\s\S]*?setSidebarVisibility\(false\)[\s\S]*?setAdvancedGisVisible\(false\)[\s\S]*?setToolbarMenuVisibility\(false\)/,
  "Starting Draw/Edit should close conflicting measurement, panel, GIS, and menu states.",
);
assert.match(
  legacyHtml,
  /function setMeasurementActive\(active, \{ restoreFocus = false \} = \{\}\)[\s\S]*?if \(measurementActive\) \{[\s\S]*?setSidebarVisibility\(false\)[\s\S]*?setAdvancedGisVisible\(false\)[\s\S]*?setToolbarMenuVisibility\(false\)[\s\S]*?setEditSessionActive\(false\)/,
  "Starting Measure should close Layers, GIS, menus, and Draw/Edit.",
);
assert.match(
  legacyHtml,
  /function setAdvancedGisVisible\(show(?:\s*,[\s\S]*?)?\)[\s\S]*?if \(show\) \{[\s\S]*?setMeasurementActive\(false\)[\s\S]*?setSidebarVisibility\(false\)[\s\S]*?setEditSessionActive\(false\)[\s\S]*?setToolbarMenuVisibility\(false\)/,
  "Opening Tools should close conflicting map tools.",
);
assert.match(
  legacyHtml,
  /function toggleLayersPanel\(\)[\s\S]*?if \(!sidebarVisible\) \{[\s\S]*?setMeasurementActive\(false\)[\s\S]*?setAdvancedGisVisible\(false\)[\s\S]*?setEditSessionActive\(false\)[\s\S]*?setToolbarMenuVisibility\(false\)/,
  "Opening Layers should close conflicting map tools.",
);
assert.match(
  legacyHtml,
  /function openBasemapControls\(\)[\s\S]*?setMeasurementActive\(false\)[\s\S]*?setAdvancedGisVisible\(false\)[\s\S]*?setSidebarVisibility\(false\)[\s\S]*?setEditSessionActive\(false\)[\s\S]*?openToolbarMenu\("basemap", anchor\)/,
  "Opening Basemap should leave no conflicting panel or interaction mode active.",
);
assert.match(
  legacyHtml,
  /if \(event\.key === "Escape"\) \{[\s\S]*?addActionPopover[\s\S]*?mobileSelectPopover[\s\S]*?toolbarMorePopover[\s\S]*?toolbarMenuVisible[\s\S]*?setToolbarMenuVisibility\(false\)[\s\S]*?isAddingSurveyPoint[\s\S]*?cancelActiveFeaturePlacement\(\)[\s\S]*?selectedTableRows\?\.size \|\| activeSurveyAnnotation/,
  "Escape should dismiss popovers and menus before drawing and selection state.",
);
assert.match(
  legacyHtml,
  /data-basemap-pois-proxy[\s\S]*?menuShowBasemapPoisBtn\?\.click\(\);[\s\S]*?setToolbarMenuVisibility\(false\);[\s\S]*?const mapTypeButton[\s\S]*?setProjectMapType\([\s\S]*?setToolbarMenuVisibility\(false\);/,
  "Basemap actions should apply once and dismiss their menu.",
);
assert.match(
  legacyHtml,
  /--mobile-toolbar-top:\s*calc\(56px \+ env\(safe-area-inset-top, 0px\)\);[\s\S]*?--mobile-map-chrome-clearance:\s*44px;[\s\S]*?#workspaceHint\s*\{[\s\S]*?top:\s*calc\(var\(--mobile-toolbar-top\) \+ var\(--mobile-toolbar-height\) \+ 8px\);[\s\S]*?#editFloatingPanel:not\(\[hidden\]\)[\s\S]*?display:\s*block;[\s\S]*?#editFloatingPanel\[hidden\]\s*\{[\s\S]*?display:\s*none !important;/,
  "Mobile controls should anchor below the project header while hidden Draw controls remain out of layout and tab order.",
);
assert.match(
  legacyHtml,
  /@media \(max-width: 600px\) and \(orientation: landscape\)[\s\S]*?--mobile-map-chrome-clearance:\s*0px;[\s\S]*?#sidebar \.sidebar-shell\s*\{[\s\S]*?max-height:\s*calc\(78dvh - var\(--mobile-map-chrome-clearance\)[\s\S]*?#advancedGisPanel \.advanced-gis-desktop-content\s*\{[\s\S]*?max-height:\s*calc\(78dvh - var\(--mobile-map-chrome-clearance\)[\s\S]*?#sidebar \.layer-pane-helper-mobile\s*\{[\s\S]*?display:\s*none;/,
  "Landscape sheets should expand their internal scroll regions with the panel.",
);

console.log("Toolbar interaction state checks passed.");
