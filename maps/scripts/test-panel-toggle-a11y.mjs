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
const projectsCloseButton = getTagById("importPanelClose");

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
expectAttribute(
  projectsCloseButton,
  "aria-label",
  "Close projects panel",
  "The Projects sheet close button must have a concise accessible label.",
);

if (!/<details class="workspace-panel-section ios-disclosure">\s*<summary>Share &amp; Export<\/summary>/.test(html)) {
  failures.push("Share and export controls should use progressive disclosure in the Projects sheet.");
}

if (!/<details class="workspace-panel-section ios-disclosure ios-dropbox-disclosure">\s*<summary>Dropbox<\/summary>/.test(html)) {
  failures.push("Dropbox controls should be collapsed into one disclosure group by default.");
}

if (!/@media \(max-width: 600px\)[\s\S]*?#importPanel \.import-panel-container[\s\S]*?height: 100dvh;[\s\S]*?#importPanel \.workspace-primary-btn[\s\S]*?background: #007aff;/.test(html)) {
  failures.push("The mobile Projects sheet should use the full-height iOS layout and system-blue primary action.");
}

if (!/@media \(min-width: 601px\)[\s\S]*?#importPanel[\s\S]*?align-items: center;[\s\S]*?#importPanel \.import-panel-container[\s\S]*?border-radius: 22px;[\s\S]*?background: #f2f2f7;/.test(html)) {
  failures.push("The web Projects sheet should use a centered macOS-style presentation.");
}

if (!/@media \(min-width: 900px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(html)) {
  failures.push("The wide web Projects sheet should organize secondary tasks into two columns.");
}

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
