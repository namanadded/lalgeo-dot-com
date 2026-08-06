import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

const checks = [
  [html.includes('role="region" aria-labelledby="surveyTableTitle" aria-describedby="surveyTableSummary"'), "attribute table must be a named, described region"],
  [html.includes('id="surveyTableSummary" role="status" aria-live="polite"'), "feature counts must be announced politely"],
  [html.includes('id="surveyTableCloseBtn"') && html.includes('aria-label="Close attributes table"'), "mobile table must have a familiar close control"],
  [html.includes('`${filteredRecords.length} of ${total} feature'), "table summary must explain filtered and total feature counts"],
  [html.includes('data-table-empty-add') && html.includes("Add first feature"), "empty layers must offer a direct next action"],
  [html.includes('No matching features') && html.includes('Change the selection filter'), "filtered empty states must explain recovery"],
  [/transform:\s*translateY\(calc\(100% - 58px\)\)/.test(html) && /#surveyTableToggle\s*\{[\s\S]*?min-height:\s*44px;/.test(html), "collapsed table handle must stay visible and touch friendly"],
  [/body\.survey-table-open #surveyTablePanel\s*\{[\s\S]*?height:\s*min\(72dvh, 620px\);/.test(html), "phone table must use a bounded bottom sheet"],
  [/body\.survey-table-open \.survey-table-close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/.test(html), "phone close control must meet the 44px touch target"],
  [/body\.survey-table-open #surveyTableWrapper\s*\{[\s\S]*?flex:\s*1 1 auto;/.test(html), "table content must scroll within the sheet"],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("Attribute table journey regression checks passed.");
