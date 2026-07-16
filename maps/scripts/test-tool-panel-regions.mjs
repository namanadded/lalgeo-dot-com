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

console.log("Tool panel region accessibility checks passed.");
