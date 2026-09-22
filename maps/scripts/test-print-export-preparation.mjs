import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /function openPrintPreparation\(mode = "print"\)[\s\S]*?title: exporting \? "Export map as PDF" : "Print map"/, "Print and PDF export should use a purpose-specific preparation dialog.");
assert.match(source, /Review the map, then choose Save as PDF[\s\S]*?Continue to PDF[\s\S]*?Continue to print/, "The preparation journey should explain the PDF destination and expose distinct continuation actions.");
assert.match(source, /if \(mapPrintTitle\) mapPrintTitle\.textContent = projectName;[\s\S]*?mapPrintMeta\.textContent = `[\s\S]*?new Date\(\)\.toLocaleString\(\)/, "Prepared output should include current project metadata and a generated timestamp.");
assert.match(source, /function getLayerFeatureCount\(layer\)[\s\S]*?layer\?\.features\?\.length[\s\S]*?layer\?\.parsed\?\.records\?\.length[\s\S]*?layer\?\.parsed\?\.rows\?\.length[\s\S]*?Math\.max\(\.\.\.counts\)/, "Output preparation should count live, parsed-record, and legacy-row layer representations without double counting.");
assert.match(source, /const featureCount = \(activeProjectRecord\.layers \|\| \[\]\)\.reduce\(\(total, layer\) => total \+ getLayerFeatureCount\(layer\), 0\)/, "Output preparation should use the shared layer feature counter.");
assert.match(source, /menuExportPdfBtn\?\.addEventListener\("click", \(\) => openPrintPreparation\("pdf"\)\)/, "Export Map should open PDF preparation instead of printing immediately.");
assert.match(source, /printButton\?\.addEventListener\("click", \(\) => openPrintPreparation\("print"\)\)/, "Print should open print preparation instead of printing immediately.");
assert.doesNotMatch(source, /menuExportPdfBtn\?\.addEventListener\("click", \(\) => window\.print\(\)\)/, "Export Map must not bypass preparation.");
assert.match(source, /@media print[\s\S]*?body > \*:not\(#map\):not\(#mapPrintHeader\)[\s\S]*?#mapPrintHeader[\s\S]*?#map \{[\s\S]*?position: fixed !important;/, "Print CSS should isolate the titled map and exclude application chrome.");
assert.match(source, /let mobileMenuInvocationSource = null;[\s\S]*?returnFocusTo: mobileMenuInvocationSource \|\| document\.activeElement/, "The preparation dialog should restore focus to the real mobile proxy or desktop command that invoked it.");
assert.match(source, /mobileMenuInvocationSource = button;[\s\S]*?try \{[\s\S]*?target\.click\(\);[\s\S]*?finally \{[\s\S]*?mobileMenuInvocationSource = null;/, "Mobile command proxying should preserve the invoking control only for the synchronous delegated action.");

console.log("Print and PDF preparation checks passed.");
