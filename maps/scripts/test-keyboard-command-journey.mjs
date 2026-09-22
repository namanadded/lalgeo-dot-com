import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../public/legacy/lalgeosurvey.html"), "utf8");

const advertisedCommands = [
  { action: "newProject", key: "n", modifier: "primaryModifier", target: "newProjectBtn" },
  { action: "newLayer", key: "n", modifier: "event.altKey", target: "menuNewLayerBtn" },
  { action: "openProject", key: "o", modifier: "primaryModifier", target: "openProjectBtn" },
  { action: "importProject", key: "i", modifier: "event.altKey", target: "toggleImportBtn" },
  { action: "share", key: "s", modifier: "primaryModifier && event.shiftKey", target: "shareMapBtn" },
  { action: "export", key: "e", modifier: "primaryModifier && event.shiftKey", target: "menuExportBtn" },
  { action: "exportPdf", key: "p", modifier: "primaryModifier && event.shiftKey", target: "menuExportPdfBtn" },
  { action: "print", key: "p", modifier: "primaryModifier && !event.shiftKey", target: "printButton" },
  { action: "undo", key: "z", modifier: "primaryModifier", target: "undoBtn" },
  { action: "toggleLayers", key: "l", modifier: "event.altKey", target: "setSidebarVisibility" },
  { action: "toggleData", key: "d", modifier: "event.altKey", target: "setDataPaneVisibility" },
  { action: "settings", key: ",", modifier: "primaryModifier", target: "setSettingsPanelVisibility" },
  { action: "projects", key: "p", modifier: "event.altKey", target: "workspacePanelBtn" },
];

for (const command of advertisedCommands) {
  assert.match(
    html,
    new RegExp(`case "${command.action}": return`),
    `${command.action} must continue to expose a platform-aware menu label.`,
  );
  assert.match(
    html,
    new RegExp(`${command.modifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} && key === "${command.key}"[\\s\\S]{0,220}${command.target}`),
    `${command.action} must have a matching keyboard handler for its advertised shortcut.`,
  );
}

assert.match(
  html,
  /if \(key === "m"\)[\s\S]{0,180}runKeyboardCommand\(menuMyLocationBtn\)/,
  "The advertised unmodified location shortcut must invoke My Location outside interactive fields.",
);

assert.match(
  html,
  /function runKeyboardCommand\(button\)[\s\S]*?button\.disabled \|\| button\.classList\.contains\("is-disabled"\)[\s\S]*?setProjectStatus\(button\.dataset\.disabledReason[\s\S]*?button\.click\(\)/,
  "Keyboard commands must explain disabled prerequisites and invoke the same button journey when enabled.",
);

const exportPdfHandler = html.indexOf('primaryModifier && event.shiftKey && key === "p"');
const printHandler = html.indexOf('primaryModifier && !event.shiftKey && key === "p"');
assert.ok(exportPdfHandler >= 0 && printHandler > exportPdfHandler, "Shift+Print must resolve to Export Map before the plain Print shortcut.");

console.log("Keyboard command journey checks passed.");
