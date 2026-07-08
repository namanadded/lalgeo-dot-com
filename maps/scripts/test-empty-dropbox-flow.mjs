import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

assert.match(
  legacyHtml,
  /function\s+showDropboxWorkspaceControls\s*\(\)\s*{[\s\S]*?openWorkspacePanelFallback\(\);[\s\S]*?dropboxControls[\s\S]*?scrollIntoView[\s\S]*?connectDropboxBtn\?\.focus/,
  "Start dialog Dropbox action should open and focus the Dropbox workspace controls.",
);

const helperBody = legacyHtml.match(/function\s+showDropboxWorkspaceControls\s*\(\)\s*{([\s\S]*?)\n\s*}\n\n\s*function\s+openCreateProjectModalFallback/)?.[1] ?? "";
assert.ok(helperBody, "Expected showDropboxWorkspaceControls helper to exist.");
assert.doesNotMatch(
  helperBody,
  /connectDropboxBtn\?\.click|window\.location\.href|WORKER_BASE\/api\/auth/,
  "Start dialog Dropbox helper must not auto-start OAuth or redirect away from the map.",
);

assert.match(
  legacyHtml,
  /emptyConnectDropboxBtn\?\.addEventListener\("click",\s*\(\)\s*=>\s*{[\s\S]*?showDropboxWorkspaceControls\(\);[\s\S]*?}\);/,
  "Start dialog Dropbox button should show Dropbox controls instead of clicking the auth button.",
);

console.log("Empty state Dropbox flow checks passed.");
