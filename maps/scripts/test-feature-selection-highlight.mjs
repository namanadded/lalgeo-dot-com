import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

assert.match(
  legacyHtml,
  /function\s+updateSurveyOverlayVisualState\s*\(\s*overlay\s*\)[\s\S]*?featureId\s*===\s*activeFeatureId[\s\S]*?geometryType\s*===\s*"line"[\s\S]*?lineWidth:\s*isSelected\s*\?\s*9\s*:\s*4[\s\S]*?geometryType\s*===\s*"polygon"[\s\S]*?lineWidth:\s*isSelected\s*\?\s*8\s*:\s*4/,
  "Line and polygon overlays should receive a stronger selected style."
);

assert.match(
  legacyHtml,
  /function\s+refreshAnnotationStyles\s*\(\s*\)[\s\S]*?surveyAnnotations\.forEach\(updateAnnotationVisualState\);[\s\S]*?surveyOverlays\.forEach\(updateSurveyOverlayVisualState\);/,
  "The shared selection refresh should update both point annotations and geometry overlays."
);

assert.match(
  legacyHtml,
  /surveyOverlays\.push\(overlay\);[\s\S]*?map\.addOverlay\(overlay\);[\s\S]*?updateSurveyOverlayVisualState\(overlay\);/,
  "New overlays should immediately receive the correct selected or default style."
);

console.log("Feature selection highlight checks passed.");
