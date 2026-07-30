import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /function setActiveProject\(project, \{[\s\S]*?preserveSelection = false[\s\S]*?const retainedSelection = preserveSelection[\s\S]*?selectedTableRows = retainedSelection;[\s\S]*?lastSelectedTableRow = retainedSelection\.size \? Math\.max\(\.\.\.retainedSelection\) : null;/,
  "Project refreshes should preserve an explicitly requested feature selection."
);

assert.match(
  source,
  /activeFeatureId = null;[\s\S]*?activeSurveyAnnotation = null;[\s\S]*?closeFeatureDrawer\(\);/,
  "Project refreshes should close details for annotations that are about to be rebuilt."
);

assert.match(
  source,
  /function commitLayerFeatureChanges\(layer, message = "Layer updated\."\)[\s\S]*?setActiveProject\(activeProjectRecord, \{[\s\S]*?preserveRegion: true,[\s\S]*?preserveSelection: true[\s\S]*?\}\);/,
  "Layer mutations should keep their post-operation feature selection while rebuilding the map."
);

assert.match(
  source,
  /function duplicateSelectedFeatures\(\)[\s\S]*?layer\.features\.push\(clone\);[\s\S]*?selectedTableRows = new Set\(layer\.features\.map\(\(_, index\) => index\)\.slice\(-indexes\.length\)\);[\s\S]*?commitLayerFeatureChanges\(layer, `Duplicated/,
  "Duplication should select the newly created features before committing the layer refresh."
);

console.log("Feature duplication journey checks passed.");
