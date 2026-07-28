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

console.log("Tool panel region accessibility checks passed.");
