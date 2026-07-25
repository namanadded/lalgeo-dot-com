import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /const fieldControlId = `feature-drawer-field-\$\{rowIndex\}-\$\{fieldIndex\}`/,
  "Feature Details should create a stable, unique control ID for every rendered attribute.",
);

for (const control of ["select", "textarea", "input"]) {
  assert.match(
    source,
    new RegExp(`<label for="\\$\\{fieldControlId\\}">[\\s\\S]*?<${control}[^>]*id="\\$\\{fieldControlId\\}"`),
    `Feature Details ${control} controls should be associated with their visible labels.`,
  );
}

assert.match(
  source,
  /const controlLabel = `\$\{header \|\| "Attribute"\}, feature \$\{rowIndex \+ 1\}`/,
  "Inline table editor names should include both the attribute and feature row.",
);
assert.match(
  source,
  /const attrs = `[^`]*aria-label="\$\{escapeHtml\(controlLabel\)\}"/,
  "Every inline table input and select should receive the contextual accessible name.",
);

console.log("Feature editor accessible-name checks passed.");
