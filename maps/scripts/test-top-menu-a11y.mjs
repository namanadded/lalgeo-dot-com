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

function assertAttribute(tag, name, value, message) {
  assert.match(tag, new RegExp(`\\b${name}="${value}"`), message);
}

const menuButtons = [
  { id: "sidebarToggleBtn", menu: "app", label: "LalGeo menu" },
  { id: "openDataManagerBtn", menu: "file", label: "File menu" },
  { id: "toolbarMenuBtn", menu: "edit", label: "Edit menu" },
  { id: "settingsBtn", menu: "view", label: "View menu" },
  { id: "historyMenuBtn", menu: "history", label: "History menu" },
  { id: "windowMenuBtn", menu: "window", label: "Window menu" },
  { id: "helpMenuBtn", menu: "help", label: "Help menu" },
];

for (const button of menuButtons) {
  const tag = getButtonById(button.id);
  assertAttribute(
    tag,
    "aria-controls",
    "toolbarMenuTray",
    `${button.label} button must identify the shared menu tray.`,
  );
  assertAttribute(
    tag,
    "aria-expanded",
    "false",
    `${button.label} button must default to collapsed.`,
  );
  assertAttribute(
    tag,
    "data-menu",
    button.menu,
    `${button.label} button must declare the menu pane key it opens.`,
  );
}

assert.match(
  legacyHtml,
  /const topButtons = \[sidebarToggleBtn, openDataManagerBtn, toolbarMenuBtn, settingsBtn, historyMenuBtn, windowMenuBtn, helpMenuBtn\];/,
  "Top menu state sync must include every shared tray trigger.",
);

assert.match(
  legacyHtml,
  /const isMobileLogoMenu = button === sidebarToggleBtn[\s\S]*?toolbarMenuKey === "mobile";[\s\S]*?const isActive = toolbarMenuVisible && \(button\.dataset\.menu === toolbarMenuKey \|\| isMobileLogoMenu\);[\s\S]*?button\.setAttribute\("aria-expanded", isActive \? "true" : "false"\);/,
  "Top menu state sync must expose the logo as expanded for its mobile pane and preserve desktop menu state.",
);

assert.match(
  legacyHtml,
  /function setToolbarMenuVisibility\(show\)[\s\S]*?setTopMenuButtonStates\(\);/,
  "Closing the shared menu tray must reset top menu aria-expanded states.",
);

assert.match(
  legacyHtml,
  /function openToolbarMenu\(menuKey, button = null\)[\s\S]*?setTopMenuButtonStates\(\);/,
  "Opening or switching top menus must refresh top menu aria-expanded states.",
);

assert.match(
  legacyHtml,
  /function positionToolbarMenu\(button\)[\s\S]*?matchMedia\("\(max-width: 600px\)"\)[\s\S]*?buttonRect\.bottom \+ 8[\s\S]*?return;/,
  "The unified mobile command tray should open below its header trigger.",
);

console.log("Top menu accessibility checks passed.");
