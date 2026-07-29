import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /id="mapInteractionHelp"[^>]*>Press A to start adding a feature\. Press Escape to cancel drawing or close panels\.<\/div>/,
  "keyboard help should describe cancellation for point, line, and polygon drawing."
);

assert.match(
  source,
  /function cancelActiveFeaturePlacement\(\) \{[\s\S]*?const geometryType = getActiveLayerGeometryType\(\);[\s\S]*?const wasTracing = geometryTraceMode;[\s\S]*?exitAddSurveyPointMode\(\);[\s\S]*?hideWorkspaceHint\(\);[\s\S]*?Point placement[\s\S]*?Line[\s\S]*?Polygon[\s\S]*?cancelled\./,
  "feature cancellation should clear drawing state and the persistent workspace tip before announcing geometry-specific recovery."
);

assert.match(
  source,
  /editPanelCancelGeometryBtn\?\.addEventListener\("click",[\s\S]*?if \(isAddingSurveyPoint\) cancelActiveFeaturePlacement\(\);/,
  "the visible Cancel drawing control should use the complete cancellation recovery path."
);

assert.match(
  source,
  /if \(isAddingSurveyPoint\) \{[\s\S]*?cancelActiveFeaturePlacement\(\);\s*return;\s*\}/,
  "Escape should use the same complete cancellation recovery path."
);

assert.doesNotMatch(
  source,
  /setProjectStatus\("Point placement cancelled\.", "success"\)/,
  "the keyboard path should not mislabel line or polygon cancellation as point placement."
);

console.log("Geometry cancellation recovery checks passed.");
