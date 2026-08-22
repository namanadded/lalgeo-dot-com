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
  /const isEmpty = value === "" \|\| value === null \|\| value === undefined;[\s\S]*?const displayValue = formatAttributeValueForDisplay\(field, value\);[\s\S]*?class="feature-drawer-value-row"[\s\S]*?\$\{isEmpty \? "Not set" : escapeHtml\(displayValue\.text\)\}/,
  "Read-only attributes should expose explicit empty values."
);
assert.match(
  source,
  /<dt class="feature-drawer-value-label">[\s\S]*?<dd class="feature-drawer-value-cell[\s\S]*?<dl class="feature-drawer-value-list" aria-label="Feature attributes">\$\{attributeSummary\}<\/dl>/,
  "Read-only attributes should use a named semantic description list."
);
assert.match(
  source,
  /const fieldControlId = `feature-drawer-field-\$\{rowIndex\}-\$\{fieldIndex\}`[\s\S]*?<label for="\$\{fieldControlId\}">[\s\S]*?(?:input|select|textarea) id="\$\{fieldControlId\}"/,
  "Editable controls should have programmatically associated labels."
);
assert.match(
  source,
  /id="featureDrawerEdit"[^>]*>Edit feature<\/button>[\s\S]*?setEditSessionActive\(true, \{ layerId: layer\.id \}\)[\s\S]*?\[data-feature-field\]:not\(\[readonly\]\):not\(:disabled\)[\s\S]*?\.focus\(\)/,
  "The direct edit action should target the selected feature's layer and focus the first editable field."
);
assert.match(
  source,
  /const actionButton = !isEmpty && fieldKey === "phone"[\s\S]*?data-feature-action="phone"[\s\S]*?fieldKey === "website"[\s\S]*?data-feature-action="website"[\s\S]*?\$\{actionButton\}/,
  "Read-only phone and website values should retain their direct actions."
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
