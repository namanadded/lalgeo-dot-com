import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("public/legacy/lalgeosurvey.html");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  [
    "mobile feature details block every attempt to reopen drawing tools",
    /function setEditPanelVisibility\(show,[\s\S]*?const mobileFeatureDetailsOpen = Boolean\([\s\S]*?show[\s\S]*?matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?featureDrawer\?\.classList\.contains\("open"\)[\s\S]*?if \(mobileFeatureDetailsOpen\) \{[\s\S]*?editFloatingPanel\.hidden = true;[\s\S]*?classList\.remove\("toolbar-visible", "toolbar-dismissing"\)[\s\S]*?return;/
  ],
  [
    "opening mobile feature details immediately hides the drawing sheet",
    /featureDrawer\.classList\.add\("open"\);[\s\S]*?matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?editFloatingPanel\.hidden = true;[\s\S]*?setEditPanelVisibility\(false\);/
  ],
  [
    "closing feature details restores drawing tools only after the drawer closes",
    /function closeFeatureDrawer\([\s\S]*?featureDrawer\.classList\.remove\("open"\);[\s\S]*?window\.matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?editSessionActive[\s\S]*?getActiveSelectionIndexes\(\)\.length[\s\S]*?setEditPanelVisibility\(true\);/
  ],
  [
    "feature edit focuses the first writable attribute after exclusivity is established",
    /querySelector\("#featureDrawerEdit"\)[\s\S]*?setEditSessionActive\(true,[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?querySelector\("\[data-feature-field\]:not\(\[readonly\]\):not\(\:disabled\)"\)\?\.focus\(\);/
  ]
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL: ${label}`));
  process.exit(1);
}

checks.forEach(([label]) => console.log(`PASS: ${label}`));
