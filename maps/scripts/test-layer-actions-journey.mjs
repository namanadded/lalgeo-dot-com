import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /id="layerContextMenu" role="dialog" aria-modal="false" aria-labelledby="layerContextTitle" aria-describedby="layerContextDescription" tabindex="-1"/,
  "Layer actions should open as a named, described dialog."
);
assert.match(
  source,
  /id="layerContextTitle">Layer actions[\s\S]*?id="layerContextDescription">Choose what to do with this layer\.[\s\S]*?aria-label="Close layer actions"/,
  "The layer action surface should explain its purpose and provide a familiar close control."
);
assert.match(
  source,
  /data-group="primary"[\s\S]*?>Open table<[\s\S]*?>Edit features<[\s\S]*?>Zoom to layer<[\s\S]*?data-group="manage"/,
  "Common layer tasks should be grouped first with plain-language labels."
);
assert.match(
  source,
  /id="layerContextOrder" class="layer-context-order"[\s\S]*?<summary>Drawing order<\/summary>[\s\S]*?>Move up<[\s\S]*?>Move to bottom</,
  "Advanced drawing-order commands should use progressive disclosure."
);
assert.match(
  source,
  /data-group="danger"[\s\S]*?class="context-menu-btn danger" data-layer-context-action="remove">Remove layer…</,
  "The destructive layer action should be visually and semantically separated."
);
assert.match(
  source,
  /data-layer-actions="[\s\S]*?aria-haspopup="dialog" aria-controls="layerContextMenu" aria-expanded="false"/,
  "Layer action triggers should expose their dialog relationship and expanded state."
);
assert.match(
  source,
  /function hideLayerContextMenu\(\{ restoreFocus = false \} = \{\}\)[\s\S]*?setAttribute\("aria-expanded", "false"\)[\s\S]*?if \(restoreFocus[\s\S]*?trigger\.focus\(\)/,
  "Closing layer actions should synchronize state and optionally restore trigger focus."
);
assert.match(
  source,
  /layerContextBackdrop\?\.addEventListener\("click", \(\) => hideLayerContextMenu\(\{ restoreFocus: true \}\)\)[\s\S]*?layerContextCloseBtn\?\.addEventListener/,
  "Backdrop and close control should dismiss the mobile sheet and restore focus."
);
assert.match(
  source,
  /layerContextMenu\?\.addEventListener\("keydown",[\s\S]*?event\.key !== "Tab"[\s\S]*?event\.shiftKey[\s\S]*?last\.focus\(\)[\s\S]*?first\.focus\(\)/,
  "Keyboard focus should remain inside the modal layer sheet on phones."
);
assert.match(
  source,
  /@media \(max-width: 820px\)[\s\S]*?#layerContextMenu \{[\s\S]*?inset: auto 0 0 !important;[\s\S]*?max-height: min\(82dvh, 680px\)[\s\S]*?env\(safe-area-inset-bottom\)[\s\S]*?\.layer-context-close \{[\s\S]*?width: 44px;[\s\S]*?\.context-menu-btn,[\s\S]*?min-height: 48px;/,
  "Phone and tablet layer actions should be an in-bounds, safe-area-aware bottom sheet with generous targets."
);

console.log("Layer actions journey checks passed.");
