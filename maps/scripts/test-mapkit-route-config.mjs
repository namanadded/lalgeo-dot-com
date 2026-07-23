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
  routeSource.includes("new URL(request.url).origin || process.env.DEPLOY_PRIME_URL || process.env.URL"),
  "route should load the legacy shell from the incoming deployment origin before environment fallbacks"
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
  routeSource.includes("new URL(request.url).origin") && routeSource.includes("DEPLOY_PRIME_URL"),
  "route should load the legacy shell from the incoming deployment before environment fallbacks"
);
assert(
  !routeSource.includes('process.env.URL || "https://maps.lalgeo.com"'),
  "deploy previews must not fall back directly to the production legacy shell"
);

console.log("MapKit route configuration checks passed.");
