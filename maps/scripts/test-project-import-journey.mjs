import fs from "node:fs";
import path from "node:path";

const htmlPath = path.resolve("public/legacy/lalgeosurvey.html");
const html = fs.readFileSync(htmlPath, "utf8");

const checks = [
  [html.includes('id="projectImportDropTarget"'), "missing the project import drop target"],
  [html.includes('id="projectPickerBtn"') && html.includes("Choose files"), "missing the file picker choice"],
  [html.includes('id="projectFolderPickerBtn"') && html.includes("Choose folder"), "missing the folder picker choice"],
  [/id="projectFileInput"[^>]*multiple[^>]*aria-describedby="projectImportFormatHelp"/.test(html), "file picker must support related multi-file imports and describe formats"],
  [/id="projectFolderInput"[^>]*webkitdirectory/.test(html), "folder selection must use a separate directory input"],
  [html.includes("importSelectedProjectFiles(files)"), "file and drop imports must share one status-aware handler"],
  [html.includes('projectImportDropTarget?.addEventListener("drop"'), "drop target must import dropped files"],
  [html.includes('setProjectStatus(`Importing ${files.length} item${files.length === 1 ? "" : "s"}…`)'), "import must expose a loading state"],
  [/#importPanel #importPanelClose\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/.test(html), "mobile close control must have a 44px target"],
  [html.includes("LalGeo, ZIP, CSV, GeoJSON, KML, KMZ, GPX, shapefiles, and photos."), "supported formats must be visible in the import journey"],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("Project import journey regression checks passed.");
