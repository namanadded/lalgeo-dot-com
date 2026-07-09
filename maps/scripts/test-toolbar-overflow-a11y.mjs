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
  /#leftToolbarExpand::before\s*{[\s\S]*?linear-gradient\(currentColor,\s*currentColor\)/,
  "Left toolbar overflow toggle should use a menu glyph instead of a chevron.",
);
assert.match(
  legacyHtml,
  /#rightToolbarExpand::before\s*{[\s\S]*?radial-gradient\(circle at 4px 4px,\s*currentColor/,
  "Right toolbar overflow toggle should use a tools glyph instead of a chevron.",
);

assert.match(
  legacyHtml,
  /#toolbarSearchShell\s*{[\s\S]*?width:\s*44px;[\s\S]*?min-width:\s*44px;[\s\S]*?height:\s*44px;/,
  "Collapsed mobile search control must provide at least a 44px touch target.",
);

console.log("Toolbar overflow accessibility checks passed.");
