import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");

for (const [button, reason] of [
  ["menuNewLayerBtn", "Create or open a project before adding a layer."],
  ["menuExportPdfBtn", "Create or open a project before exporting a map."],
  ["printButton", "Create or open a project before printing."],
  ["shareButton", "Create or open a project before sharing a link."],
  ["menuUndoBtn", "Make a local edit before using Undo."],
  ["menuRedoBtn", "Undo a local edit before using Redo."],
  ["menuLogoutBtn", "Connect Dropbox before disconnecting it."],
  ["menuCloseDataPaneBtn", "Open Data Manager before closing it."]
]) {
  assert.ok(source.includes(`[${button}, "${reason}"]`), `${button} should explain its prerequisite`);
}

assert.match(source, /button\.dataset\.disabledReason = reason;[\s\S]*?button\.title = reason;[\s\S]*?button\.setAttribute\("aria-label", `\$\{button\.textContent\.trim\(\)\}\. \$\{reason\}`\)/, "Desktop commands should expose one reason visually, on hover, and to assistive technology.");
assert.match(source, /const disabledReason = disabled \? target\?\.dataset\.disabledReason[\s\S]*?button\.dataset\.disabledReason = disabledReason;[\s\S]*?button\.title = disabledReason;/, "Mobile proxy commands should inherit the target explanation.");
assert.match(source, /\.menu-command\[data-disabled-reason\]::after\s*\{[\s\S]*?content:\s*attr\(data-disabled-reason\)/, "Disabled reasons should be visibly rendered rather than relying on color or hover.");
assert.match(source, /delete button\.dataset\.disabledReason;[\s\S]*?button\.removeAttribute\("title"\)/, "Explanations should clear when commands become available.");
assert.match(source, /button\.dataset\.enabledAriaLabel = button\.getAttribute\("aria-label"\)[\s\S]*?button\.setAttribute\("aria-label", button\.dataset\.enabledAriaLabel\)/, "Existing accessible names should return when commands become available.");

console.log("Disabled command explanation checks passed.");
