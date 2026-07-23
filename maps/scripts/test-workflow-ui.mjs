import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /id="workspaceCreateModal"[\s\S]*?<h3 id="createProjectTitle">New Project<\/h3>[\s\S]*?<label for="createProjectName">Name<\/label>[\s\S]*?<label for="createLayerName">First layer<\/label>[\s\S]*?<summary>[\s\S]*?<span>More options<\/span>/, "New Project should show only essential fields before optional settings.");
assert.match(source, /id="layerImportModal"[\s\S]*?<h3>Import Layer<\/h3>[\s\S]*?<summary>Import from URL<\/summary>[\s\S]*?<summary>Supported Formats<\/summary>[\s\S]*?id="layerImportPickerBtn"[^>]*>Choose File<\/button>/, "Layer import should lead with file selection and progressively disclose URL help.");
assert.match(source, /<h3>Projects<\/h3>[\s\S]*?<summary>Share &amp; Export<\/summary>[\s\S]*?id="downloadProjectBtn"[^>]*>Export Project<\/button>[\s\S]*?<summary>Dropbox<\/summary>[\s\S]*?<summary>Project Files<\/summary>/, "Project management should group secondary tools into short disclosures.");
assert.match(source, /id="shareMapBtn"[^>]*>[\s\S]*?<span>Share Link<\/span>[\s\S]*?id="menuExportPdfBtn"[^>]*>[\s\S]*?<span>Export Map…<\/span>[\s\S]*?id="printButton"[^>]*>[\s\S]*?<span>Print…<\/span>/, "Desktop export actions should use concise platform-style labels.");
assert.match(source, /\.workflow-disclosure > summary\s*\{[\s\S]*?min-height:\s*48px;[\s\S]*?-webkit-tap-highlight-color:\s*transparent;/, "Disclosure rows should keep large, touch-friendly targets.");
assert.match(source, /#importPanel \.workspace-primary-btn,[\s\S]*?background:\s*#007aff;[\s\S]*?color:\s*#fff;/, "Primary workflow actions should use a clear Apple-like blue hierarchy.");

console.log("Workflow UI checks passed.");
