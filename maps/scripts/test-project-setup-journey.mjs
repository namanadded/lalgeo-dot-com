import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /id="workspaceCreateModal"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="createProjectTitle"[\s\S]*?aria-describedby="createProjectIntro"/, "Project setup should be exposed as a named modal dialog.");
assert.match(source, /id="createProjectCloseBtn"[^>]*class="workspace-modal-close"[^>]*aria-label="Close new project"/, "Project setup should provide a familiar, labelled close control.");
assert.match(source, /id="createProjectNameHelp"[\s\S]*?id="createLayerNameHelp"[\s\S]*?<span>More options<\/span><small>Description, workspace type, and storage<\/small>/, "Project setup should explain essential fields before progressively disclosing secondary choices.");
assert.match(source, /id="createProjectTypeHelp"[^>]*>[\s\S]*?Survey keeps field collection simple\.[\s\S]*?GIS starts with the full analysis workspace\./, "Workspace choices should explain their user impact.");
assert.match(source, /id="createStorageHelp"[^>]*>[\s\S]*?Browser projects stay on this device\.[\s\S]*?Dropbox sync requires a connection\./, "Storage choices should explain persistence and connection requirements.");
assert.match(source, /id="createProjectValidation"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/, "Validation should use a polite status region and remain hidden initially.");
assert.match(source, /createProjectFormTouched = false;[\s\S]*?createProjectValidation\.hidden = isValid \|\| !createProjectFormTouched;/, "Validation should not scold users before they interact with the form.");
assert.match(source, /#workspaceCreateModal\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?#workspaceCreateModal \.workspace-modal\s*\{[\s\S]*?max-height:\s*calc\(100dvh[\s\S]*?border-radius:\s*24px 24px 0 0;/, "Project setup should become a scroll-safe mobile bottom sheet.");
assert.match(source, /#workspaceCreateModal \.workspace-modal-actions\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?env\(safe-area-inset-bottom/, "Mobile project actions should remain reachable above the device safe area.");

console.log("Project setup journey checks passed.");
