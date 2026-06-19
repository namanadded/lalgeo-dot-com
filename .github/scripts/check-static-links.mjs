import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlFiles = readdirSync(root)
  .filter((file) => file.endsWith(".html"))
  .map((file) => path.join(root, file));

const attributes = /\b(?:href|src)=["']([^"']+)["']/gi;
const skippedProtocols = /^(?:https?:|mailto:|tel:|javascript:|data:|blob:|#)/i;
const missing = [];

function stripQueryAndHash(value) {
  return value.split("#")[0].split("?")[0];
}

function isRouteOnly(value) {
  return value.startsWith("/") && !path.extname(value);
}

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(attributes)) {
    const rawTarget = match[1].trim();
    const target = stripQueryAndHash(rawTarget);

    if (!target || target.includes("${") || skippedProtocols.test(target) || isRouteOnly(target)) {
      continue;
    }

    const resolved = target.startsWith("/")
      ? path.join(root, target)
      : path.join(path.dirname(file), target);

    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      missing.push(`${path.relative(root, file)} -> ${rawTarget}`);
    }
  }
}

if (missing.length) {
  console.error("Missing local static links:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Checked local static links in ${htmlFiles.length} HTML files.`);
