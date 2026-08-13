import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "public/legacy/lalgeosurvey.html"), "utf8");

const checks = [
  [
    /let featureDrawerReturnFocus = null;[\s\S]*?let featureDrawerReturnAction = null;/,
    "Feature Details should retain both its invoking control and mobile action identity."
  ],
  [
    /function openFeaturePropertiesByRow\(rowIndex, returnFocus = document\.activeElement\)[\s\S]*?renderFeatureDrawer\(\{ forceOpen: true, focusOnOpen: true, returnFocus, returnAction: "properties" \}\)/,
    "The explicit Properties journey should request focus entry and restoration."
  ],
  [
    /function openFeatureEditorByRow\(rowIndex, returnFocus = document\.activeElement\)[\s\S]*?renderFeatureDrawer\(\{ forceOpen: true, focusOnOpen: true, returnFocus, returnAction: "edit" \}\)/,
    "The explicit Edit journey should request focus entry and restoration."
  ],
  [
    /if \(focusOnOpen\) \{[\s\S]*?window\.requestAnimationFrame[\s\S]*?const focusTarget = editable[\s\S]*?featureDrawerBody\.querySelector\("\[data-feature-field\]:not\(\[readonly\]\):not\(:disabled\)"\)[\s\S]*?: featureDrawerClose;[\s\S]*?focus\(\{ preventScroll: true \}\)/,
    "Read-only details should focus Close, while editing should focus the first editable field."
  ],
  [
    /const restoredMobileAction = featureDrawerReturnAction[\s\S]*?selectedFeatureInspector\?\.querySelector[\s\S]*?featureDrawerReturnFocus\?\.isConnected[\s\S]*?restoredMobileAction \|\| mapElement[\s\S]*?setOffCanvasAccessibility\(featureDrawer, false, returnTarget\)/,
    "Closing should restore the re-rendered mobile trigger and fall back to the map."
  ],
  [
    /if \(action === "properties"[\s\S]*?openFeaturePropertiesByRow\(rowIndex, button\)[\s\S]*?if \(action === "edit"[\s\S]*?openFeatureEditorByRow\(rowIndex, button\)/,
    "Mobile selection actions should pass their exact invoking controls into the drawer journey."
  ]
];

for (const [pattern, message] of checks) {
  if (!pattern.test(source)) throw new Error(message);
}

console.log("Feature Details focus journey checks passed.");
