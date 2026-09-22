import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /<section id="editFloatingPanel"[^>]*role="region"[^>]*aria-labelledby="editPanelTitle"[^>]*aria-describedby="editPanelHelp"/,
  "The edit journey should be exposed as a named, described region."
);
assert.match(
  source,
  /id="editPanelStatus"[^>]*role="status"[^>]*aria-live="polite"/,
  "Editing state changes should be announced without interrupting the user."
);
assert.match(
  source,
  /id="editPanelAddFeatureBtn"[\s\S]*?class="edit-tool-label">Add feature<\/span>[\s\S]*?id="editPanelEditExistingBtn"[\s\S]*?class="edit-tool-label">Attributes<\/span>[\s\S]*?id="editPanelGeometryBtn"[\s\S]*?class="edit-tool-label">Geometry<\/span>/,
  "Primary editing actions should have visible plain-language labels."
);
assert.match(
  source,
  /editPanelSessionBtn\.innerHTML = `[\s\S]*?class="edit-tool-label">\$\{editSessionActive \? "Stop" : "Start"\}<\/span>`/,
  "The session control should keep its visible label synchronized."
);
assert.match(
  source,
  /editPanelAddFeatureBtn\.innerHTML = `[\s\S]*?class="edit-tool-label">\$\{canFinishGeometry \? "Finish" : isAddingSurveyPoint \? "Add vertex" : "Add feature"\}<\/span>`/,
  "The drawing action should explain whether it adds, continues, or finishes geometry."
);
assert.match(
  source,
  /\.edit-panel-helper\s*\{[\s\S]*?display:\s*block;[\s\S]*?line-height:\s*1\.45;/,
  "Contextual editing guidance should remain visibly readable."
);
assert.match(
  source,
  /@media \(max-width: 700px\)[\s\S]*?#editFloatingPanel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*max\(8px, env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?max-height:\s*min\(62dvh, 540px\);/,
  "The phone editing surface should be a safe-area-aware, bounded sheet."
);
assert.match(
  source,
  /\.edit-panel-icon-btn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?\.edit-tool-btn\s*\{[\s\S]*?min-height:\s*48px;/,
  "Close and editing controls should meet comfortable touch-target sizes."
);
assert.match(
  source,
  /editPanelCloseBtn\?\.addEventListener\("click",[\s\S]*?setEditSessionActive\(false\);[\s\S]*?editPanelToggleBtn\?\.offsetParent \? editPanelToggleBtn : leftToolbarExpandBtn[\s\S]*?if \(editSessionActive\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?setEditSessionActive\(false\);[\s\S]*?editPanelToggleBtn\?\.offsetParent \? editPanelToggleBtn : leftToolbarExpandBtn/,
  "Close and Escape should stop editing and restore focus to the drawing trigger."
);

console.log("Editing journey checks passed.");
