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
  /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(96px,\s*min\(420px,\s*36vw\)\)\s+minmax\(0,\s*1fr\);/,
  "Desktop toolbar should reserve a real center track for the project title.",
);
assert.match(
  legacyHtml,
  /\.toolbar-center\s*{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;[\s\S]*?overflow:\s*hidden;/,
  "Project title should participate in toolbar layout instead of being absolutely positioned behind controls.",
);
assert.match(
  legacyHtml,
  /@media \(max-width:\s*600px\)\s*{[\s\S]*?#toolbar\s*{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(94px,\s*1fr\)\s+auto;/,
  "Small-screen toolbar should reserve a visible middle track for the two-line project title.",
);

assertAttribute(
  leftToggle,
  "aria-controls",
  "toolbarMenuCommands",
  "Left toolbar overflow toggle must identify the menu commands it expands.",
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
  "Show tools",
  "Right toolbar overflow toggle should describe the tools it opens without directional copy.",
);
assert.match(
  quickActions,
  /\bclass="[^"]*\btoolbar-quick-actions\b[^"]*"/,
  "Right toolbar overflow target must remain the quick actions group.",
);
assert.ok(editingGroup, "Toolbar must include a dedicated Editing control group.");
assert.ok(mapGroup, "Toolbar must include a dedicated Map control group.");
assert.ok(toolsGroup, "Toolbar must keep measurement and GIS controls in their own group.");
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
  toolsGroup,
  /id="measureToolBtn"[\s\S]*?id="advancedGisBtn"/,
  "Measure and GIS controls should remain available outside the primary Map group.",
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
  /#leftToolbarExpand,\s*#rightToolbarExpand\s*{[\s\S]*?flex:\s*0\s+0\s+44px;[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  "Mobile toolbar overflow toggles must provide at least a 44px touch target.",
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
  /id="leftToolbarExpand"[\s\S]*?<svg class="toolbar-icon"[\s\S]*?id="rightToolbarExpand"[\s\S]*?<svg class="toolbar-icon"/,
  "Toolbar overflow toggles should use the same SVG icon family as other toolbar controls.",
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
