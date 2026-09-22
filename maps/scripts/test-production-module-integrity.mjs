import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const productionJsRoot = resolve(repoRoot, "js");
const productionHtml = (await readdir(repoRoot))
  .filter((name) => extname(name) === ".html")
  .map((name) => resolve(repoRoot, name));
const productionModules = (await readdir(productionJsRoot))
  .filter((name) => extname(name) === ".js")
  .map((name) => resolve(productionJsRoot, name));

assert.ok(productionModules.length > 0, "Expected production JavaScript modules to validate.");

const importPattern = /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g;
const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
const missingImports = [];
const checkedImports = [];

for (const modulePath of productionModules) {
  execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
  const source = await readFile(modulePath, "utf8");
  for (const match of source.matchAll(importPattern)) {
    if (!match[1].startsWith(".")) continue;
    const target = resolve(dirname(modulePath), match[1]);
    checkedImports.push(target);
    if (!existsSync(target)) missingImports.push(`${modulePath} -> ${match[1]}`);
  }
}

const missingScripts = [];
let referencedScripts = 0;
for (const htmlPath of productionHtml) {
  const source = await readFile(htmlPath, "utf8");
  for (const match of source.matchAll(scriptPattern)) {
    const src = match[1].split("?")[0];
    if (/^(?:https?:)?\/\//.test(src)) continue;
    referencedScripts += 1;
    const target = resolve(repoRoot, src.replace(/^\//, ""));
    if (!existsSync(target)) missingScripts.push(`${htmlPath} -> ${src}`);
  }
}

assert.deepEqual(missingImports, [], `Missing local module imports:\n${missingImports.join("\n")}`);
assert.deepEqual(missingScripts, [], `Missing production scripts:\n${missingScripts.join("\n")}`);
assert.ok(checkedImports.length > 0, "Expected at least one local production module import.");
assert.ok(referencedScripts > 0, "Expected at least one production HTML script reference.");

console.log(
  `Production module integrity passed: ${productionModules.length} modules parsed, `
  + `${checkedImports.length} local imports and ${referencedScripts} HTML script references resolved.`,
);
