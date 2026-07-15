import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtml = readFileSync(resolve(__dirname, "../public/legacy/lalgeosurvey.html"), "utf8");
const mobilePane = legacyHtml.match(
  /<div id="mobileMenuPane"[\s\S]*?<div class="menu-dropdown-section" data-menu-pane="app">/,
)?.[0];

assert.ok(mobilePane, "Expected a dedicated unified mobile menu pane.");

for (const heading of ["New", "Import", "Workspace", "Edit", "Map", "Share &amp; Export", "Settings &amp; Help"]) {
  assert.match(
    mobilePane,
    new RegExp(`class="mobile-menu-summary">${heading}<\\/summary>`),
    `Expected the mobile menu to include the ${heading} group.`,
  );
}

assert.match(
  mobilePane,
  /<details class="mobile-menu-group" name="mobile-menu-sections" open>/,
  "New should be the single expanded section when the mobile menu first opens.",
);
assert.match(
  mobilePane,
  /<details class="mobile-menu-group" name="mobile-menu-sections">[\s\S]*?<summary class="mobile-menu-summary">Import<\/summary>/,
  "Collapsed sections should use a shared exclusive disclosure group.",
);

const expectedTargets = [
  "newProjectBtn",
  "menuNewLayerBtn",
  "openProjectBtn",
  "toggleImportBtn",
  "workspacePanelBtn",
  "menuToggleDataPaneBtn",
  "menuToggleLayersBtn",
  "menuOpenEditPanelBtn",
  "menuUndoBtn",
  "menuRedoBtn",
  "menuMyLocationBtn",
  "menuShowBasemapPoisBtn",
  "shareMapBtn",
  "menuExportPdfBtn",
  "printButton",
  "menuSettingsBtn",
  "menuHelpCenterBtn",
  "menuAboutBtn",
  "menuLogoutBtn",
];

for (const target of expectedTargets) {
  assert.match(
    mobilePane,
    new RegExp(`data-mobile-menu-target="${target}"`),
    `Expected the unified mobile menu to expose ${target}.`,
  );
}

assert.match(
  mobilePane,
  /class="mobile-map-type-picker"[\s\S]*?data-map-type="standard"[\s\S]*?data-map-type="satellite"[\s\S]*?data-map-type="hybrid"/,
  "Map styles should be combined into one compact segmented picker.",
);
assert.match(
  legacyHtml,
  /function syncMobileMenuCommandStates\(\)[\s\S]*?data-mobile-menu-target[\s\S]*?button\.disabled = disabled;[\s\S]*?data-map-type[\s\S]*?button\.disabled = !hasProject;/,
  "Unified mobile commands should mirror desktop availability and project state.",
);
assert.match(
  legacyHtml,
  /mobileMenuPane\?\.addEventListener\("click"[\s\S]*?data-mobile-menu-target[\s\S]*?setToolbarMenuVisibility\(false\);[\s\S]*?target\.click\(\);/,
  "Mobile commands should delegate to the existing tested desktop actions.",
);
assert.match(
  legacyHtml,
  /mobileMenuGroups\.forEach\(\(group\)[\s\S]*?group\.addEventListener\("toggle"[\s\S]*?if \(!group\.open\) return;[\s\S]*?otherGroup\.open = false;/,
  "Opening one mobile menu section should collapse every other section.",
);
assert.match(
  legacyHtml,
  /\.mobile-menu-summary\s*\{[\s\S]*?min-height:\s*50px;[\s\S]*?font-size:\s*15px;[\s\S]*?\.mobile-menu-group\[open\] > \.mobile-menu-summary/,
  "Accordion headers should retain large Apple-like touch targets and a clear expanded state.",
);
assert.match(
  legacyHtml,
  /#toolbarMenuTray\s*{[\s\S]*?max-height:\s*min\(70dvh,[\s\S]*?overflow-y:\s*auto;[\s\S]*?border-radius:\s*20px;[\s\S]*?backdrop-filter:\s*blur\(26px\)\s+saturate\(160%\);/,
  "The unified menu should use a bounded, scrollable Apple-like glass sheet on mobile.",
);

console.log("Mobile menu organization checks passed.");
