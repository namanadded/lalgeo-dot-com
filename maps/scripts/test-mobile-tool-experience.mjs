import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");
const mobileStyles = legacyHtml.match(
  /@media \(max-width: 600px\) \{[\s\S]*?:root \{\s*--mobile-tool-radius:[\s\S]*?(?=\n\s*\.print-prep-summary)/,
)?.[0];

assert.ok(mobileStyles, "Expected a dedicated mobile tool experience stylesheet.");
assert.match(
  mobileStyles,
  /--mobile-toolbar-top:\s*calc\(56px \+ env\(safe-area-inset-top, 0px\)\);[\s\S]*?#toolbar #quickActionBar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*var\(--mobile-toolbar-top\);[\s\S]*?bottom:\s*auto;[\s\S]*?width:\s*min\(232px,\s*calc\(100vw - 16px\)\);/,
  "The mobile primary toolbar should be a compact, safe-area-aware control below the project header.",
);
assert.match(
  mobileStyles,
  /#toolbar #mobileSelectPopover,[\s\S]*?#addActionPopover\s*\{[\s\S]*?top:\s*calc\(var\(--mobile-toolbar-top\) \+ var\(--mobile-toolbar-height\) \+ 8px\);[\s\S]*?bottom:\s*auto;[\s\S]*?#toolbar #toolbarMorePopover\s*\{[\s\S]*?top:\s*calc\(100% \+ 8px\);[\s\S]*?bottom:\s*auto;/,
  "Mobile Select, Add, and More popovers should open below the top toolbar.",
);
assert.match(
  mobileStyles,
  /#toolbar #quickActionBar \.toolbar-history-group\[hidden\]\s*\{\s*display:\s*none !important;[\s\S]*?#toolbar #quickActionBar \.toolbar-history-group:not\(\[hidden\]\)\s*\{\s*display:\s*flex;/,
  "Undo and Redo should consume mobile toolbar space only while edit history exists.",
);
assert.match(
  mobileStyles,
  /\.toolbar-history-group:not\(\[hidden\]\) \.menu-bar-btn\.quick-action\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*50px;/,
  "Contextual mobile history controls should retain at least 44px touch targets.",
);
assert.match(
  mobileStyles,
  /#toolbar #quickActionBar #editPanelToggleBtn,[\s\S]*?#toolbar #quickActionBar #myLocationBtn\s*\{\s*display:\s*none !important;[\s\S]*?#toolbar #quickActionBar #mobileSelectMenu\s*\{[\s\S]*?display:\s*block;/,
  "Mobile should replace permanent Draw and Locate actions with Select.",
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
  /#toolbar #toolbarMorePopover \.toolbar-more-item\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*20px minmax\(0, 1fr\);[\s\S]*?column-gap:\s*12px;[\s\S]*?text-align:\s*left;/,
  "Mobile More rows should keep icons and labels in a compact, left-aligned grid.",
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
  "Tools should reuse the existing contextual command groups in a mobile sheet.",
);
assert.match(
  mobileStyles,
  /#editFloatingPanel \.edit-panel-title::before,[\s\S]*?#editFloatingPanel #editPanelPinBtn,[\s\S]*?#editFloatingPanel \.edit-panel-body-mobile\s*\{\s*display:\s*none;[\s\S]*?#editFloatingPanel \.draw-context-desktop\s*\{\s*display:\s*block;/,
  "Drawing started through Add should reuse the contextual geometry and action states on mobile.",
);
assert.match(
  legacyHtml,
  /id="mobileSelectBtn"[\s\S]*?>Select<[\s\S]*?id="addSurveyPointBtn"[\s\S]*?>Add<[\s\S]*?id="toolbarLayersBtn"[\s\S]*?>Layers<[\s\S]*?id="toolbarMoreBtn"[\s\S]*?>More</,
  "The mobile toolbar should expose Select, Add, Layers, and More in order.",
);
assert.match(
  legacyHtml,
  /data-add-geometry="point"[\s\S]*?data-add-geometry="line"[\s\S]*?data-add-geometry="polygon"[\s\S]*?id="addImportDataMenuBtn"[\s\S]*?id="addImportPhotosMenuBtn"/,
  "Add should expose existing drawing and import entry points.",
);
assert.match(
  legacyHtml,
  /id="toolbarMoreGisItem"[\s\S]*?<span>Tools<\/span>/,
  "More should use the simpler Tools label.",
);
assert.match(
  mobileStyles,
  /#mobileLocationBtn\s*\{[\s\S]*?right:\s*12px;[\s\S]*?bottom:\s*94px;[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  "Locate should be a touch-sized floating map control.",
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
  /function showSurveyCallout\(annotation,[\s\S]*?if \(mobileSelectionMode\)[\s\S]*?setTableRowSelection\(annotation\.surveyPoint\.rowIndex, \{ ctrlKey: true \}\)/,
  "Select mode should add or remove map features through the shared multi-selection set.",
);
assert.match(
  legacyHtml,
  /data-select-tool="box-select">Box Select<[\s\S]*?id="mobileBoxSelectionOverlay"[^>]*aria-label="Box selection area"[^>]*hidden[\s\S]*?id="mobileBoxSelectionRect"[\s\S]*?id="mobileBoxSelectionCancelBtn"/,
  "Select should expose a cancellable box-selection surface.",
);
assert.match(
  legacyHtml,
  /function setMobileBoxSelectionMode\(active\)[\s\S]*?setMobileSelectionMode\(true\)[\s\S]*?mobileBoxSelectionOverlay\.hidden = !nextActive[\s\S]*?function selectFeaturesInMobileBox\(rect\)[\s\S]*?doesFeatureIntersectMobileSelectionRect[\s\S]*?selectedTableRows = new Set\(matches\)/,
  "Box Select should reuse the active layer and existing selected-row state.",
);
assert.match(
  legacyHtml,
  /mobileBoxSelectionOverlay\?\.addEventListener\("pointerdown"[\s\S]*?setPointerCapture[\s\S]*?addEventListener\("pointermove"[\s\S]*?normalizeMobileSelectionRect[\s\S]*?addEventListener\("pointerup", finishMobileBoxSelection\)/,
  "Box Select should use a pointer drag with a visible selection rectangle.",
);
assert.match(
  legacyHtml,
  /if \(mobileBoxSelectionMode\) \{[\s\S]*?setMobileBoxSelectionMode\(false\);[\s\S]*?setProjectStatus\("Box selection canceled\."/,
  "Escape should cancel Box Select before clearing an existing selection.",
);
assert.match(
  legacyHtml,
  /function setMeasurementActive\(active\)[\s\S]*?setMobileSelectionMode\(false\)[\s\S]*?window\.matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?setSidebarVisibility\(false\)[\s\S]*?setAdvancedGisVisible\(false\)/,
  "Opening Measure should close conflicting mobile tool sheets.",
);

console.log("Mobile tool experience checks passed.");
