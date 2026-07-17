import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("public/legacy/lalgeosurvey.html");
const source = fs.readFileSync(sourcePath, "utf8");

const helper = source.match(/function startDropboxAuthorization\(\) \{([\s\S]*?)\n        \}/)?.[1] ?? "";
if (!helper) {
  console.error("FAIL: Dropbox authorization helper is missing");
  process.exit(1);
}

const checks = [
  ["embedded maps use the wrapper URL as the OAuth return target", /window\.top && window\.top !== window[\s\S]*?document\.referrer \|\| window\.location\.href/],
  ["embedded maps navigate the top-level window", /window\.top\.location\.href = authorizationUrl/],
  ["standalone maps retain a same-window fallback", /window\.location\.href = authorizationUrl/],
  ["connect action uses the shared authorization helper", /connectDropboxBtn\?\.addEventListener\("click",[\s\S]*?startDropboxAuthorization\(\)/],
  ["delegated workspace actions do not duplicate the connect-button redirect", /button\.id === "emptyConnectDropboxBtn" \|\| button\.id === "drawerConnectDropboxBtn"/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL: ${label}`));
  process.exit(1);
}

checks.forEach(([label]) => console.log(`PASS: ${label}`));
