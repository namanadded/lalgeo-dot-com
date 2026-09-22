import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

assert.match(
  legacyHtml,
  /id="drawContextDesktop"[\s\S]*?role="group" aria-label="Drawing geometry"[\s\S]*?data-draw-geometry="point"[\s\S]*?>Point<[\s\S]*?data-draw-geometry="line"[\s\S]*?>Line<[\s\S]*?data-draw-geometry="polygon"[\s\S]*?>Polygon</,
  "Desktop Draw should expose a compact Point, Line, and Polygon chooser.",
);
assert.match(
  legacyHtml,
  /id="drawContextActive"[^>]*hidden[\s\S]*?id="drawContextActiveHint"[\s\S]*?id="drawContextUndoBtn"[^>]*>Undo<[\s\S]*?id="drawContextDoneBtn"[^>]*>Done<[\s\S]*?id="drawContextCancelBtn"[^>]*>Cancel</,
  "Active drawing should expose only contextual Undo, Done, and Cancel actions.",
);
assert.match(
  legacyHtml,
  /id="drawSelectionContext"[^>]*hidden[\s\S]*?Selected Feature[\s\S]*?id="drawSelectionPropertiesBtn"[\s\S]*?id="drawSelectionEditBtn"[\s\S]*?id="drawSelectionDuplicateBtn"[\s\S]*?id="drawSelectionMergeBtn"[\s\S]*?id="drawSelectionClearBtn"[\s\S]*?id="drawSelectionDeleteBtn"/,
  "Selected features should expose a compact, selection-specific action context.",
);
assert.match(
  legacyHtml,
  /id="addActionPopover"[^>]*role="menu"[^>]*aria-label="Add"[^>]*hidden[\s\S]*?data-add-geometry="point"[\s\S]*?>Point<[\s\S]*?data-add-geometry="line"[\s\S]*?>Line<[\s\S]*?data-add-geometry="polygon"[\s\S]*?>Polygon<[\s\S]*?id="addImportDataMenuBtn"[^>]*role="menuitem"[\s\S]*?>Import Data…<[\s\S]*?id="addLayerMenuBtn"[^>]*role="menuitem"[\s\S]*?>Add Layer…</,
  "Desktop Add should own geometry creation and retain the existing import and layer actions.",
);
assert.match(
  legacyHtml,
  /@media \(min-width: 601px\)[\s\S]*?#toolbar #editPanelToggleBtn,[\s\S]*?display:\s*none !important;[\s\S]*?#addActionPopover \.mobile-add-only\s*\{\s*display:\s*flex;[\s\S]*?#addActionPopover #addNewFeatureMenuBtn\s*\{\s*display:\s*none;/,
  "Desktop should remove the duplicate Draw entry and expose geometry choices through Add.",
);
assert.match(
  legacyHtml,
  /function startDesktopDrawingGeometry\(geometryType\)[\s\S]*?if \(measurementActive\) setMeasurementActive\(false\);[\s\S]*?switchToLayer\(targetLayer\.id, \{ revealTable: false \}\)[\s\S]*?toggleAddSurveyPointMode\(\);/,
  "Geometry choices should reuse the active layer and existing placement logic while closing Measure.",
);
assert.match(
  legacyHtml,
  /addNewFeatureMenuBtn\?\.addEventListener\("click",[\s\S]*?setEditSessionActive\(true\);[\s\S]*?startEditPanelAddFeature\(\);[\s\S]*?addImportDataMenuBtn\?\.addEventListener\("click",[\s\S]*?toggleImportBtn\?\.click\(\);[\s\S]*?addLayerMenuBtn\?\.addEventListener\("click",[\s\S]*?addLayerToActiveProject\(\);/,
  "Add menu items should delegate to the existing feature, import, and layer commands.",
);
assert.match(
  legacyHtml,
  /if \(event\.key === "Escape"\) \{[\s\S]*?addActionPopover[\s\S]*?mobileSelectPopover[\s\S]*?isAddingSurveyPoint[\s\S]*?cancelActiveFeaturePlacement\(\);[\s\S]*?selectedTableRows\?\.size \|\| activeSurveyAnnotation[\s\S]*?clearTableSelection\(\);/,
  "Escape should close popovers first, then cancel drawing, then clear selection.",
);
assert.match(
  legacyHtml,
  /event\.key === "Enter"[\s\S]*?isDesktopDrawFlow\(\)[\s\S]*?isAddingSurveyPoint[\s\S]*?hasEnoughVerticesForGeometry[\s\S]*?finalizeGeometryFeaturePlacement\(\);/,
  "Enter should finish a valid desktop line or polygon drawing.",
);
assert.match(
  legacyHtml,
  /function setMeasurementActive\(active, \{ restoreFocus = false \} = \{\}\)[\s\S]*?if \(editSessionActive\) \{[\s\S]*?setEditSessionActive\(false\);[\s\S]*?\} else if \(isAddingSurveyPoint\)/,
  "Starting Measure should close the conflicting Draw interaction mode.",
);
assert.match(
  legacyHtml,
  /\.draw-context-desktop,[\s\S]*?\.add-action-popover \{[\s\S]*?display:\s*none;[\s\S]*?@media \(min-width: 601px\)[\s\S]*?\.draw-context-desktop \{[\s\S]*?display:\s*block;/,
  "The contextual Draw and Add surfaces should remain desktop-only.",
);

console.log("Desktop Draw interaction flow checks passed.");
