import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

const buttonTags = legacyHtml.match(/<button\b[^>]*>/gi) ?? [];
assert.ok(buttonTags.length > 0, "Expected legacy maps HTML to contain buttons.");

const buttonsWithoutExplicitType = buttonTags.filter((tag) => !/\btype=(["'])(?:button|submit|reset)\1/i.test(tag));

assert.deepEqual(
  buttonsWithoutExplicitType,
  [],
  "All legacy maps buttons should declare an explicit type so UI controls never submit nearby forms by default.",
);

console.log("Button type safety checks passed.");
