import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

assert.match(
  legacyHtml,
  /<div id="surveyTableWrapper" hidden>\s*<div id="surveyTable"><\/div>\s*<\/div>\s*<\/div>\s*<div id="selectedFeatureInspector"><\/div>\s*<div id="fieldCalculatorBackdrop"/,
  "The mobile selection inspector must sit outside the transformed table panel.",
);

assert.match(
  legacyHtml,
  /#selectedFeatureInspector\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*calc\(var\(--mobile-toolbar-bottom\) \+ var\(--mobile-toolbar-height\) \+ 8px\);/,
  "The mobile selection inspector must reserve the toolbar height and safe-area clearance.",
);

assert.match(
  legacyHtml,
  /body\.mobile-survey-table-open #toolbar #quickActionBar\s*\{\s*display:\s*none !important;/,
  "The persistent mobile toolbar must not cover an expanded attribute table.",
);

assert.match(
  legacyHtml,
  /function setSurveyTableToggleState\(isOpen\)\s*\{[\s\S]*?classList\.toggle\("mobile-survey-table-open", Boolean\(isOpen\)\)[\s\S]*?setToolbarMoreVisibility\(false\)[\s\S]*?setMobileSelectPopoverVisibility\(false\)[\s\S]*?setAddActionPopoverVisibility\(false\)/,
  "Opening the mobile table must synchronize toolbar visibility and dismiss its popovers.",
);

console.log("Mobile selection inspector layout checks passed.");
