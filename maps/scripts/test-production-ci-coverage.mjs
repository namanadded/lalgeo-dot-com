import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mapsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(mapsRoot, "..");
const packageJson = JSON.parse(await readFile(resolve(mapsRoot, "package.json"), "utf8"));
const workflow = await readFile(resolve(repoRoot, ".github/workflows/production-ci.yml"), "utf8");

const testScripts = Object.keys(packageJson.scripts)
  .filter((name) => name.startsWith("test:"))
  .sort();
const workflowCommands = [...workflow.matchAll(/^\s*run:\s+npm run (test:[\w-]+)\s*$/gm)]
  .map((match) => match[1]);
const commandCounts = new Map();

for (const command of workflowCommands) {
  commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1);
}

const missing = testScripts.filter((name) => !commandCounts.has(name));
const duplicates = [...commandCounts]
  .filter(([name, count]) => name in packageJson.scripts && count !== 1)
  .map(([name, count]) => `${name} (${count})`);
const unknown = [...commandCounts.keys()]
  .filter((name) => !(name in packageJson.scripts));

assert.ok(testScripts.length >= 70, "Expected the complete Maps regression inventory.");
assert.deepEqual(missing, [], `Maps tests missing from Production CI:\n${missing.join("\n")}`);
assert.deepEqual(duplicates, [], `Maps tests repeated in Production CI:\n${duplicates.join("\n")}`);
assert.deepEqual(unknown, [], `Production CI references unknown Maps tests:\n${unknown.join("\n")}`);

console.log(`Production CI covers all ${testScripts.length} Maps test scripts exactly once.`);
