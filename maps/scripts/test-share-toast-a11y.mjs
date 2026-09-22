import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

const shareLinkInput = legacyHtml.match(/<input\b[^>]*\bid="shareToastInput"[^>]*>/i)?.[0] ?? "";

assert.ok(shareLinkInput, "Expected the share toast link field to exist.");
assert.match(shareLinkInput, /\baria-label="Share link"/i, "The share toast link field should have an accessible name.");
assert.match(shareLinkInput, /\breadonly\b/i, "The generated share link should remain read-only.");

console.log("Share toast accessibility checks passed.");
