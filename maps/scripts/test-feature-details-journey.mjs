import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /class="feature-drawer-status" role="status">[\s\S]*?Review this feature’s attributes\./,
  "Feature details should state whether the user is reviewing or editing."
);
assert.match(
  source,
  /const displayValue = value === "" \|\| value === null \|\| value === undefined \? "Not set" : String\(value\);[\s\S]*?class="feature-drawer-value-row"/,
  "Read-only attributes should expose explicit empty values."
);
assert.match(
  source,
  /class="feature-drawer-value-list" aria-label="Feature attributes">\$\{attributeSummary/,
  "Read-only attributes should use a named compact summary."
);
assert.match(
  source,
  /const fieldId = `featureDrawerField-\$\{fieldIndex\}`[\s\S]*?<label for="\$\{fieldId\}">[\s\S]*?(?:input|select|textarea) id="\$\{fieldId\}"/,
  "Editable controls should have programmatically associated labels."
);
assert.match(
  source,
  /id="featureDrawerEdit"[^>]*>Edit feature<\/button>[\s\S]*?setEditSessionActive\(true\)[\s\S]*?\[data-feature-field\]:not\(\[readonly\]\):not\(:disabled\)[\s\S]*?\.focus\(\)/,
  "The read-only summary should offer a direct edit action and focus the first editable field."
);
assert.match(
  source,
  /Editing\. Changes save automatically\.[\s\S]*?Edits are saved to this browser workspace\./,
  "Edit mode should explain its autosave behavior in plain language."
);
assert.match(
  source,
  /\.feature-drawer-value-row\s*\{[\s\S]*?grid-template-columns:[\s\S]*?padding:\s*12px 0;[\s\S]*?border-bottom:/,
  "Attribute rows should remain scannable and touch-friendly across viewports."
);

console.log("Feature details journey checks passed.");
