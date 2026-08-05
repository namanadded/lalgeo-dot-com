import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../public/legacy/lalgeosurvey.html", import.meta.url)), "utf8");

assert.match(source, /id="shareToast" role="dialog" aria-modal="true" aria-labelledby="shareToastTitle" aria-describedby="shareToastDescription" hidden/, "Share should open as a named modal dialog.");
assert.match(source, /id="shareToastTitle">Share this map<[\s\S]*?Anyone with this link can open the current Dropbox-backed project/, "The sheet should plainly explain what the link shares.");
assert.match(source, /id="shareToastClose"[\s\S]*?aria-label="Close share sheet"[\s\S]*?id="shareToastCopy"[\s\S]*?>Copy link<[\s\S]*?id="shareToastNative"[\s\S]*?>Share…</, "The sheet should expose familiar close, copy, and native share controls.");
assert.match(source, /id="shareToastStatus" role="status" aria-live="polite"/, "Copy and share outcomes should be announced without interruption.");
assert.match(source, /function showShareToast\(link\)[\s\S]*?shareToast\.hidden = false[\s\S]*?navigator\.share[\s\S]*?navigator\.clipboard\.writeText/, "Opening the sheet should progressively expose native sharing and retain clipboard copy.");
assert.match(source, /function closeShareToast\(\)[\s\S]*?shareToast\.hidden = true[\s\S]*?focusTarget\?\.focus/, "Closing should hide the sheet and restore trigger focus.");
assert.match(source, /if \(shareToast\?\.classList\.contains\("show"\)\)[\s\S]*?closeShareToast\(\)/, "Escape should close the active share sheet.");
assert.match(source, /@media \(max-width: 600px\)[\s\S]*?#shareToast \{ align-items: flex-end; padding: 0; \}[\s\S]*?\.share-sheet-actions button \{ min-height: 52px; \}/, "Phones should receive an in-bounds bottom sheet with generous actions.");
assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*shareToast\.classList\.remove\("show"\)/, "The share sheet must not disappear before a light user finishes with it.");

console.log("Share journey contract: persistent responsive sheet, clear actions, feedback, and focus recovery passed.");
