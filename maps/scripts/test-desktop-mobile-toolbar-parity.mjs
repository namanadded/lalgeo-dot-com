import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

const brandButton = legacyHtml.match(/<button id="sidebarToggleBtn"[\s\S]*?<\/button>/)?.[0] || "";
assert.match(brandButton, /data-menu="mobile"/, "The LalGeo logo should open the consolidated application menu on desktop and mobile.");
assert.match(brandButton, /aria-label="LalGeo menu"/, "The shared application-menu trigger should retain its accessible name.");
assert.match(brandButton, /class="brand-menu-chevron"/, "The shared application-menu trigger should expose a disclosure indicator.");

assert.doesNotMatch(
  legacyHtml,
  /#toolbar #editPanelToggleBtn,\s*#toolbar \.toolbar-history-group,\s*#toolbar #myLocationBtn\s*\{\s*display:\s*none !important;/,
  "Desktop must not permanently hide contextual history controls.",
);
assert.match(
  legacyHtml,
  /function syncToolbarHistoryControls\(\)[\s\S]*?const hasHistory = canUndo \|\| canRedo;[\s\S]*?toolbarHistoryGroup\.hidden = !hasHistory;/,
  "Desktop and mobile must share stack-driven contextual history visibility.",
);
assert.match(
  legacyHtml,
  /const selected = key === "addNew" \|\| quickActions\.includes\(key\);/,
  "Add should remain a permanent toolbar action at every viewport size.",
);
assert.match(
  legacyHtml,
  /#mobileLocationBtn\s*\{[\s\S]*?right:\s*18px;[\s\S]*?bottom:\s*94px;[\s\S]*?width:\s*46px;[\s\S]*?height:\s*46px;[\s\S]*?display:\s*inline-flex;/,
  "Desktop Locate should appear as a floating map control stacked with Look Around.",
);
assert.match(
  legacyHtml,
  /#toolbarMenuTray\[data-active-menu="mobile"\]\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 54px\);[\s\S]*?overflow-y:\s*auto;/,
  "The consolidated desktop logo menu should remain bounded and scrollable.",
);
assert.match(
  legacyHtml,
  /function positionDesktopDrawPanel\(\)[\s\S]*?const anchorButton = editPanelToggleBtn\?\.getClientRects\(\)\.length[\s\S]*?: addSurveyPointBtn;[\s\S]*?anchorButton\.getBoundingClientRect\(\);/,
  "The desktop drawing context should anchor to Add after the duplicate Draw control is hidden.",
);
assert.match(
  legacyHtml,
  /const items = \[[\s\S]*?\.\.\.mobileAddGeometryButtons,[\s\S]*?addImportDataMenuBtn,[\s\S]*?addImportPhotosMenuBtn,[\s\S]*?addLayerMenuBtn[\s\S]*?\]\.filter/,
  "Keyboard navigation should include the same Add commands on desktop and mobile.",
);

console.log("Desktop/mobile toolbar parity checks passed.");
