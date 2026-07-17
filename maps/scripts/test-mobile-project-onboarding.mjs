import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("public/legacy/lalgeosurvey.html");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  ["editing coach is announced as a polite status", /id="workspaceHint"[^>]*role="status"[^>]*aria-live="polite"/],
  ["editing coach has a named dismiss button", /id="workspaceHintCloseBtn"[^>]*type="button"[^>]*aria-label="Dismiss editing tip"/],
  ["dismiss button hides the editing coach", /workspaceHintCloseBtn\?\.addEventListener\("click",\s*hideWorkspaceHint\)/],
  ["mobile coach clears the persistent table control", /@media \(max-width: 600px\)[\s\S]*?#workspaceHint\s*\{[\s\S]*?bottom:\s*calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\)/],
  ["mobile dismiss target is at least 44 pixels", /\.workspace-hint-close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/],
  ["coach positioning is no longer trapped in inline styles", /id="workspaceHint"(?![^>]*style=)/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL: ${label}`));
  process.exit(1);
}

checks.forEach(([label]) => console.log(`PASS: ${label}`));
