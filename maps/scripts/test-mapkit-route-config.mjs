import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

const routeSource = readFileSync(join(cwd(), "app/render/lalgeosurvey/route.ts"), "utf8");
const legacyHtml = readFileSync(join(cwd(), "public/legacy/lalgeosurvey.html"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const legacyTokenAssignment =
  /window\.lalgeoMapkitToken = window\.location\.hostname\.includes\("lalgeo\.ca"\)[\s\S]*?;\n    if \(window\.lalgeoMapkitToken\)/;

const matches = [...legacyHtml.matchAll(new RegExp(legacyTokenAssignment.source, "g"))];

assert(matches.length === 1, "legacy MapKit token assignment must match exactly once");
assert(routeSource.includes("MAPKIT_TOKEN"), "route should support the server-only MAPKIT_TOKEN override");
assert(routeSource.includes("NEXT_PUBLIC_MAPKIT_TOKEN"), "route should support the public MapKit token override");
assert(
  routeSource.includes('readFile(path.join(process.cwd(), "public/legacy/lalgeosurvey.html"), "utf8")'),
  "route should load its own bundled legacy shell"
);
assert(routeSource.includes("maps.lalgeo.com"), "route should special-case the production maps domain");
assert(
  routeSource.includes("MapKit token is not configured for maps.lalgeo.com"),
  "route should expose a clear production-domain token configuration error"
);
assert(
  routeSource.includes("TOKEN_ASSIGNMENT_PATTERN") && routeSource.includes("source.replace"),
  "route should replace the legacy token assignment before serving the shell"
);
assert(
  !routeSource.includes("await fetch("),
  "route must not fetch another deployment or require an HTTP round trip"
);
assert(
  !routeSource.includes('process.env.URL || "https://maps.lalgeo.com"'),
  "deploy previews must not fall back directly to the production legacy shell"
);

console.log("MapKit route configuration checks passed.");

const nextConfig = readFileSync(join(cwd(), "next.config.js"), "utf8");
assert(nextConfig.includes('"/render/lalgeosurvey": ["./public/legacy/lalgeosurvey.html"]'), "server bundle must include the legacy shell");
