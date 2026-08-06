import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("public/legacy/lalgeosurvey.html");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  ["line and polygon overlays respect layer selectability", /new mapkit\.(?:Polyline|Polygon)Overlay[\s\S]*?enabled:\s*isLayerSelectable\(layer\)/],
  ["overlays retain their feature selection target", /data:\s*\{\s*surveyFeatureAnnotation\s*\}/],
  ["overlay selection opens the shared feature drawer", /event\?\.overlay\?\.data\?\.surveyFeatureAnnotation[\s\S]*?showSurveyCallout\(surveyFeatureAnnotation\)/],
  ["closing details clears the selected overlay", /map\?\.selectedOverlay\?\.data\?\.surveyFeatureAnnotation[\s\S]*?map\.selectedOverlay\s*=\s*null/],
  ["mobile drawer is anchored as a bottom sheet", /#featureDrawer\s*\{[\s\S]*?top:\s*auto\s*!important;[\s\S]*?bottom:\s*max\(10px,[\s\S]*?height:\s*min\(50dvh,\s*460px\)/],
  ["mobile drawer scrolls its body independently", /\.feature-drawer-body\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow-y:\s*auto/],
  ["feature drawer exposes a persistent close control", /id="featureDrawerClose"[\s\S]*?aria-label="Close feature details"/],
  ["opening mobile feature details collapses the table", /collapseSurveyTableForMobileFeatureDetails\(\);[\s\S]*?featureDrawer\.classList\.add\("open"\);[\s\S]*?function collapseSurveyTableForMobileFeatureDetails\(\)[\s\S]*?matchMedia\("\(max-width: 600px\)"\)[\s\S]*?surveyTablePanel\.classList\.remove\("open"\);[\s\S]*?surveyTableWrapper\.hidden = true;[\s\S]*?updateFloatingButtonLayer\(false\);/],
  ["mobile selection actions stay hidden while feature details are open", /function renderSelectedFeatureInspector\(\)[\s\S]*?featureDrawer\?\.classList\.contains\("open"\)[\s\S]*?selectedFeatureInspector\.classList\.remove\("visible"\);[\s\S]*?selectedFeatureInspector\.innerHTML = "";/],
  ["mobile selected-feature context stays hidden while details are open", /const showSelection = !isAddingSurveyPoint[\s\S]*?selectedCount > 0[\s\S]*?!featureDrawer\?\.classList\.contains\("open"\);/],
  ["existing mobile selections do not automatically open feature details", /function renderFeatureDrawer\(\{ newFeature = false, forceOpen = false \} = \{\}\)[\s\S]*?matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?!newFeature[\s\S]*?!forceOpen[\s\S]*?!featureDrawer\.classList\.contains\("open"\)[\s\S]*?closeFeatureDrawer\(\);[\s\S]*?return;/],
  ["the Properties action can explicitly open existing feature details", /function openFeaturePropertiesByRow\(rowIndex\)[\s\S]*?previewAnnotationByRow\(rowIndex, \{ preserveSelectionView: true \}\);[\s\S]*?renderFeatureDrawer\(\{ forceOpen: true \}\);/],
  ["the Edit action opens editable feature details for the selected layer", /function openFeatureEditorByRow\(rowIndex\)[\s\S]*?const layerId = activeSurveyAnnotation\?\.surveyPoint\?\.layerId \|\| activeLayerId;[\s\S]*?setEditSessionActive\(true, \{ layerId \}\);[\s\S]*?if \(!editSessionActive\) return;[\s\S]*?renderFeatureDrawer\(\{ forceOpen: true \}\);/],
  ["editable feature details expose the existing delete action", /editable \? `<button id="featureDrawerDelete"[\s\S]*?aria-label="Delete feature"[\s\S]*?featureDrawerBody\.querySelector\("#featureDrawerDelete"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*?deleteActivePoint\(\);/],
  ["deleting a feature clears selection instead of selecting the shifted next row", /async function deleteActivePoint\(\)[\s\S]*?if \(!deleted\) return;[\s\S]*?hideSurveyCallout\(\);[\s\S]*?clearTableSelection\(\{ update: false \}\);[\s\S]*?updateSurveyTable\(\);/],
  ["newly created features explicitly request mobile feature details", /showSurveyCallout\(annotation, \{ forceEdit: true, newFeature: true \}\)/],
  ["opening feature details immediately synchronizes selection actions", /collapseSurveyTableForMobileFeatureDetails\(\);[\s\S]*?featureDrawer\.classList\.add\("open"\);[\s\S]*?setOffCanvasAccessibility\(featureDrawer, true\);[\s\S]*?renderSelectedFeatureInspector\(\);/],
  ["opening mobile feature details immediately dismisses the edit selection surface", /featureDrawer\.classList\.add\("open"\);[\s\S]*?matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?!editFloatingPanel\?\.hidden[\s\S]*?editFloatingPanel\.hidden = true;[\s\S]*?setEditPanelVisibility\(false\);/],
  ["closing feature details restores selection actions when selection remains", /function closeFeatureDrawer\(\{ clearSelection = false \} = \{\}\)[\s\S]*?featureDrawer\.classList\.remove\("open"\);[\s\S]*?renderSelectedFeatureInspector\(\);/],
  ["selection actions participate in the open table layout", /body\.survey-table-open #selectedFeatureInspector\s*\{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?body\.survey-table-open #surveyTableWrapper\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1 1 auto;/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL: ${label}`));
  process.exit(1);
}

checks.forEach(([label]) => console.log(`PASS: ${label}`));
