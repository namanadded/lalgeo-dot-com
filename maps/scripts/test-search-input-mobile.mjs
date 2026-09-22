import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

const searchInput = legacyHtml.match(/<input\b[^>]*\bid=["']searchInput["'][^>]*>/i)?.[0];

assert.ok(searchInput, "Expected the primary maps search input to exist.");
assert.match(
  searchInput,
  /\binputmode=["']search["']/i,
  "Expected the maps search input to request a mobile search keyboard.",
);
assert.match(
  searchInput,
  /\benterkeyhint=["']search["']/i,
  "Expected the maps search input to label the mobile Enter key as Search.",
);

console.log("Mobile search input checks passed.");
