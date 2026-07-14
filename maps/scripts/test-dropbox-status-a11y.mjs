import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

const statusTag = legacyHtml.match(/<span\b[^>]*\bid="dropboxConnectStatus"[^>]*>/i)?.[0] ?? "";

assert.ok(statusTag, "Expected the Dropbox connection status element to exist.");
assert.match(statusTag, /\brole="status"/i, "Dropbox connection updates should be exposed as a status message.");
assert.match(statusTag, /\baria-live="polite"/i, "Dropbox connection updates should be announced without interrupting users.");

console.log("Dropbox status accessibility checks passed.");
