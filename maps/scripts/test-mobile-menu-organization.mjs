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

const brandMenuButton = legacyHtml.match(/<button id="sidebarToggleBtn"[\s\S]*?<\/button>/)?.[0];
assert.ok(brandMenuButton, "Expected the LalGeo brand to remain the mobile menu trigger.");
assert.match(brandMenuButton, /aria-label="LalGeo menu"/, "The brand trigger should have a clear accessible name.");
assert.match(brandMenuButton, /aria-expanded="false"/, "The brand trigger should expose its collapsed state.");
assert.match(brandMenuButton, /class="brand-menu-chevron"[\s\S]*?aria-hidden="true"/, "The brand trigger should include one decorative disclosure icon.");

for (const heading of ["New", "Import", "Workspace", "Edit", "Map", "Share &amp; Export", "Settings &amp; Help"]) {
  assert.match(
    mobilePane,
    new RegExp(`class="mobile-menu-summary">${heading}<\\/summary>`),
    `Expected the mobile menu to include the ${heading} group.`,
  );
}

assert.match(
  mobilePane,
  /<summary class="mobile-menu-summary">Workspace<\/summary>[\s\S]*?data-mobile-menu-target="workspacePanelBtn"><span>Recent<\/span>/,
  "Recent projects should live in the Workspace section.",
);
assert.match(
  mobilePane,
  /<summary class="mobile-menu-summary">Settings &amp; Help<\/summary>[\s\S]*?<span>Settings<\/span>[\s\S]*?<span>Help Center<\/span>[\s\S]*?<span>About LalGeo<\/span>[\s\S]*?mobile-menu-account-action[\s\S]*?<span>Log Out<\/span>/,
  "Settings, Help Center, About, and the separated Log Out action should share one final section.",
);
assert.doesNotMatch(
  mobilePane,
  /Force Close/,
  "The developer-oriented Force Close action should not be prominent in the mobile menu.",
);

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
  /function syncMobileMenuCommandStates\(\)[\s\S]*?data-mobile-menu-target[\s\S]*?setCommandAvailabilityState\(button, !disabled, disabledReason\);[\s\S]*?data-map-type[\s\S]*?button\.disabled = !hasProject;/,
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
  /document\.addEventListener\("pointerdown", \(event\) => \{[\s\S]*?toolbarMenuKey !== "mobile"[\s\S]*?toolbarMenuTray\?\.contains\(event\.target\)[\s\S]*?sidebarToggleBtn\?\.contains\(event\.target\)[\s\S]*?setToolbarMenuVisibility\(false\);[\s\S]*?\}, true\);/,
  "Tapping outside the consolidated menu should dismiss it even when the map consumes click events.",
);
assert.match(
  legacyHtml,
  /const menuKey = button === sidebarToggleBtn && window\.matchMedia\("\(max-width: 600px\)"\)\.matches[\s\S]*?\? "mobile"[\s\S]*?: button\.dataset\.menu;/,
  "The LalGeo brand should open the consolidated pane on mobile while retaining its desktop menu.",
);
assert.match(
  legacyHtml,
  /#toolbar #leftToolbarExpand\s*{\s*display:\s*none;/,
  "The obsolete floating mobile hamburger should not occupy map space.",
);
assert.match(
  legacyHtml,
  /#toolbar \.brand-menu-chevron\s*{[\s\S]*?display:\s*block;[\s\S]*?#toolbar \.brand-menu-btn\[aria-expanded="true"\] \.brand-menu-chevron\s*{[\s\S]*?rotate\(180deg\)/,
  "The logo disclosure should turn upward while the consolidated menu is open.",
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
