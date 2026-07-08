import { readFileSync } from "node:fs";
import path from "node:path";

const htmlPath = path.join(process.cwd(), "public", "legacy", "lalgeosurvey.html");
const html = readFileSync(htmlPath, "utf8");

const failures = [];

function getTagById(id) {
  return html.match(new RegExp(`<button[^>]+id="${id}"[^>]*>`))?.[0] ?? "";
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) {
    failures.push(message);
  }
}

const disclosureControls = [
  {
    buttonId: "menuToolbarsBtn",
    panelId: "menuToolbarsList",
    label: "Toolbars menu",
  },
  {
    buttonId: "menuMapTypeBtn",
    panelId: "menuMapTypeList",
    label: "Map type menu",
  },
];

for (const control of disclosureControls) {
  const buttonTag = getTagById(control.buttonId);
  if (!buttonTag) {
    failures.push(`${control.label} disclosure button must exist.`);
    continue;
  }
  assertContains(
    buttonTag,
    new RegExp(`\\baria-controls="${control.panelId}"`),
    `${control.label} disclosure button must identify its controlled submenu.`,
  );
  assertContains(
    buttonTag,
    /\baria-expanded="false"/,
    `${control.label} disclosure button must default to the collapsed state.`,
  );
  assertContains(
    html,
    new RegExp(`<div[^>]+id="${control.panelId}"[^>]+hidden`),
    `${control.label} controlled submenu must default to hidden.`,
  );
}

assertContains(
  html,
  /menuToolbarsBtn\?\.setAttribute\("aria-expanded",\s*expanded\s*\?\s*"true"\s*:\s*"false"\)/,
  "Toolbars menu disclosure must synchronize aria-expanded when toggled.",
);

assertContains(
  html,
  /menuMapTypeBtn\?\.setAttribute\("aria-expanded",\s*expanded\s*\?\s*"true"\s*:\s*"false"\)/,
  "Map type menu disclosure must synchronize aria-expanded when toggled.",
);

if (failures.length) {
  console.error("View menu accessibility checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("View menu accessibility checks passed.");
