import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /id="menuExportBtn"[\s\S]*?<span>Export…<\/span>/, "File menu should expose one plain-language Export entry.");
assert.match(source, /data-mobile-menu-target="menuExportBtn"[\s\S]*?<span>Export…<\/span>/, "Mobile Share & Export should open the same export journey.");
assert.match(source, /function openExportCenter\([\s\S]*?title: "Export"[\s\S]*?Choose what you want to use outside LalGeo/, "Export should open a purpose-named chooser.");
assert.match(source, /Keep working[\s\S]*?Project file[\s\S]*?Use the data[\s\S]*?Layer as GeoJSON[\s\S]*?Layer as CSV[\s\S]*?Selected features[\s\S]*?Share the view[\s\S]*?Map as PDF/, "Chooser should group project, layer, selection, and map outputs by user intent.");
assert.match(source, /data-export-choice="selected" \$\{selectedCount \? "" : "disabled"\}/, "Selected-feature export should explain and enforce its selection prerequisite.");
assert.match(source, /data-export-choice="geojson" \$\{layer \? "" : "disabled"\}[\s\S]*?data-export-choice="csv" \$\{layer \? "" : "disabled"\}/, "Layer exports should be unavailable without an active layer.");
assert.match(source, /if \(action === "project"\) downloadActiveProjectPackage\(\)[\s\S]*?if \(action === "geojson"\) exportActiveLayerGeoJson\(\)[\s\S]*?if \(action === "csv"\) exportActiveLayerCsv\(\)[\s\S]*?if \(action === "selected"\) exportSelectedGeoJson\(\)[\s\S]*?if \(action === "pdf"\) openPrintPreparation\("pdf"\)/, "Chooser must delegate to the existing proven export implementations.");
assert.match(source, /modalClass: "export-center"[\s\S]*?returnFocusTo/, "Export should use the shared focus-trapped dialog and restore its trigger.");
assert.match(source, /menuExportBtn\?\.addEventListener\("click", \(\) => openExportCenter\(mobileMenuInvocationSource \? toolbarMenuBtn : document\.activeElement\)\)/, "Mobile dismissal should return focus to the visible LalGeo menu trigger.");
assert.match(source, /@media \(max-width: 600px\)[\s\S]*?#layerActionModalBackdrop:has\(\.export-center\)[\s\S]*?align-items: flex-end[\s\S]*?safe-area-inset-bottom[\s\S]*?\.layer-modal\.export-center \.layer-modal-close[\s\S]*?44px/, "Phone export should be a safe-area-aware bottom sheet with a 44px close target.");
assert.match(source, /\.export-center-choice \{[\s\S]*?min-height: 64px[\s\S]*?\.export-center-choice:hover, \.export-center-choice:focus-visible/, "Export choices should have generous targets and visible keyboard focus.");
assert.match(source, /downloadProjectBtn\?\.addEventListener\("click", \(\) => openExportCenter\(downloadProjectBtn\)\)/, "Workspace export should use the same chooser rather than downloading without context.");

console.log("Export center journey checks passed.");
