import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const source = await readFile(legacyHtmlPath, "utf8");

assert.match(
  source,
  /@media \(max-width: 600px\)[\s\S]*?--mobile-sheet-inline:\s*16px;[\s\S]*?--mobile-sheet-header-height:\s*44px;[\s\S]*?--mobile-sheet-row-height:\s*44px;/,
  "Mobile sheets should share spacing, header, and row tokens.",
);
assert.match(
  source,
  /#sidebar::before,[\s\S]*?#measurementPanel::before,[\s\S]*?#advancedGisPanel::before,[\s\S]*?#editFloatingPanel::before,[\s\S]*?#toolbarMenuTray\[data-active-menu="basemap"\]::before[\s\S]*?width:\s*36px;[\s\S]*?height:\s*4px;/,
  "Every mobile sheet should use the same drag indicator.",
);
assert.match(
  source,
  /id="mobileBasemapCloseBtn"[^>]*aria-label="Close basemap"[\s\S]*?mobileBasemapCloseBtn\?\.addEventListener\("click"[\s\S]*?setToolbarMenuVisibility\(false\)/,
  "The mobile Basemap sheet should expose a consistent close action.",
);
assert.match(
  source,
  /#toolbarMenuTray\[data-active-menu="basemap"\] \.basemap-menu-item\s*\{[\s\S]*?grid-template-columns:\s*22px minmax\(0, 1fr\);[\s\S]*?width:\s*100%;[\s\S]*?text-align:\s*left;/,
  "Basemap options should be full-width, left-aligned menu rows.",
);
assert.match(
  source,
  /#advancedGisPanel \.advanced-gis-command-list\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
  "Advanced GIS commands should use one column on mobile.",
);
assert.match(
  source,
  /Choose which layers can be selected on the map\.[\s\S]*?Use More to change drawing order\./,
  "Mobile Layers guidance should be concise and match its exposed controls.",
);
assert.match(
  source,
  /#mapAddHint\s*\{[\s\S]*?display:\s*none !important;/,
  "The mobile Draw sheet should replace the floating map pointer hint.",
);
assert.match(
  source,
  /function showWorkspaceHint\([^)]*\)\s*{[\s\S]*?!isDesktopDrawFlow\(\) && \(editSessionActive \|\| isAddingSurveyPoint\)[\s\S]*?workspaceHint\.hidden = true;[\s\S]*?return;/,
  "Mobile drawing should keep guidance in its contextual sheet instead of duplicating a workspace banner.",
);
assert.match(
  source,
  /#measurementPanel:not\(\.has-points\) \.measurement-actions\s*\{[\s\S]*?display:\s*none;/,
  "Mobile measurement actions should stay hidden before measurement begins.",
);
assert.match(
  source,
  /measurementPanel\?\.classList\.toggle\("has-points", pointCount > 0\)/,
  "Measurement presentation should track when actionable points exist.",
);

console.log("Mobile sheet refinement checks passed.");
