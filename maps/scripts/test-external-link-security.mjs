import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

const targetBlankAnchorPattern = /<a\b[^>]*\btarget=(["'])_blank\1[^>]*>/gi;
const targetBlankAnchors = legacyHtml.match(targetBlankAnchorPattern) || [];

assert.ok(targetBlankAnchors.length > 0, "Expected at least one external target=_blank anchor to check.");

for (const anchor of targetBlankAnchors) {
  assert.match(anchor, /\brel=(["'])[^"']*\bnoopener\b[^"']*\bnoreferrer\b[^"']*\1/i);
}
