import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtml = readFileSync(
  resolve(__dirname, "../public/legacy/lalgeosurvey.html"),
  "utf8",
);

const searchInput = legacyHtml.match(
  /<input\b[^>]*\bid=["']searchInput["'][^>]*>/i,
)?.[0];

assert.ok(searchInput, "Expected the primary maps search input to exist.");
assert.match(searchInput, /\brole=["']combobox["']/i);
assert.match(searchInput, /\baria-autocomplete=["']list["']/i);
assert.match(searchInput, /\baria-controls=["']searchResultsList["']/i);
assert.match(searchInput, /\baria-expanded=["']false["']/i);
assert.match(searchInput, /\baria-activedescendant=["']/i);
assert.match(searchInput, /\baria-describedby=["']searchStatus["']/i);
assert.match(searchInput, /\bautocomplete=["']off["']/i);

assert.match(
  legacyHtml,
  /id=["']searchStatus["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/i,
  "Expected search progress and outcome messages to use a polite live status.",
);
assert.match(legacyHtml, /resultsList\.id = ["']searchResultsList["']/);
assert.match(legacyHtml, /resultsList\.setAttribute\(["']role["'], ["']listbox["']\)/);
assert.match(legacyHtml, /li\.setAttribute\(["']role["'], ["']option["']\)/);
assert.match(legacyHtml, /li\.setAttribute\(["']aria-selected["'], ["']false["']\)/);

for (const key of ["ArrowDown", "ArrowUp", "Escape", "Enter"]) {
  assert.match(
    legacyHtml,
    new RegExp(`e\\.key === ["']${key}["']`),
    `Expected keyboard handling for ${key}.`,
  );
}

assert.match(
  legacyHtml,
  /setSearchStatus\(["']Searching…["']\)/,
  "Expected a useful loading state.",
);
assert.match(
  legacyHtml,
  /No places found\. Try a different name or address\./,
  "Expected a useful empty state.",
);
assert.match(
  legacyHtml,
  /Search is unavailable right now\. Try again\./,
  "Expected a useful error state.",
);
assert.match(
  legacyHtml,
  /\.search-result-option\s*\{[\s\S]*?min-height:\s*48px;/,
  "Expected touch-safe search result rows.",
);
assert.match(
  legacyHtml,
  /@media \(max-width: 700px\)[\s\S]*?#searchResultsList[\s\S]*?max-height:\s*min\(52dvh,\s*420px\)/,
  "Expected a bounded mobile suggestions surface.",
);

console.log("Search journey checks passed.");
