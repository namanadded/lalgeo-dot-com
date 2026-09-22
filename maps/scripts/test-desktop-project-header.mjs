import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const htmlPath = path.resolve(process.cwd(), "public/legacy/lalgeosurvey.html");
const html = fs.readFileSync(htmlPath, "utf8");

function assertMatch(pattern, message) {
    if (!pattern.test(html)) {
        throw new Error(message);
    }
}

assertMatch(
    /<span id="toolbarProjectMeta">Project<\/span>[\s\S]*?<strong id="toolbarProjectName">No Project Open<\/strong>/,
    "Desktop header must preserve the Project label and current project name hierarchy."
);
assertMatch(
    /id="renameProjectBtn"[\s\S]*?aria-label="Rename project"[\s\S]*?title="Rename project"/,
    "Rename project must remain an accessible icon-only action."
);
assertMatch(
    /\/\* Desktop project title bar:[\s\S]*?@media \(min-width: 601px\) \{[\s\S]*?#toolbar \{[\s\S]*?grid-template-rows: 36px;[\s\S]*?row-gap: 0;[\s\S]*?border-radius: 0;/,
    "Desktop header must use a compact single-row, full-width title-bar treatment."
);
assertMatch(
    /#toolbar \.toolbar-project-mini > span \{[\s\S]*?font-size: 9px;[\s\S]*?font-weight: 650;/,
    "Project context must remain visually secondary."
);
assertMatch(
    /#toolbar \.toolbar-project-title-row \{[\s\S]*?width: fit-content;[\s\S]*?margin: 0 auto;/,
    "Project name must remain optically centered independently of the rename action."
);
assertMatch(
    /#toolbar \.toolbar-project-rename \{[\s\S]*?position: absolute;[\s\S]*?left: calc\(100% \+ 3px\);/,
    "Rename action must sit immediately beside the centered project name."
);
assertMatch(
    /#toolbar \.toolbar-project-rename:focus-visible \{[\s\S]*?outline: 2px solid var\(--map-ui-focus/,
    "Rename action must retain a visible keyboard focus treatment."
);
assertMatch(
    /#toolbar \.toolbar-quick-actions \{[\s\S]*?top: 48px;[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\);/,
    "Desktop toolbar must keep an intentional gap and remain centered on the map viewport."
);

console.log("Desktop project header checks passed.");
