import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

for (const [id, label] of [
  ["measurementPanel", "Measurement tools"],
  ["advancedGisPanel", "Advanced GIS tools"],
]) {
  const panel = legacyHtml.match(new RegExp(`<div\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i"))?.[0] ?? "";

  assert.ok(panel, `Expected #${id} to exist.`);
  assert.match(panel, /\brole="region"/i, `#${id} should expose its labeled tool panel as a region.`);
  assert.match(panel, new RegExp(`\\baria-label=["']${label}["']`, "i"), `#${id} should retain its accessible name.`);
}

assert.match(
  legacyHtml,
  /id="measurementPanel"[\s\S]*?class="measurement-mode-switch"[^>]*role="group"[^>]*aria-label="Measurement type"[\s\S]*?id="measurementDistanceModeBtn"[^>]*aria-pressed="true"[\s\S]*?id="measurementAreaModeBtn"[^>]*aria-pressed="false"[\s\S]*?id="measurementUnitSelect"/,
  "Measure should keep its compact mode switch and units selector together."
);
assert.match(
  legacyHtml,
  /id="measurementUndoPointBtn"[^>]*aria-label="Undo last measurement point"[\s\S]*?measurement-action-label-desktop">Undo<[\s\S]*?id="measurementFinishBtn"[^>]*aria-label="Finish measurement"[\s\S]*?measurement-action-label-desktop">Done<[\s\S]*?id="measurementClearBtn"[^>]*aria-label="Clear measurement"/,
  "Desktop measurement actions should read Undo, Done, and Clear without changing their accessible names."
);
assert.match(
  legacyHtml,
  /@media \(min-width: 601px\)[\s\S]*?#measurementPanel \{[\s\S]*?width:\s*min\(318px,[\s\S]*?#measurementPanel \.measurement-result \{[\s\S]*?min-height:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/,
  "The desktop Measure inspector should be compact and render its result without a nested card."
);
assert.match(
  legacyHtml,
  /const desktopHint = measurementFinished[\s\S]*?\? "Click to add points\. Double-click to finish\."[\s\S]*?: "Click the map to begin\."[\s\S]*?measurementHint\.hidden = !desktopHint;/,
  "Desktop measurement guidance should adapt to idle, measuring, and completed states."
);
assert.match(
  legacyHtml,
  /desktopSecondary = segmentCount[\s\S]*?\? `\$\{segmentCount\} \$\{segmentCount === 1 \? "segment" : "segments"\}`[\s\S]*?measurement-result-secondary-desktop" \$\{desktopSecondary \? "" : "hidden"\}/,
  "Desktop should hide zero-value statistics and reveal a useful segment count after measuring."
);
assert.match(
  legacyHtml,
  /measurementUndoPointBtn\.disabled = measurementFinished \|\| !pointCount;[\s\S]*?measurementFinishBtn\.disabled = measurementFinished \|\|[\s\S]*?measurementClearBtn\.disabled = !pointCount;/,
  "Measurement actions should be disabled according to the current measurement state."
);
assert.match(
  legacyHtml,
  /class="advanced-gis-desktop-content"[\s\S]*?>Selection<[\s\S]*?>Select All<[\s\S]*?>Select Visible<[\s\S]*?>Select by Attribute…<[\s\S]*?>Invert Selection<[\s\S]*?>Clear Selection<[\s\S]*?>Geometry<[\s\S]*?>Buffer…<[\s\S]*?>Merge<[\s\S]*?>Simplify…<[\s\S]*?id="advancedGisMoreBtn"[\s\S]*?>More<[\s\S]*?>Data<[\s\S]*?>Style by Attribute…<[\s\S]*?id="advancedGisExportBtn"[\s\S]*?>Export…<[\s\S]*?>Download for Offline Use…</,
  "Desktop Advanced GIS should present compact Selection, Geometry, and Data command sections."
);
assert.match(
  legacyHtml,
  /id="advancedGisMoreBtn"[^>]*aria-expanded="false"[^>]*aria-controls="advancedGisMoreCommands"[\s\S]*?id="advancedGisMoreCommands"[^>]*hidden[\s\S]*?data-gis-tool="duplicate"[\s\S]*?data-gis-tool="move-layer"[\s\S]*?data-gis-tool="densify"[\s\S]*?data-gis-tool="cut-hole"[\s\S]*?data-gis-tool="bearing"/,
  "Less-common geometry commands should remain available through the More disclosure."
);
assert.match(
  legacyHtml,
  /class="advanced-gis-mobile-content"[\s\S]*?>Layer GeoJSON<[\s\S]*?>Selected<[\s\S]*?>Layer CSV<[\s\S]*?>All<[\s\S]*?>Visible<[\s\S]*?>By Field<[\s\S]*?>Cut Hole<[\s\S]*?>Offline Pack</,
  "The existing mobile Advanced GIS grid and labels should remain available."
);
assert.match(
  legacyHtml,
  /const enabledTools = \{[\s\S]*?merge:\s*editable && geometryType !== "point" && count >= 2,[\s\S]*?"cut-hole":\s*editable && geometryType === "polygon" && count === 1,[\s\S]*?"export-selected":\s*hasLayer && count > 0,/,
  "Selection-dependent desktop commands should react to geometry and selection state."
);
assert.match(
  legacyHtml,
  /const pointHiddenTools = new Set\(\["merge", "simplify", "densify", "topology"\]\);[\s\S]*?const polygonOnlyTools = new Set\(\["cut-hole"\]\);[\s\S]*?const lineOnlyTools = new Set\(\["bearing"\]\);/,
  "Desktop geometry commands should hide operations that do not apply to the active geometry type."
);
assert.match(
  legacyHtml,
  /#advancedGisPanel \{[\s\S]*?width:\s*min\(318px,[\s\S]*?overflow:\s*hidden;[\s\S]*?#advancedGisPanel \.advanced-gis-desktop-content \{[\s\S]*?overflow-y:\s*auto;/,
  "The desktop Advanced GIS inspector should be compact with a fixed header and scrollable command area."
);

console.log("Tool panel region accessibility checks passed.");
