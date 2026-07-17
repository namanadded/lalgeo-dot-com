import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const html = readFileSync(legacyHtmlPath, "utf8");

assert.match(
  html,
  /function setSidebarMode\(mode = "layers"[\s\S]*?sidebar-mode-place[\s\S]*?sidebar-mode-directions[\s\S]*?Close directions/,
  "The shared sidebar should expose distinct Layers, Place, and Directions modes.",
);
assert.match(
  html,
  /function renderDirectionsSidebar\(route\)\s*{[\s\S]*?class="route-duration"[\s\S]*?class="route-meta"[\s\S]*?class="route-mode-chip"[\s\S]*?class="route-start-btn"[\s\S]*?>Start</,
  "Directions should render a compact time, arrival, mode, and primary Start summary.",
);
assert.match(
  html,
  /<details class="route-disclosure">[\s\S]*?<summary>Voice options<\/summary>[\s\S]*?<summary>Route steps<\/summary>/,
  "Secondary voice settings and route steps should stay progressively disclosed.",
);
assert.match(
  html,
  /#sidebar\.sidebar-mode-place,[\s\S]*?#sidebar\.sidebar-mode-directions\s*{[\s\S]*?top:\s*auto\s*!important;[\s\S]*?bottom:[\s\S]*?max-height:\s*min\(48dvh,\s*440px\)/,
  "Mobile place and directions content should use a bounded bottom sheet rather than overlap search.",
);
assert.doesNotMatch(html, /⏱️ Estimated Time:|▶️ Start Voice Navigation|⛔ Stop Voice/, "Legacy emoji-heavy directions UI should be removed.");

console.log("Directions UI checks passed.");
