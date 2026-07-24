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

assert.match(source, /function setCommandAvailabilityState\(button, enabled, disabledReason = ""\)[\s\S]*?button\.dataset\.disabledReason = reason;[\s\S]*?button\.title = reason;[\s\S]*?button\.setAttribute\("aria-label", `\$\{button\.textContent\.trim\(\)\}\. \$\{reason\}`\)/, "Commands should expose one reason visually, on hover, and to assistive technology.");
assert.match(source, /const disabledReason = disabled \? target\?\.dataset\.disabledReason[\s\S]*?setCommandAvailabilityState\(button, !disabled, disabledReason\)/, "Mobile proxy commands should inherit the target explanation through the shared state synchronizer.");
assert.match(source, /\.menu-command\[data-disabled-reason\]::after\s*\{[\s\S]*?content:\s*attr\(data-disabled-reason\)/, "Disabled reasons should be visibly rendered rather than relying on color or hover.");
assert.match(source, /if \(!\("enabledAriaLabel" in button\.dataset\)\) \{[\s\S]*?button\.dataset\.enabledAriaLabel = button\.getAttribute\("aria-label"\) \|\| "";/, "The enabled accessible name should be captured exactly once, including the absence of an explicit label.");
assert.match(source, /delete button\.dataset\.disabledReason;[\s\S]*?button\.removeAttribute\("title"\)[\s\S]*?if \(button\.dataset\.enabledAriaLabel\)[\s\S]*?button\.setAttribute\("aria-label", button\.dataset\.enabledAriaLabel\)[\s\S]*?else \{[\s\S]*?button\.removeAttribute\("aria-label"\)/, "Enabled commands should clear explanations and restore either their original explicit label or their text-derived name.");
assert.match(source, /commandState\.forEach\(\(\[button, enabled\]\)[\s\S]*?setCommandAvailabilityState\(button, enabled, reason\)/, "Desktop menu commands should use the shared state synchronizer.");

console.log("Disabled command explanation checks passed.");
