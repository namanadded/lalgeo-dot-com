import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(
  new URL("../public/legacy/lalgeosurvey.html", import.meta.url),
  "utf8",
);

assert.match(
  html,
  /<p id="quickActionsSettingsTitle" class="settings-panel-title">Quick actions<\/p>/,
  "the Quick actions heading should have a stable accessible-name target",
);

assert.match(
  html,
  /<div class="quick-action-prefs" role="group" aria-labelledby="quickActionsSettingsTitle">/,
  "the Quick actions checkboxes should be exposed as a named group",
);

console.log("Quick actions accessibility checks passed.");
