import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

for (const id of ["showSelectedRowsBtn", "showUnselectedRowsBtn", "showAllRowsBtn"]) {
  assert.match(
    source,
    new RegExp(`id="${id}"[^>]*aria-pressed="(?:true|false)"`),
    `${id} should expose its toggle state to assistive technology.`
  );
}

assert.match(
  source,
  /function setSelectionFilterButtonState\(button, \{ active, disabled, disabledReason \}\)[\s\S]*?button\.dataset\.selectionLabel = enabledLabel;[\s\S]*?button\.setAttribute\("aria-pressed", String\(active\)\);[\s\S]*?button\.disabled = disabled;[\s\S]*?button\.setAttribute\("aria-label", `\$\{enabledLabel\}\. \$\{disabledReason\}`\)[\s\S]*?button\.setAttribute\("aria-label", enabledLabel\)/,
  "Selection filters should synchronize visual, pressed, disabled, and explained states while preserving stable command names."
);
assert.match(
  source,
  /function normalizeTableRowFilterMode\(rowCount, selectedCount\)[\s\S]*?tableRowFilterMode === "selected" && selectedCount === 0[\s\S]*?tableRowFilterMode === "unselected" && selectedCount === rowCount[\s\S]*?tableRowFilterMode = "all"/,
  "An invalid selected or unselected filter should recover to the all-rows view."
);
assert.match(
  source,
  /setSelectionFilterButtonState\(showSelectedRowsBtn,[\s\S]*?disabled: count === 0,[\s\S]*?Select one or more features before showing selected rows\./,
  "Show selected should be unavailable with a concrete recovery explanation at zero selection."
);
assert.match(
  source,
  /setSelectionFilterButtonState\(showUnselectedRowsBtn,[\s\S]*?disabled: rowCount === 0 \|\| count === rowCount,[\s\S]*?All features are selected; clear at least one selection first\./,
  "Show unselected should be unavailable when it would create an empty result."
);
assert.match(
  source,
  /setSelectionFilterButtonState\(showAllRowsBtn,[\s\S]*?disabled: rowCount === 0 \|\| tableRowFilterMode === "all"[\s\S]*?All rows are already shown\./,
  "Show all should communicate when the requested view is already active."
);
assert.match(
  source,
  /selectedTableRows = new Set\([\s\S]*?normalizeTableRowFilterMode\(\(dataset\.records \|\| \[\]\)\.length, selectedTableRows\.size\);[\s\S]*?const filteredRecords =/,
  "Filter recovery should run before rows are filtered, preventing a transient empty table."
);

console.log("Table selection filter state checks passed.");
