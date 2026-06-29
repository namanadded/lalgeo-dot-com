import { readFileSync } from "node:fs";
import path from "node:path";

const htmlPath = path.join(process.cwd(), "public", "legacy", "lalgeosurvey.html");
const html = readFileSync(htmlPath, "utf8");

const failures = [];

function getTagById(id) {
  return html.match(new RegExp(`<button[^>]+id="${id}"[^>]*>`))?.[0] ?? "";
}

function expectAttribute(tag, attr, value, message) {
  const pattern = new RegExp(`\\b${attr}="${value}"`);
  if (!pattern.test(tag)) failures.push(message);
}

const measureButton = getTagById("measureToolBtn");
const advancedGisButton = getTagById("advancedGisBtn");

expectAttribute(
  measureButton,
  "aria-controls",
  "measurementPanel",
  "Measure tool button must expose the measurement panel relationship.",
);
expectAttribute(
  measureButton,
  "aria-expanded",
  "false",
  "Measure tool button must default to the collapsed state.",
);
expectAttribute(
  advancedGisButton,
  "aria-controls",
  "advancedGisPanel",
  "Advanced GIS button must expose the Advanced GIS panel relationship.",
);
expectAttribute(
  advancedGisButton,
  "aria-expanded",
  "false",
  "Advanced GIS button must default to the collapsed state.",
);

if (
  !/function\s+updateMeasurementPanel\s*\(\s*\)\s*{[\s\S]*?measureToolBtn\?\.setAttribute\("aria-expanded",\s*measurementActive\s*\?\s*"true"\s*:\s*"false"\)/.test(
    html,
  )
) {
  failures.push("Measure panel state must synchronize aria-expanded.");
}

if (
  !/function\s+setAdvancedGisVisible\s*\(\s*show\s*\)\s*{[\s\S]*?advancedGisBtn\?\.setAttribute\("aria-expanded",\s*show\s*\?\s*"true"\s*:\s*"false"\)/.test(
    html,
  )
) {
  failures.push("Advanced GIS panel state must synchronize aria-expanded.");
}

if (failures.length) {
  console.error("Panel toggle accessibility checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Panel toggle accessibility checks passed.");
