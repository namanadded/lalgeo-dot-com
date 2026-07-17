import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

const searchInput = legacyHtml.match(/<input\b[^>]*\bid=["']searchInput["'][^>]*>/i)?.[0];
const closeSearchButton = legacyHtml.match(/<button\b[^>]*\bid=["']collapseSearchBtn["'][^>]*>/i)?.[0];

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
assert.match(searchInput, /aria-controls="searchSuggestions"/, "Search input should expose its suggestions list.");
assert.match(searchInput, /aria-autocomplete="list"/, "Search input should expose list autocomplete semantics.");
assert.ok(closeSearchButton, "Expected a dedicated search close button.");
assert.match(closeSearchButton, /aria-label="Close search"/, "Search close button should use a direct accessible label.");
assert.match(
  legacyHtml,
  /collapseSearchBtn\?\.addEventListener\("click",\s*\(\)\s*=>\s*{[\s\S]*?setSearchExpanded\(false\);[\s\S]*?hideSearchResults\(\);/,
  "Closing search should collapse the field and dismiss suggestions.",
);
assert.match(
  legacyHtml,
  /function positionMobileSidebarBelowSearch\(\)\s*{[\s\S]*?const searchRect = toolbarSearchShell\?\.getBoundingClientRect\(\);[\s\S]*?searchRect\.bottom \+ 10[\s\S]*?sidebar\.style\.top/,
  "Mobile contextual results should be positioned from the rendered search bar instead of a competing fixed offset.",
);

console.log("Mobile search input checks passed.");
