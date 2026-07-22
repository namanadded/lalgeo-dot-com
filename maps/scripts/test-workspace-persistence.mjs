import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { classifyStorageError, persistJsonAtomically } = require("../public/js/workspace-persistence.js");

function storageWithLimit(limit, initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (Buffer.byteLength(value) > limit) {
        const error = new DOMException("Storage quota exceeded", "QuotaExceededError");
        throw error;
      }
      values.set(key, value);
    },
  };
}

const successfulStorage = storageWithLimit(1024);
const saved = persistJsonAtomically(successfulStorage, "projects", [{ id: "safe-synthetic" }]);
assert.equal(saved.ok, true);
assert.deepEqual(JSON.parse(successfulStorage.getItem("projects")), [{ id: "safe-synthetic" }]);

const previous = JSON.stringify([{ id: "last-known-good", features: 2 }]);
const fullStorage = storageWithLimit(64, { projects: previous });
const failed = persistJsonAtomically(fullStorage, "projects", [{ id: "larger", notes: "x".repeat(256) }]);
assert.equal(failed.ok, false);
assert.equal(failed.error.code, "quota");
assert.equal(fullStorage.getItem("projects"), previous, "failed autosave preserves the last known-good project bytes");
assert.equal(classifyStorageError({ message: "storage offline" }).code, "unavailable");

const html = await readFile(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
assert.match(html, /if \(!result\.ok\) \{[\s\S]*pendingChanges = true;[\s\S]*workspaceDirty = true;/);
assert.match(html, /Autosave failed; your current edits remain open but are not stored/);
assert.match(html, /if \(!result\.ok\)[\s\S]*return;[\s\S]*pendingChanges = false;/);

console.log("Workspace persistence contract: atomic last-known-good recovery and honest dirty state passed.");
