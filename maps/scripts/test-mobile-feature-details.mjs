import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("public/legacy/lalgeosurvey.html");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  ["line and polygon overlays are interactive", /new mapkit\.(?:Polyline|Polygon)Overlay[\s\S]*?enabled:\s*true/],
  ["overlays retain their feature selection target", /data:\s*\{\s*surveyFeatureAnnotation\s*\}/],
  ["overlay selection opens the shared feature drawer", /event\?\.overlay\?\.data\?\.surveyFeatureAnnotation[\s\S]*?showSurveyCallout\(surveyFeatureAnnotation\)/],
  ["closing details clears the selected overlay", /map\?\.selectedOverlay\?\.data\?\.surveyFeatureAnnotation[\s\S]*?map\.selectedOverlay\s*=\s*null/],
  ["mobile drawer is anchored as a bottom sheet", /#featureDrawer\s*\{[\s\S]*?top:\s*auto\s*!important;[\s\S]*?bottom:\s*max\(10px,[\s\S]*?height:\s*min\(50dvh,\s*460px\)/],
  ["mobile drawer scrolls its body independently", /\.feature-drawer-body\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow-y:\s*auto/],
  ["feature drawer exposes a persistent close control", /id="featureDrawerClose"[\s\S]*?aria-label="Close feature details"/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL: ${label}`));
  process.exit(1);
}

checks.forEach(([label]) => console.log(`PASS: ${label}`));
