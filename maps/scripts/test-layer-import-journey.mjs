import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /id="layerImportModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="layerImportTitle"[^>]*aria-describedby="layerImportDescription"/, "Add Layer should be exposed as a named modal dialog.");
assert.match(source, /id="layerImportTitle">Add a layer<[\s\S]*?id="layerImportCloseBtn"[^>]*aria-label="Close add layer"[\s\S]*?id="layerImportPickerBtn"[^>]*class="layer-import-choice"[\s\S]*?<strong>Choose files<\/strong>/, "The journey should lead with one plain-language file choice and a consistent close control.");
assert.match(source, /<summary>Use a public URL<\/summary>[\s\S]*?id="layerImportApiUrl"[\s\S]*?id="layerImportApiBtn"[^>]*>Add from URL<\/button>/, "URL import should remain available through progressive disclosure.");
assert.match(source, /id="layerImportStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*>No file selected\.<\/div>/, "Import feedback should begin with a neutral, politely announced state.");
assert.match(source, /\.layer-import-close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/, "The close control should meet the 44 pixel touch target.");
assert.match(source, /@media \(max-width: 600px\)[\s\S]*?\.workspace-modal-backdrop:has\(\.layer-import-sheet\)[\s\S]*?align-items:\s*flex-end;[\s\S]*?\.layer-import-sheet\s*\{[\s\S]*?max-height:\s*min\(86dvh, 720px\);[\s\S]*?env\(safe-area-inset-bottom/, "Phones should receive a safe-area-aware, scrollable bottom sheet.");
assert.match(source, /layerImportCloseBtn\?\.addEventListener\("click", \(\) => setLayerImportPanelVisibility\(false\)\)/, "The close button should dismiss the sheet.");
assert.match(source, /layerImportModal\?\.addEventListener\("click", \(event\) => \{[\s\S]*?event\.target === layerImportModal[\s\S]*?setLayerImportPanelVisibility\(false\)/, "Clicking the backdrop should dismiss the sheet.");
assert.match(source, /if \(layerImportModal && !layerImportModal\.hidden\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?setLayerImportPanelVisibility\(false\)/, "Escape should dismiss Add Layer before other workspace surfaces.");
assert.match(source, /layerImportReturnFocus = document\.activeElement[\s\S]*?layerImportPickerBtn\?\.focus\(\);[\s\S]*?const returnTarget =[\s\S]*?openDataManagerBtn, leftToolbarExpandBtn, sidebarToggleBtn[\s\S]*?returnTarget\?\.focus\(\{ preventScroll: true \}\)/, "Opening should focus the primary choice and closing should restore a visible trigger.");

console.log("Layer import journey checks passed.");
