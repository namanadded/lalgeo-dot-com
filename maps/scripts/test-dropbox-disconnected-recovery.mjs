import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");
const refreshStart = source.indexOf("async function refreshDropboxSurveyList");
const refreshEnd = source.indexOf("function restorePendingStartupDropboxProjectIfNeeded", refreshStart);

assert.notEqual(refreshStart, -1, "Dropbox list refresh function should exist.");
assert.notEqual(refreshEnd, -1, "Dropbox list refresh function should have a stable boundary.");

const refreshSource = source.slice(refreshStart, refreshEnd);
const authBranchStart = refreshSource.indexOf("if (response.status === 401)");
const genericErrorStart = refreshSource.indexOf("if (!response.ok)");

assert.notEqual(authBranchStart, -1, "Dropbox list refresh should explicitly handle an unauthenticated response.");
assert.ok(
  authBranchStart < genericErrorStart,
  "The expected unauthenticated response should be handled before generic request failures."
);

const authBranch = refreshSource.slice(authBranchStart, genericErrorStart);
assert.match(authBranch, /currentDropboxProjects = \[\]/, "Disconnected recovery should clear stale cloud projects.");
assert.match(authBranch, /selectedDropboxProjectPath = null/, "Disconnected recovery should clear stale selection.");
assert.match(authBranch, /Dropbox not connected\./, "Disconnected recovery should expose a useful status.");
assert.match(authBranch, /showDropboxDisconnectedState\(\)/, "Disconnected recovery should restore the connect entry point.");
assert.match(authBranch, /return false/, "Disconnected recovery should stop the list workflow cleanly.");
assert.doesNotMatch(authBranch, /console\.(?:error|warn)/, "Expected auth recovery must not pollute the console.");
assert.doesNotMatch(
  refreshSource,
  /throw new Error\(response\.status === 401/,
  "An expected unauthenticated response must not be converted into an exception."
);
assert.match(
  refreshSource.slice(genericErrorStart),
  /console\.error\(error\)/,
  "Unexpected Dropbox failures should remain visible to diagnostics."
);

console.log("Dropbox disconnected recovery checks passed.");
