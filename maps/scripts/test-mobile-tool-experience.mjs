import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");
const mobileStyles = legacyHtml.match(
  /@media \(max-width: 600px\) \{\s*:root \{\s*--mobile-tool-radius:[\s\S]*?(?=\n\s*\.print-prep-summary)/,
)?.[0];

assert.ok(mobileStyles, "Expected a dedicated mobile tool experience stylesheet.");
assert.match(
  mobileStyles,
  /#toolbar #quickActionBar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*var\(--mobile-toolbar-bottom\);[\s\S]*?width:\s*min\(286px,\s*calc\(100vw - 16px\)\);/,
  "The mobile primary toolbar should be a compact, safe-area-aware bottom control.",
);
assert.match(
  mobileStyles,
  /#toolbar #quickActionBar \.toolbar-history-group\s*\{\s*display:\s*none;/,
  "Undo and Redo should not consume persistent mobile toolbar space.",
);
assert.match(
  mobileStyles,
  /#toolbar #quickActionBar #toolbarBasemapBtn,[\s\S]*?#toolbar #quickActionBar #measureToolBtn,[\s\S]*?#toolbar #quickActionBar #advancedGisBtn\s*\{\s*display:\s*none !important;/,
  "Secondary tools should be hidden from the persistent mobile toolbar.",
);
assert.match(
  mobileStyles,
  /#toolbar #quickActionBar \.menu-bar-btn\.quick-action\s*\{[\s\S]*?width:\s*52px;[\s\S]*?min-height:\s*50px;/,
  "Mobile controls should remain visually compact with accessible touch targets.",
);
assert.match(
  mobileStyles,
  /#toolbar #toolbarMorePopover \.toolbar-more-item\s*\{[\s\S]*?color:\s*#667085;[\s\S]*?#toolbar #toolbarMorePopover \.toolbar-more-item\.active\s*\{[\s\S]*?color:\s*#0f766e;/,
  "Mobile More rows should use the toolbar's neutral icon color and a consistent active-child treatment.",
);
assert.match(
  mobileStyles,
  /#sidebar,[\s\S]*?#measurementPanel,[\s\S]*?#advancedGisPanel,[\s\S]*?#editFloatingPanel,[\s\S]*?#toolbarMenuTray\[data-active-menu="basemap"\]\s*\{[\s\S]*?position:\s*fixed(?: !important)?;[\s\S]*?bottom:\s*0(?: !important)?;[\s\S]*?border-radius:\s*var\(--mobile-tool-radius\) var\(--mobile-tool-radius\) 0 0;/,
  "Mobile tool surfaces should share the compact bottom-sheet presentation.",
);
assert.match(
  mobileStyles,
  /#measurementPanel \.measurement-result-secondary-mobile,[\s\S]*?\.measurement-hint-mobile,[\s\S]*?\.measurement-action-label-mobile\s*\{\s*display:\s*none;[\s\S]*?#measurementPanel \.measurement-result-secondary-desktop,[\s\S]*?\.measurement-hint-desktop,[\s\S]*?\.measurement-action-label-desktop\s*\{\s*display:\s*block;/,
  "Measure should use concise contextual result and action labels on mobile.",
);
assert.match(
  mobileStyles,
  /#advancedGisPanel \.advanced-gis-badge,[\s\S]*?\.advanced-gis-mobile-content\s*\{\s*display:\s*none;[\s\S]*?#advancedGisPanel \.advanced-gis-desktop-content\s*\{[\s\S]*?display:\s*block;/,
  "Advanced GIS should reuse the existing contextual command groups in a mobile sheet.",
);
assert.match(
  mobileStyles,
  /#editFloatingPanel \.edit-panel-title::before,[\s\S]*?#editFloatingPanel #editPanelPinBtn,[\s\S]*?#editFloatingPanel \.edit-panel-body-mobile\s*\{\s*display:\s*none;[\s\S]*?#editFloatingPanel \.draw-context-desktop\s*\{\s*display:\s*block;/,
  "Draw should reuse the contextual geometry and action states on mobile.",
);
assert.match(
  legacyHtml,
  /function setToolbarMoreVisibility\(show,[\s\S]*?const visible = Boolean\(show\);/,
  "The shared More popover should be available on mobile.",
);
assert.match(
  legacyHtml,
  /function openBasemapControls\(\)[\s\S]*?openToolbarMenu\("basemap", anchor\);[\s\S]*?toolbarBasemapBtn\?\.addEventListener\("click", openBasemapControls\);/,
  "Mobile Basemap should delegate to the existing focused basemap handler.",
);
assert.match(
  legacyHtml,
  /function renderSelectedFeatureInspector\(\)[\s\S]*?window\.matchMedia\("\(min-width: 601px\)"\)\.matches[\s\S]*?selectedFeatureInspector\.classList\.add\("visible"\);[\s\S]*?selectedFeatureInspector\?\.addEventListener\("click"[\s\S]*?previewAnnotationByRow\([\s\S]*?setEditSessionActive\(true\)[\s\S]*?mergeSelectedFeatures\([\s\S]*?exportSelectedGeoJson\(/,
  "The mobile selection surface should reuse existing selection and editing handlers.",
);
assert.match(
  legacyHtml,
  /function setMeasurementActive\(active\)[\s\S]*?window\.matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?setSidebarVisibility\(false\)[\s\S]*?setAdvancedGisVisible\(false\)/,
  "Opening Measure should close conflicting mobile tool sheets.",
);

console.log("Mobile tool experience checks passed.");
