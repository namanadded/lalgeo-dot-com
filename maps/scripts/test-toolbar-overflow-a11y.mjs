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
  /<span id="toolbarProjectMeta">Project<\/span>\s*<strong id="toolbarProjectName">No Project Open<\/strong>/,
  "Toolbar project title must render a small Project caption above the project name.",
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
  "toolbarMenuCommands mobileMenuPane",
  "Menu toggle must identify both its desktop command strip and unified mobile pane.",
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
assert.ok(toolsGroup, "Toolbar must keep measurement and GIS controls in their own group.");
assert.doesNotMatch(
  legacyHtml,
  /toolbar-group-label/,
  "Desktop editing toolbar should not use Edit or Map heading capsules.",
);
assert.match(
  editingGroup,
  /id="editPanelToggleBtn"[\s\S]*?<span class="quick-action-label">Draw<\/span>[\s\S]*?id="addSurveyPointBtn"[\s\S]*?<span class="quick-action-label">Add<\/span>[\s\S]*?id="undoBtn"[\s\S]*?<span class="quick-action-label">Undo<\/span>[\s\S]*?id="redoBtn"[\s\S]*?<span class="quick-action-label">Redo<\/span>/,
  "Editing group should read as Draw, Add, Undo, Redo.",
);
assert.match(
  mapGroup,
  /id="myLocationBtn"[\s\S]*?<span class="quick-action-label">Locate<\/span>[\s\S]*?id="toolbarLayersBtn"[\s\S]*?<span class="quick-action-label">Layers<\/span>[\s\S]*?id="toolbarBasemapBtn"[\s\S]*?<span class="quick-action-label">Basemap<\/span>/,
  "Map group should read as Locate, Layers, Basemap.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*1281px\)\s*{[\s\S]*?\.menu-bar-btn\.quick-action\s*{[\s\S]*?width:\s*auto;[\s\S]*?\.quick-action-label\s*{[\s\S]*?display:\s*inline;/,
  "Toolbar quick action labels should appear beside icons when there is enough horizontal space.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.toolbar-quick-actions\s*{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(100%\s*\+\s*28px\);[\s\S]*?min-width:\s*min\(720px,\s*calc\(100vw\s*-\s*48px\)\);[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.76\);/,
  "Desktop editing controls should live in one wider floating glass toolbar below the top navigation.",
);
assert.match(
  legacyHtml,
  /@media \(min-width:\s*601px\)\s*{[\s\S]*?#toolbar \.toolbar-quick-actions\s*{[\s\S]*?justify-content:\s*safe center;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;[\s\S]*?scrollbar-width:\s*none;[\s\S]*?#toolbar \.toolbar-action-group\s*{[\s\S]*?flex:\s*0\s+0\s+auto;/,
  "Desktop toolbar groups should keep their intrinsic width and scroll safely instead of crushing icons and labels.",
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
  /id="measureToolBtn"[\s\S]*?id="advancedGisBtn"/,
  "Measure and GIS controls should remain available outside the primary Map group.",
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
  /\.toolbar-quick-actions\s*{[\s\S]*?gap:\s*14px;/,
  "Logical toolbar groups should have additional spacing between them.",
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
  /#toolbar #leftToolbarExpand,\s*#toolbar #rightToolbarExpand\s*{[\s\S]*?flex:\s*0\s+0\s+44px;[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  "Mobile toolbar overflow toggles must provide at least a 44px touch target.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar #leftToolbarExpand,\s*#toolbar #rightToolbarExpand\s*{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*64px\);[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.84\);[\s\S]*?backdrop-filter:\s*blur\(22px\)\s+saturate\(150%\);/,
  "Mobile menu and tools controls should float below the header using light glass styling.",
);
assert.match(
  legacyHtml,
  /#toolbar \.toolbar-left \.app-menubar\s*{\s*display:\s*none\s*!important;/,
  "The mobile hamburger should remove the redundant desktop category strip.",
);
assert.match(
  legacyHtml,
  /matchMedia\("\(max-width: 600px\)"\)[\s\S]*?toolbarMenuKey === "mobile"[\s\S]*?openToolbarMenu\("mobile", leftToolbarExpandBtn\)/,
  "The mobile hamburger should open the unified command pane directly.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar \.toolbar-right\.expanded \.toolbar-quick-actions\s*{[\s\S]*?left:\s*max\(8px,\s*env\(safe-area-inset-left,\s*0px\)\);[\s\S]*?right:\s*max\(8px,\s*env\(safe-area-inset-right,\s*0px\)\);[\s\S]*?justify-content:\s*safe center;[\s\S]*?overflow-x:\s*auto;/,
  "Expanded mobile tools must stay within the safe viewport and scroll instead of being clipped off-screen.",
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
  /#toolbar \.brand-menu-btn,[\s\S]*?#toolbar \.menu-bar-btn\.quick-action\s*{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.62\);[\s\S]*?border:\s*1px\s+solid\s+rgba\(209,\s*213,\s*219,\s*0\.24\);[\s\S]*?box-shadow:\s*0\s+1px\s+3px\s+rgba\(15,\s*23,\s*42,\s*0\.025\);/,
  "Toolbar buttons should use lighter chrome with reduced border contrast.",
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
