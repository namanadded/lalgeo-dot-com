import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /function announceFeaturePlacementComplete\(geometryType, \{ featureDetailsOpened = false \} = \{\}\)[\s\S]*?normalizeLayerGeometryType[\s\S]*?Point[\s\S]*?Line[\s\S]*?Polygon[\s\S]*?Feature details opened\.[\s\S]*?setProjectStatus/,
  "completed geometry placement should replace active drawing status with a geometry-specific success announcement.",
);

assert.match(
  source,
  /function finalizeGeometryFeaturePlacement\(\)[\s\S]*?exitAddSurveyPointMode\(\)[\s\S]*?announceFeaturePlacementComplete\(geometryType, \{ featureDetailsOpened: Boolean\(annotation\) \}\)/,
  "line and polygon completion should announce the settled post-drawing state after exiting drawing mode.",
);

assert.match(
  source,
  /async function handleNewSurveyPointPlacement\(coordinate, options = \{\}\)[\s\S]*?exitAddSurveyPointMode\(\)[\s\S]*?if \(!dropboxMode\) \{\s*announceFeaturePlacementComplete\("point", \{ featureDetailsOpened: true \}\);\s*\}/,
  "browser-only point completion should replace the stale placement-active status after details open.",
);

assert.match(
  source,
  /if \(dropboxMode\)[\s\S]*?setProjectStatus\("Point saved to Dropbox\.", "success"\)[\s\S]*?if \(!dropboxMode\) \{\s*announceFeaturePlacementComplete/,
  "Dropbox completion should retain its authoritative save result instead of being overwritten by the local completion announcement.",
);

console.log("Geometry completion status recovery checks passed.");
