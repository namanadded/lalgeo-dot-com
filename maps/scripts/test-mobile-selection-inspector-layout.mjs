import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

assert.match(
  legacyHtml,
  /<div id="surveyTableWrapper" hidden>\s*<div id="surveyTable"><\/div>\s*<\/div>\s*<\/div>\s*<div id="selectedFeatureInspector"><\/div>\s*<div id="fieldCalculatorBackdrop"/,
  "The mobile selection inspector must sit outside the transformed table panel.",
);

assert.match(
  legacyHtml,
  /#selectedFeatureInspector\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*calc\(var\(--mobile-toolbar-bottom\) \+ var\(--mobile-toolbar-height\) \+ 8px\);/,
  "The mobile selection inspector must reserve the toolbar height and safe-area clearance.",
);

assert.match(
  legacyHtml,
  /body\.mobile-survey-table-open #toolbar #quickActionBar\s*\{\s*display:\s*none !important;/,
  "The persistent mobile toolbar must not cover an expanded attribute table.",
);

assert.match(
  legacyHtml,
  /function setSurveyTableToggleState\(isOpen\)\s*\{[\s\S]*?classList\.toggle\("mobile-survey-table-open", Boolean\(isOpen\)\)[\s\S]*?setMobileSelectPopoverVisibility\(false\)[\s\S]*?setAddActionPopoverVisibility\(false\)/,
  "Opening the mobile table must synchronize toolbar visibility and dismiss its popovers.",
);

assert.match(
  legacyHtml,
  /function renderSelectedFeatureInspector\(\)[\s\S]*?featureDrawer\?\.classList\.contains\("open"\)[\s\S]*?!editFloatingPanel\?\.hidden[\s\S]*?selectedFeatureInspector\.classList\.remove\("visible"\);/,
  "The compact selection inspector must close when Feature Details or the edit context is visible.",
);

assert.match(
  legacyHtml,
  /function setEditPanelVisibility\(show,[\s\S]*?if \(show\)[\s\S]*?syncEditPanelState\(\);[\s\S]*?renderSelectedFeatureInspector\(\);[\s\S]*?editFloatingPanel\.hidden = true;[\s\S]*?syncEditPanelState\(\);[\s\S]*?renderSelectedFeatureInspector\(\);/,
  "Opening and closing the edit context must synchronize the compact selection inspector.",
);

assert.match(
  legacyHtml,
  /function openFeaturePropertiesByRow\(rowIndex, returnFocus = document\.activeElement\)\s*\{[\s\S]*?previewAnnotationByRow\(rowIndex, \{ preserveSelectionView: true \}\);[\s\S]*?renderFeatureDrawer\(\{ forceOpen: true, focusOnOpen: true, returnFocus, returnAction: "properties" \}\);/,
  "Properties must explicitly open Feature Details after selecting the requested feature.",
);

assert.match(
  legacyHtml,
  /if \(action === "properties" && Number\.isInteger\(rowIndex\)\) \{\s*openFeaturePropertiesByRow\(rowIndex, button\);/,
  "The compact mobile Properties action must use the explicit Feature Details path.",
);

assert.match(
  legacyHtml,
  /if \(action === "edit" && Number\.isInteger\(rowIndex\)\) \{\s*openFeatureEditorByRow\(rowIndex, button\);/,
  "The compact mobile Edit action must open the selected feature editor.",
);

assert.match(
  legacyHtml,
  /function openFeatureEditorByRow\(rowIndex, returnFocus = document\.activeElement\)\s*\{[\s\S]*?const layerId = activeSurveyAnnotation\?\.surveyPoint\?\.layerId \|\| activeLayerId;[\s\S]*?previewAnnotationByRow\(rowIndex, \{ preserveSelectionView: true \}\);[\s\S]*?setEditSessionActive\(true, \{ layerId \}\);[\s\S]*?if \(!editSessionActive\) return;[\s\S]*?renderFeatureDrawer\(\{ forceOpen: true, focusOnOpen: true, returnFocus, returnAction: "edit" \}\);/,
  "Editing a selected feature must preserve its layer, start the existing edit session, and explicitly open Feature Details.",
);

assert.match(
  legacyHtml,
  /async function deleteActivePoint\(\)[\s\S]*?if \(!deleted\) return;[\s\S]*?hideSurveyCallout\(\);[\s\S]*?clearTableSelection\(\{ update: false \}\);[\s\S]*?updateSurveyTable\(\);/,
  "Deleting a feature must clear its selection before the shortened table is rendered.",
);

assert.match(
  legacyHtml,
  /function renderFeatureDrawer\(\{ newFeature = false, forceOpen = false,[^}]+\} = \{\}\)[\s\S]*?&& !newFeature[\s\S]*?&& !forceOpen[\s\S]*?&& !featureDrawer\.classList\.contains\("open"\)/,
  "Ordinary mobile selection must stay compact while an explicit Properties request can open Feature Details.",
);

assert.match(
  legacyHtml,
  /<div class="survey-table-primary-actions" role="group" aria-label="Table actions">[\s\S]*?id="surveyFieldsBtn"[\s\S]*?id="tableEditBtn"[\s\S]*?id="archiveToggleBtn"/,
  "The mobile attribute table must group its primary actions.",
);

assert.match(
  legacyHtml,
  /<div class="survey-selection-actions" role="group" aria-label="Selection actions">[\s\S]*?<div class="survey-selection-filters" role="group" aria-label="Visible table rows">[\s\S]*?panel-action-label-mobile[^>]*>All<[\s\S]*?panel-action-label-mobile[^>]*>Selected<[\s\S]*?panel-action-label-mobile[^>]*>Unselected</,
  "Selection actions and row filters must be separated into readable mobile groups.",
);

assert.match(
  legacyHtml,
  /body\.survey-table-open #surveyPanelActions\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?body\.survey-table-open \.panel-action-btn\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?height:\s*44px;[\s\S]*?padding:\s*0 8px;[\s\S]*?box-shadow:\s*none;/,
  "Mobile table actions must use a true 44px touch target without additive vertical padding.",
);

assert.match(
  legacyHtml,
  /body\.survey-table-open #surveySelectionControls\[hidden\]\s*\{\s*display:\s*none;/,
  "Hidden mobile selection controls must not reserve table-header space.",
);

assert.match(
  legacyHtml,
  /function setSelectionFilterButtonState\(button,[\s\S]*?button\.dataset\.selectionLabel = enabledLabel;[\s\S]*?button\.setAttribute\("aria-label", enabledLabel\);/,
  "Short mobile filter labels must preserve stable accessible command names.",
);

console.log("Mobile selection inspector layout checks passed.");
