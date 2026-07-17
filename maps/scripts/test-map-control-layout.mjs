import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

function getButtonById(id) {
  const tag = legacyHtml.match(new RegExp(`<button[^>]+id="${id}"[^>]*>`))?.[0];
  assert.ok(tag, `Expected #${id} to exist.`);
  return tag;
}

const layersButton = getButtonById("layersMapBtn");
const locationButton = getButtonById("myLocationBtn");
const lookAroundButton = getButtonById("streetViewDropBtn");
const lookAroundMarkup = legacyHtml.match(
  /<button id="streetViewDropBtn"[\s\S]*?<\/button>/,
)?.[0];

assert.match(
  layersButton,
  /\shidden(?:\s|>)/,
  "The redundant standalone Layers bubble should be removed from the map chrome.",
);
assert.match(
  legacyHtml,
  /#layersMapBtn\[hidden\]\s*{\s*display:\s*none\s*!important;/,
  "Author styles must preserve the hidden state of the retired Layers bubble.",
);
assert.match(
  locationButton,
  /aria-label="Show my location"[\s\S]*?aria-pressed="false"/,
  "The map location control should expose its purpose and active state.",
);
assert.match(
  legacyHtml,
  /<div class="map-navigation-controls"[^>]*>[\s\S]*?id="myLocationBtn"[\s\S]*?id="streetViewDropBtn"[\s\S]*?<\/div>/,
  "Location and Look Around should share the lower-right map navigation cluster.",
);
assert.match(
  lookAroundButton,
  /aria-label="Open Look Around at map center or drag to a street"/,
  "Look Around must describe both its tap and precision drag interactions.",
);
assert.ok(lookAroundMarkup, "Look Around button markup should be available.");
assert.match(
  lookAroundMarkup,
  /<circle cx="5\.5" cy="16" r="3\.2"\/>[\s\S]*?<circle cx="18\.5" cy="16" r="3\.2"\/>/,
  "Look Around should use a recognizable binoculars symbol instead of a draggable person glyph.",
);
assert.doesNotMatch(
  lookAroundMarkup,
  /M12 3a3 3 0 1 0/,
  "Look Around should not retain the old person icon.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?\.map-navigation-controls\s*{[\s\S]*?right:\s*12px;[\s\S]*?bottom:\s*146px;[\s\S]*?gap:\s*8px;[\s\S]*?#streetViewDropBtn\s*{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?border-radius:\s*14px;[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.84\);/,
  "Mobile Look Around should align as a 44px Apple-like glass control above the lower-right map controls.",
);
assert.match(
  legacyHtml,
  /#myLocationBtn\s*{[\s\S]*?width:\s*38px;[\s\S]*?height:\s*38px;[\s\S]*?border-radius:\s*999px;[\s\S]*?color:\s*#0a84ff;/,
  "My Location should use a compact circular Apple-blue map control.",
);
assert.match(
  legacyHtml,
  /const targetPoint = moved[\s\S]*?\? dropPoint[\s\S]*?: new DOMPoint\(mapRect\.left \+ mapRect\.width \/ 2, mapRect\.top \+ mapRect\.height \/ 2\);/,
  "Tapping Look Around should target the visible map center while retaining drag-to-street precision.",
);

console.log("Map control layout checks passed.");
