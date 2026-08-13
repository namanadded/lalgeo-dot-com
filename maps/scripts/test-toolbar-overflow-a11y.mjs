import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

function getTagById(id) {
  const tag = legacyHtml.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0];
  assert.ok(tag, `Expected #${id} to exist.`);
  return tag;
}

function assertAttribute(tag, name, value, message) {
  assert.match(tag, new RegExp(`\\b${name}="${value}"`), message);
}

const leftToggle = getTagById("leftToolbarExpand");
const menuCommands = getTagById("toolbarMenuCommands");
const rightToggle = getTagById("rightToolbarExpand");
const quickActions = getTagById("quickActionBar");
const undoButton = getTagById("undoBtn");
const redoButton = getTagById("redoBtn");
const advancedGisButton = getTagById("advancedGisBtn");
const editingGroup = legacyHtml.match(
  /<div class="toolbar-action-group toolbar-editing-group"[^>]*>[\s\S]*?<\/div>\s*<div class="toolbar-action-group toolbar-map-group"/,
)?.[0];
const mapGroup = legacyHtml.match(
  /<div class="toolbar-action-group toolbar-map-group"[^>]*>[\s\S]*?<\/div>\s*<div class="toolbar-action-group toolbar-tools-group"/,
)?.[0];
const toolsGroup = legacyHtml.match(
  /<div class="toolbar-action-group toolbar-tools-group"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<button id="rightToolbarExpand"/,
)?.[0];
const projectTitleBlock = legacyHtml.match(
  /<div class="toolbar-project-mini"[^>]*>[\s\S]*?<\/div>/,
)?.[0];

