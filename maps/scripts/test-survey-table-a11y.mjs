import { readFileSync } from "node:fs";
import path from "node:path";

const htmlPath = path.join(process.cwd(), "public", "legacy", "lalgeosurvey.html");
const html = readFileSync(htmlPath, "utf8");

const failures = [];

function assertMatch(pattern, message) {
  if (!pattern.test(html)) {
    failures.push(message);
  }
}

const surveyTableToggleTag = html.match(/<button[^>]+id="surveyTableToggle"[^>]*>/)?.[0] ?? "";

if (!/\baria-controls="surveyTableWrapper"/.test(surveyTableToggleTag)) {
  failures.push("Survey table toggle must expose the controlled table wrapper.");
}

if (!/\baria-expanded="false"/.test(surveyTableToggleTag)) {
  failures.push("Survey table toggle must default to the collapsed state.");
}

assertMatch(
  /function\s+setSurveyTableToggleState\s*\(\s*isOpen\s*\)\s*{[\s\S]*?surveyTableToggle\.setAttribute\("aria-expanded",\s*isOpen\s*\?\s*"true"\s*:\s*"false"\)/,
  "Survey table toggle state helper must synchronize aria-expanded.",
);

assertMatch(
  /const\s+isOpen\s*=\s*surveyTablePanel\.classList\.toggle\("open"\);[\s\S]*?setSurveyTableToggleState\(isOpen\);/,
  "Survey table click handler must update the ARIA state with the visual open state.",
);

if (failures.length) {
  console.error("Survey table accessibility checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Survey table accessibility checks passed.");
