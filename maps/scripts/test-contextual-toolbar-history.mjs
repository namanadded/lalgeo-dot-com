import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyHtmlPath = fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url));
const legacyHtml = await readFile(legacyHtmlPath, "utf8");

assert.doesNotMatch(
  legacyHtml,
  /#toolbar #editPanelToggleBtn,\s*#toolbar \.toolbar-history-group,\s*#toolbar #myLocationBtn\s*\{\s*display:\s*none !important;/,
  "The desktop permanent-hide selector must not include the history group.",
);

const syncFunction = legacyHtml.match(
  /function syncToolbarHistoryControls\(\)\s*\{[\s\S]*?(?=\n\s*function resetHistoryStacks)/,
)?.[0] || "";
assert.ok(syncFunction, "Expected one centralized toolbar-history synchronization function.");
assert.match(syncFunction, /const canUndo = undoStack\.length > 0;/, "Undo availability must derive from undoStack.");
assert.match(syncFunction, /const canRedo = redoStack\.length > 0;/, "Redo availability must derive from redoStack.");
assert.match(syncFunction, /const hasHistory = canUndo \|\| canRedo;/, "Group visibility must derive from either stack.");
assert.match(syncFunction, /toolbarHistoryGroup\.hidden = !hasHistory;/, "The group must use semantic hidden state when both stacks are empty.");
assert.match(syncFunction, /undoBtn\.hidden = false;[\s\S]*?redoBtn\.hidden = false;/, "Both history buttons must remain present while their group is visible.");
assert.match(syncFunction, /undoBtn\.disabled = !canUndo;[\s\S]*?redoBtn\.disabled = !canRedo;/, "Undo and Redo disabled states must synchronize independently.");

assert.match(
  legacyHtml,
  /class="toolbar-action-group toolbar-history-group"[^>]*hidden>[\s\S]*?id="undoBtn"[\s\S]*?id="redoBtn"/,
  "History controls should start hidden and retain both existing buttons.",
);
assert.match(
  legacyHtml,
  /id="toolbarLayersBtn"[\s\S]*?class="toolbar-action-group toolbar-history-group"[\s\S]*?id="toolbarMoreMenu"/,
  "History controls should appear immediately before More in DOM order.",
);
assert.match(
  legacyHtml,
  /function performUndo\(\)[\s\S]*?redoStack\.push[\s\S]*?updateHistoryButtons\(\);/,
  "Undo must synchronize the toolbar after moving an action to Redo.",
);
assert.match(
  legacyHtml,
  /function performRedo\(\)[\s\S]*?undoStack\.push[\s\S]*?updateHistoryButtons\(\);/,
  "Redo must synchronize the toolbar after restoring an action to Undo.",
);
assert.match(
  legacyHtml,
  /function resetHistoryStacks\(\)[\s\S]*?undoStack = \[\];[\s\S]*?redoStack = \[\];[\s\S]*?updateHistoryButtons\(\);/,
  "History resets must synchronize toolbar visibility immediately.",
);
assert.match(
  legacyHtml,
  /function setActiveProject\([\s\S]*?historyContextChanged[\s\S]*?resetHistoryStacks\(\);/,
  "Project or active-layer changes must reset and synchronize history.",
);
assert.match(
  legacyHtml,
  /primaryModifier && key === "z" && !event\.shiftKey[\s\S]*?undoBtn\?\.click\(\)[\s\S]*?primaryModifier && event\.shiftKey && key === "z"[\s\S]*?redoBtn\?\.click\(\)/,
  "Keyboard shortcuts must continue to invoke the existing Undo and Redo controls.",
);
assert.match(
  legacyHtml,
  /\.toolbar-history-group:not\(\[hidden\]\) \.menu-bar-btn\.quick-action\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*50px;/,
  "Mobile history buttons must keep accessible touch targets.",
);

console.log("Contextual toolbar history checks passed.");