assert.ok(projectTitleBlock, "Toolbar must include the current project title block.");
assert.match(
  projectTitleBlock,
  /<span id="toolbarProjectMeta">Project<\/span>[\s\S]*?<div class="toolbar-project-title-row">[\s\S]*?<strong id="toolbarProjectName">No Project Open<\/strong>[\s\S]*?id="renameProjectBtn"[\s\S]*?aria-label="Rename project"[\s\S]*?hidden/,
  "Toolbar project title must render a small Project caption and a hidden-by-default rename control.",
);
assert.match(
  legacyHtml,
  /renameProjectBtn\.hidden\s*=\s*!hasProject;[\s\S]*?renameProjectBtn\.disabled\s*=\s*!hasProject;/,
  "Project rename control should appear only when a project is open.",
);
assert.match(
  legacyHtml,
  /function openRenameProjectModal\(\)[\s\S]*?title:\s*"Rename project"[\s\S]*?id="projectRenameInput"[\s\S]*?activeProjectRecord\.name\s*=\s*nextName;[\s\S]*?activeProjectName\s*=\s*nextName;[\s\S]*?markActiveProjectUpdated\(\);/,
  "Rename control should validate and persist the updated active project name.",
);
assert.match(
  legacyHtml,
  /toolbarProjectNameCompact\.textContent\s*=\s*hasProject\s*\?\s*activeProjectRecord\.name\s*:\s*"No Project Open"/,
  "Toolbar project title must use title case when no project is open.",
);
assert.match(
  legacyHtml,
  /toolbarProjectMeta\.textContent\s*=\s*"Project"/,
  "Toolbar project caption must stay as Project instead of layer or status metadata.",
);
assert.match(
  legacyHtml,
  /\.toolbar-project-mini strong\s*{[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;/,
  "Toolbar project names must truncate gracefully.",
);
assert.match(
  legacyHtml,
  /grid-template-columns:\s*minmax\(160px,\s*1fr\)\s+minmax\(160px,\s*min\(560px,\s*52vw\)\)\s+minmax\(160px,\s*1fr\);/,
  "Tablet toolbar should reserve a wider center track for the project title without using mobile sizing.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*1024px\)\s*{[\s\S]*?#toolbar\s*{[\s\S]*?grid-template-columns:\s*minmax\(220px,\s*1fr\)\s+minmax\(180px,\s*min\(640px,\s*48vw\)\)\s+minmax\(220px,\s*1fr\);/,
  "Desktop toolbar should widen the horizontal layout and project title track.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.brand-menu-btn\s*{[\s\S]*?height:\s*30px;[\s\S]*?width:\s*67px;/,
  "Desktop and tablet toolbar controls should avoid oversized mobile touch styling.",
);
assert.match(
  legacyHtml,
  /\.toolbar-center\s*{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;[\s\S]*?overflow:\s*hidden;/,
  "Project title should participate in toolbar layout instead of being absolutely positioned behind controls.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar\s*{[\s\S]*?grid-template-columns:\s*74px\s+minmax\(0,\s*1fr\)\s+44px;/,
  "Small-screen toolbar should reserve the widest available middle track for the project title.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar\s*{[\s\S]*?min-height:\s*48px;[\s\S]*?padding:\s*2px\s+10px;/,
  "Mobile toolbar should feel lighter while retaining room for 44px controls.",
);

assertAttribute(
  leftToggle,
  "aria-controls",
  "toolbarMenuCommands",
  "The desktop overflow toggle should identify only its desktop command strip.",
);
assertAttribute(
  leftToggle,
  "aria-expanded",
  "false",
  "Left toolbar overflow toggle must default to the collapsed state.",
);
assertAttribute(
  leftToggle,
  "aria-label",
  "Show menu",
  "Left toolbar overflow toggle should describe the menu it opens without directional copy.",
);
assert.match(
  menuCommands,
  /\bclass="[^"]*\bapp-menubar\b[^"]*"/,
  "Left toolbar overflow target must remain the app menu command group.",
);

assertAttribute(
  rightToggle,
  "aria-controls",
  "quickActionBar",
  "Right toolbar overflow toggle must identify the quick action group it expands.",
);
assertAttribute(
  rightToggle,
  "aria-expanded",
  "false",
  "Right toolbar overflow toggle must default to the collapsed state.",
);
assertAttribute(
  rightToggle,
  "aria-label",
  "Tools",
  "Right toolbar overflow toggle should use a direct Tools accessibility label.",
);
assert.match(
  quickActions,
  /\bclass="[^"]*\btoolbar-quick-actions\b[^"]*"/,
  "Right toolbar overflow target must remain the quick actions group.",
);
assert.ok(editingGroup, "Toolbar must include a dedicated Editing control group.");
assert.ok(mapGroup, "Toolbar must include a dedicated Map control group.");
assert.ok(toolsGroup, "Toolbar must keep the Tools control in its own group.");
assert.doesNotMatch(
  legacyHtml,
  /toolbar-group-label/,
  "Desktop editing toolbar should not use Edit or Map heading capsules.",
);
assert.match(
  editingGroup,
  /id="editPanelToggleBtn"[\s\S]*?<span class="quick-action-label">Draw<\/span>[\s\S]*?id="addSurveyPointBtn"[\s\S]*?<span class="quick-action-label">Add<\/span>/,
  "Editing group should contain Draw and Add.",
);
assert.match(
  mapGroup,
  /id="toolbarLayersBtn"[\s\S]*?<div class="toolbar-action-group toolbar-history-group"[^>]*hidden>[\s\S]*?id="undoBtn"[\s\S]*?id="redoBtn"[\s\S]*?id="toolbarBasemapBtn"/,
  "Contextual Undo and Redo should remain together immediately before Basemap.",
);
assertAttribute(undoButton, "aria-label", "Undo", "Icon-only Undo must retain its accessible name.");
assertAttribute(redoButton, "aria-label", "Redo", "Icon-only Redo must retain its accessible name.");
assert.match(
  mapGroup,
  /id="myLocationBtn"[\s\S]*?<span class="quick-action-label">Locate<\/span>[\s\S]*?id="toolbarLayersBtn"[\s\S]*?<span class="quick-action-label">Layers<\/span>[\s\S]*?id="undoBtn"[\s\S]*?id="redoBtn"[\s\S]*?id="toolbarBasemapBtn"/,
  "Desktop map group should place contextual history between Layers and Basemap.",
);
assert.doesNotMatch(legacyHtml, /id="toolbarMoreBtn"|id="toolbarMorePopover"/, "The obsolete More control and popover should be removed.");
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.toolbar-quick-actions\s*{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*62px;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translateX\(-50%\);[\s\S]*?min-width:\s*0;[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.76\);/,
  "Desktop editing controls should live in one compact floating glass toolbar centered below the top navigation.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.toolbar-quick-actions\s*{[\s\S]*?gap:\s*0;[\s\S]*?padding:\s*4px\s+6px;[\s\S]*?overflow:\s*visible;/,
  "The compact desktop toolbar should allow floating panels to render outside its glass surface.",
);
assert.doesNotMatch(
  legacyHtml,
  /#toolbar \.menu-bar-btn\.quick-action,\s*#toolbar \.toolbar-btn\.ghost\.search-toggle-btn\s*{[^}]*width:\s*32px;/,
  "Late toolbar chrome rules must not force labeled desktop actions back into 32px squares.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.toolbar-action-group\s*{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;[\s\S]*?#toolbar \.toolbar-map-group::before\s*{[\s\S]*?height:\s*24px;[\s\S]*?background:\s*rgba\(148,\s*163,\s*184,\s*0\.3\);/,
  "Desktop editing toolbar should separate editing and map tools with a subtle divider instead of labeled pills.",
);
assert.match(
  legacyHtml,
  /\.quick-action-label\s*{[\s\S]*?display:\s*none;/,
  "Toolbar quick action labels should stay hidden by default for compact and very small screens.",
);
assert.match(
  toolsGroup,
  /id="advancedGisBtn"[\s\S]*?<span class="quick-action-label">Tools<\/span>/,
  "Tools should remain directly available outside the primary Map group.",
);
assert.doesNotMatch(toolsGroup, /id="measureToolBtn"/, "Measure should no longer be a standalone toolbar action.");
assertAttribute(
  advancedGisButton,
  "aria-label",
  "Open tools",
  "Renaming Advanced GIS to Tools must update the accessible description.",
);
assert.match(
  toolsGroup,
  /id="advancedGisBtn"[\s\S]*?<span class="quick-action-label">Tools<\/span>/,
  "The advanced GIS control should be presented as Tools without changing its panel target.",
);
assert.match(
  legacyHtml,
  /id="advancedGisGeneralHeading"[\s\S]*?id="advancedGisMeasureBtn"[^>]*aria-controls="measurementPanel"[^>]*aria-expanded="false"[\s\S]*?<span>Measure<\/span>/,
  "Measure should be the global command inside Tools.",
);
assert.doesNotMatch(
  legacyHtml,
  /id="helpCenterBtn"/,
  "Standalone toolbar Help button should be removed to free title space.",
);
assert.match(
  legacyHtml,
  /<div class="menu-dropdown-section" data-menu-pane="app">[\s\S]*?id="menuAppHelpBtn"[\s\S]*?<span>Help Center<\/span>/,
  "Help Center should be available from the hamburger app menu.",
);
assert.match(
  legacyHtml,
  /menuAppHelpBtn\?\.addEventListener\("click", \(\) => setHelpCenterVisibility\(true\)\)/,
  "Hamburger Help Center item should open the existing help center.",
);
assert.match(
  legacyHtml,
  /leftToolbarExpandBtn\.setAttribute\("aria-expanded",\s*expanded\s*\?\s*"true"\s*:\s*"false"\)/,
  "Left toolbar overflow handler must synchronize aria-expanded.",
);
assert.match(
  legacyHtml,
  /rightToolbarExpandBtn\.setAttribute\("aria-expanded",\s*expanded\s*\?\s*"true"\s*:\s*"false"\)/,
  "Right toolbar overflow handler must synchronize aria-expanded.",
);
assert.match(
  legacyHtml,
  /if \(!expanded\) setToolbarMenuVisibility\(false\);[\s\S]*?rightToolbarExpandBtn\?\.addEventListener\("click"[\s\S]*?setToolbarMenuVisibility\(false\);/,
  "Closing Menu or opening Tools should dismiss an open desktop-style command tray on mobile.",
);

assert.match(
  legacyHtml,
  /#toolbar \.brand-menu-btn\s*{[\s\S]*?min-height:\s*44px;/,
  "The consolidated mobile logo menu must provide at least a 44px touch target.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar #leftToolbarExpand\s*{\s*display:\s*none;/,
  "The desktop overflow trigger should be removed from the mobile map.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-left \.app-menubar\s*{\s*display:\s*none\s*!important;/,
  "The mobile logo menu should keep the redundant desktop category strip hidden.",
);
assert.match(
  legacyHtml,
  /id="sidebarToggleBtn"[^>]*data-menu="mobile"[\s\S]*?const menuKey = button\.dataset\.menu;[\s\S]*?openToolbarMenu\(menuKey, button\)/,
  "The LalGeo logo should open the unified command pane directly at every viewport size.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar \.toolbar-right\.expanded \.toolbar-quick-actions\s*{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*116px\);[\s\S]*?left:\s*max\(8px,\s*env\(safe-area-inset-left,\s*0px\)\);[\s\S]*?right:\s*max\(8px,\s*env\(safe-area-inset-right,\s*0px\)\);[\s\S]*?justify-content:\s*safe center;[\s\S]*?overflow-x:\s*auto;[\s\S]*?z-index:\s*1270;/,
  "Expanded mobile tools must open in a separate safe-area row below the floating controls and scroll instead of being clipped.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar \.toolbar-right\.expanded \.toolbar-quick-actions\s*{[\s\S]*?gap:\s*0;[\s\S]*?padding:\s*5px\s+7px;[\s\S]*?border-radius:\s*12px;[\s\S]*?#toolbar \.toolbar-right\.expanded \.menu-bar-btn\.quick-action\s*{[\s\S]*?height:\s*36px;[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/,
  "Expanded mobile tools should share one compact glass container with borderless controls.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-right\.expanded #editPanelToggleBtn \.quick-action-label,[\s\S]*?#toolbar \.toolbar-right\.expanded #advancedGisBtn \.quick-action-label\s*{[\s\S]*?display:\s*inline;[\s\S]*?white-space:\s*nowrap;/,
  "Named mobile tools should retain the same icon-and-text presentation as desktop.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-right\.expanded \.toolbar-action-group \+ \.toolbar-action-group::before,[\s\S]*?#toolbar \.toolbar-right\.expanded #toolbarLayersBtn::before\s*{[\s\S]*?height:\s*24px;/,
  "Expanded mobile tools should preserve the four visual toolbar sections.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-right\.expanded \.menu-bar-btn\.quick-action\.active,[\s\S]*?#toolbar \.toolbar-right\.expanded \.menu-bar-btn\.quick-action\[aria-expanded="true"\]\s*{[\s\S]*?background:\s*rgba\(15,\s*23,\s*42,\s*0\.075\);/,
  "Open mobile tool panels should use the same selected treatment as desktop.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-right\.expanded #undoBtn,[\s\S]*?#toolbar \.toolbar-right\.expanded #redoBtn\s*{[\s\S]*?width:\s*36px;[\s\S]*?#toolbar \.toolbar-right\.expanded #undoBtn \.quick-action-label,[\s\S]*?#toolbar \.toolbar-right\.expanded #redoBtn \.quick-action-label\s*{[\s\S]*?display:\s*none !important;/,
  "Mobile Undo and Redo should remain compact icon-only controls.",
);
assert.doesNotMatch(
  legacyHtml,
  /id="(?:leftToolbarExpand|rightToolbarExpand)"[^>]*>(?:&gt;|&lt;)/,
  "Mobile toolbar overflow toggles should not use directional arrow glyphs.",
);
assert.match(
  legacyHtml,
  /\.toolbar-icon\s*{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;[\s\S]*?stroke:\s*currentColor;[\s\S]*?stroke-width:\s*2;[\s\S]*?stroke-linecap:\s*round;[\s\S]*?stroke-linejoin:\s*round;/,
  "Toolbar icons must share one normalized SVG stroke style.",
);
assert.match(
  legacyHtml,
  /#toolbar\s*{[\s\S]*?border:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.045\);[\s\S]*?box-shadow:\s*0\s+4px\s+14px\s+rgba\(0,\s*0,\s*0,\s*0\.09\);[\s\S]*?backdrop-filter:\s*blur\(22px\)\s+saturate\(135%\);/,
  "Toolbar glass should keep a subtle Apple-like border, shadow, and blur.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.toolbar-quick-actions\s*{[\s\S]*?gap:\s*0;[\s\S]*?padding:\s*4px\s+6px;[\s\S]*?#toolbar \.menu-bar-btn\.quick-action\s*{[\s\S]*?height:\s*28px;[\s\S]*?gap:\s*4px;[\s\S]*?padding:\s*0\s+6px;[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/,
  "Desktop quick actions should share one compact container and remain borderless at rest.",
);
assert.match(
  legacyHtml,
  /#toolbar #editPanelToggleBtn \.quick-action-label,[\s\S]*?#toolbar #mobileSelectBtn \.quick-action-label,[\s\S]*?#toolbar #addSurveyPointBtn \.quick-action-label,[\s\S]*?#toolbar #advancedGisBtn \.quick-action-label\s*{[\s\S]*?display:\s*inline;/,
  "Select, Draw, Add, Locate, Layers, and Tools should retain icon-and-text presentation.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar #mobileSelectMenu\s*{[\s\S]*?display:\s*inline-flex;[\s\S]*?#toolbar #mobileSelectPopover\s*{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*208px;/,
  "Desktop should expose Select and its compact selection-tool popover.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-action-group \+ \.toolbar-action-group::before\s*{[\s\S]*?width:\s*1px;[\s\S]*?height:\s*20px;/,
  "Desktop toolbar should divide Editing, History, and Map control groups.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-map-group #toolbarBasemapBtn\s*{[\s\S]*?display:\s*none;/,
  "Basemap should leave the directly visible desktop toolbar while Tools remains available.",
);
assert.match(
  legacyHtml,
  /#toolbar \.menu-bar-btn\.quick-action\.active,[\s\S]*?#toolbar \.menu-bar-btn\.quick-action\[aria-expanded="true"\]\s*{[\s\S]*?background:\s*rgba\(15,\s*23,\s*42,\s*0\.075\);/,
  "An active tool or open panel should receive a subtle selected background.",
);
assert.match(
  legacyHtml,
  /#toolbar #undoBtn,[\s\S]*?#toolbar #redoBtn\s*{[\s\S]*?width:\s*26px;[\s\S]*?padding:\s*0;[\s\S]*?#toolbar #undoBtn \.quick-action-label,[\s\S]*?#toolbar #redoBtn \.quick-action-label\s*{[\s\S]*?display:\s*none !important;/,
  "Undo and Redo should remain compact icon-only controls on desktop.",
);
assert.doesNotMatch(
  legacyHtml,
  /setAddNewButtonLabel\("Add New"\)/,
  "The desktop Add control should not revert to the old Add New label.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-icon,\s*#toolbar \.quick-action-icon\s*{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;[\s\S]*?flex:\s*0\s+0\s+18px;/,
  "Toolbar icons should align to a consistent 18px visual box.",
);
assert.match(
  legacyHtml,
  /id="leftToolbarExpand"[\s\S]*?<svg class="toolbar-icon"[\s\S]*?id="rightToolbarExpand"[\s\S]*?<svg class="toolbar-icon"/,
  "Toolbar overflow toggles should use the same SVG icon family as other toolbar controls.",
);
assert.doesNotMatch(
  legacyHtml,
  /id="rightToolbarExpand"[\s\S]*?<rect x="5" y="5" width="4" height="4" rx="1">/,
  "Tools overflow toggle should not use the old grid icon.",
);
assert.match(
  legacyHtml,
  /id="rightToolbarExpand"[\s\S]*?<path d="M14\.7 6\.3a4 4 0 0 0-5 5L4 17l3 3 5\.7-5\.7a4 4 0 0 0 5-5l-2\.6 2\.6-3-3 2\.6-2\.6z">/,
  "Tools overflow toggle should use a clearer tools icon.",
);
assert.doesNotMatch(
  legacyHtml,
  /<span class="quick-action-icon"[^>]*>\s*(?:✎|✚|↺|↻|⌖|▱|⌬|\?)/,
  "Toolbar quick actions should not use mixed text-symbol icon glyphs.",
);
assert.doesNotMatch(
  legacyHtml,
  /id="searchIconBtn"[^>]*>🔍|id="collapseSearchBtn"[^>]*>×/,
  "Toolbar search controls should not use emoji or text close icons.",
);

assert.match(
  legacyHtml,
  /#toolbarSearchShell\s*{[\s\S]*?width:\s*44px;[\s\S]*?min-width:\s*44px;[\s\S]*?height:\s*44px;/,
  "Collapsed mobile search control must provide at least a 44px touch target.",
);
assert.match(
  legacyHtml,
  /#toolbar\s+#toolbarSearchShell\.collapsed\s*{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.52\);[\s\S]*?border-color:\s*rgba\(209,\s*213,\s*219,\s*0\.24\);[\s\S]*?box-shadow:\s*0\s+1px\s+2px\s+rgba\(15,\s*23,\s*42,\s*0\.035\);/,
  "Collapsed toolbar search should keep a lighter, lower-emphasis treatment than primary toolbar buttons.",
);

console.log("Toolbar overflow accessibility checks passed.");
