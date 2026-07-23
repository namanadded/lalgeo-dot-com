import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("public/legacy/lalgeosurvey.html");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  ["closed Data Manager is absent from the accessibility tree and tab order on first paint", /id="dataCatalogPane"[^>]*aria-hidden="true"[^>]*inert/],
  ["closed Feature Details is absent from the accessibility tree and tab order on first paint", /id="featureDrawer"[^>]*aria-hidden="true"[^>]*inert/],
  ["off-canvas state synchronizes inert and aria-hidden", /function setOffCanvasAccessibility\(element, visible, returnFocus = null\)[\s\S]*?toggleAttribute\("inert", !visible\)[\s\S]*?setAttribute\("aria-hidden", visible \? "false" : "true"\)/],
  ["closing a focused panel restores focus before making it inert", /if \(!visible && element\.contains\(document\.activeElement\)\)[\s\S]*?focusTarget\?\.focus\?\.\(\);[\s\S]*?toggleAttribute\("inert", !visible\)/],
  ["Feature Details has a durable map focus return target", /id="map"[^>]*tabindex="0"[^>]*aria-label="Map canvas"/],
  ["Data Manager visibility updates its accessible state", /function setDataPaneVisibility\(show\)[\s\S]*?setOffCanvasAccessibility\(dataCatalogPane, dataPaneVisible, openDataManagerBtn\)/],
  ["Feature Details becomes accessible only while open", /featureDrawer\.classList\.add\("open"\);\s*setOffCanvasAccessibility\(featureDrawer, true\)/],
  ["Feature Details close path removes it from keyboard navigation", /function closeFeatureDrawer[\s\S]*?featureDrawer\.classList\.remove\("open"\);\s*setOffCanvasAccessibility\(featureDrawer, false, mapElement\)/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL: ${label}`));
  process.exit(1);
}

checks.forEach(([label]) => console.log(`PASS: ${label}`));
