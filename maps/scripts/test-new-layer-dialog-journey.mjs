import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");
const journey = source.match(
  /function addLayerToActiveProject\([^)]*\) \{([\s\S]*?)\n        \}\n\n        function editLayerSchema/
)?.[1] || "";

assert.ok(journey, "The New Layer journey should remain available.");
assert.match(
  journey,
  /title: "New Layer",[\s\S]*?description: "Add a point, line, or polygon layer to the current project\."/,
  "The dialog should explain the geometry-creation task."
);
assert.match(
  journey,
  /id="layerModalName"[^>]*aria-label="Layer name"[^>]*aria-describedby="layerModalNameHelp layerModalValidation"[^>]*aria-required="true"[^>]*required/,
  "The required layer name should have a stable accessible name and associated help and validation."
);
assert.match(
  journey,
  /id="layerModalGeometry"[^>]*aria-label="Layer geometry"[^>]*aria-describedby="layerModalGeometryHelp"/,
  "The geometry selector should have a stable accessible name and associated help."
);
assert.match(
  journey,
  /id="layerModalValidation"[^>]*role="status"[^>]*>Enter a layer name to continue\./,
  "The blocking prerequisite should be announced as status."
);
assert.match(
  journey,
  /createButton\.disabled = !valid;[\s\S]*?validation\.hidden = valid;[\s\S]*?setAttribute\("aria-invalid", valid \? "false" : "true"\)/,
  "Visible, disabled, and accessibility validation states should stay synchronized."
);
assert.match(
  journey,
  /addEventListener\("keydown", \(event\) => \{[\s\S]*?event\.key !== "Enter"[\s\S]*?event\.isComposing[\s\S]*?createButton\?\.disabled[\s\S]*?event\.preventDefault\(\);[\s\S]*?createButton\.click\(\);/,
  "Enter should create a valid layer without interfering with IME input or bypassing validation."
);
assert.match(
  source,
  /function closeLayerActionModal\(\)[\s\S]*?const returnFocusTarget = layerActionModalState\?\.returnFocusTo;[\s\S]*?returnFocusTarget\.focus\(\);/,
  "Closing the shared dialog should restore focus to the command that opened it."
);
assert.match(
  source,
  /function trapLayerActionModalFocus\(event\)[\s\S]*?event\.key !== "Tab"[\s\S]*?event\.shiftKey[\s\S]*?last\.focus\(\);/,
  "The New Layer dialog should retain the shared keyboard focus trap."
);
assert.match(
  source,
  /const initialFocus = layerActionModal\.querySelector\("\[autofocus\]"\)[\s\S]*?\|\| layerActionModal\.querySelector\("input, select, textarea, button"\);[\s\S]*?initialFocus\?\.focus\(\);/,
  "Explicit autofocus should win over an earlier close button in shared layer dialogs."
);
assert.doesNotMatch(
  source,
  /querySelector\("\[autofocus\], input, select, textarea, button"\)/,
  "A combined selector would incorrectly use DOM order instead of prioritizing autofocus."
);

console.log("New Layer dialog journey checks passed.");
