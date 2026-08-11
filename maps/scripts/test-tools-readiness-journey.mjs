import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const source = await readFile(legacyHtmlPath, "utf8");

assert.match(
  source,
  /id="advancedGisEmptyState"[^>]*role="status"[^>]*aria-live="polite"[\s\S]*?id="advancedGisEmptyTitle">Start with a project<[\s\S]*?id="advancedGisCreateProjectBtn"[^>]*>New project<[\s\S]*?id="advancedGisImportProjectBtn"[^>]*>Import</,
  "Tools should explain the missing-project prerequisite and provide direct recovery actions.",
);
assert.match(
  source,
  /function updateAdvancedGisPanelState\(\)[\s\S]*?advancedGisEmptyState\.hidden = hasLayer[\s\S]*?classList\.toggle\("is-empty", !hasLayer\)[\s\S]*?hasProject \? "Add a layer to continue" : "Start with a project"[\s\S]*?hasProject \? "Add a layer" : "Import"/,
  "The empty state should distinguish a missing project from a missing active layer.",
);
assert.match(
  source,
  /advancedGisCreateProjectBtn\?\.addEventListener\("click"[\s\S]*?setAdvancedGisVisible\(false\)[\s\S]*?openCreateProjectModal\(\)/,
  "New project should leave Tools and open the existing project setup journey.",
);
assert.match(
  source,
  /advancedGisImportProjectBtn\?\.addEventListener\("click"[\s\S]*?const hasProject = Boolean\(activeProjectRecord\)[\s\S]*?menuNewLayerBtn\?\.click\(\)[\s\S]*?setImportPanelVisibility\(true\)/,
  "The secondary action should reuse layer creation when a project exists and project import otherwise.",
);
assert.match(
  source,
  /function setAdvancedGisVisible\(show, \{ restoreFocus = false \} = \{\}\)[\s\S]*?readyAction\?\.focus\(\)[\s\S]*?toolbarMoreBtn[\s\S]*?advancedGisBtn[\s\S]*?trigger\?\.focus\(\)/,
  "Tools should focus the useful recovery action and restore focus to the visible trigger when closed.",
);
assert.match(
  source,
  /\.advanced-gis-empty-actions button \{[\s\S]*?min-height: 44px;[\s\S]*?@media \(max-width: 600px\) \{[\s\S]*?#advancedGisPanel \.advanced-gis-empty-actions button \{[\s\S]*?min-height: 48px;/,
  "Recovery actions should retain generous touch targets on desktop and phone layouts.",
);
assert.match(
  source,
  /#advancedGisPanel\.is-empty \{[\s\S]*?max-height: none;[\s\S]*?padding-bottom: calc\(14px \+ env\(safe-area-inset-bottom, 0px\)\);/,
  "The empty mobile Tools sheet should fit its content and respect the bottom safe area.",
);

console.log("Tools readiness journey checks passed.");
