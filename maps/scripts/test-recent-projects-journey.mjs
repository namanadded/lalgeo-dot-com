import fs from "node:fs";
import path from "node:path";

const htmlPath = path.resolve("public/legacy/lalgeosurvey.html");
const html = fs.readFileSync(htmlPath, "utf8");

const checks = [
  [html.includes('id="recentProjectList"') && html.includes('aria-label="Recent projects"'), "missing the named recent-project list"],
  [html.includes("const sortedProjects = [...workspaceProjects].sort"), "recent projects must be ordered by update time"],
  [html.includes("sortedProjects.slice(0, 4)") && html.includes("Show ${remainingProjects.length} more project"), "long histories must use progressive disclosure"],
  [html.includes("formatProjectRecency(project?.metadata?.updatedAt)"), "project rows must explain recency"],
  [html.includes("layerCount === 1") && html.includes("getStorageLabel(project)"), "project rows must distinguish layer count and storage"],
  [html.includes('data-open-recent-project="${escapeHtml(project.id)}"'), "each recent project must have a direct open action"],
  [html.includes('aria-current="true"') && html.includes('${isCurrent ? "Current" : "Open"}'), "the current project must be visibly identified"],
  [html.includes('recentProjectList?.addEventListener("click"'), "recent project actions must be handled"],
  [html.includes('setProjectStatus(`Opened ${selected.name}.`, "success")'), "opening a project must expose a success state"],
  [/\.recent-project-open\s*\{[\s\S]*?min-height:\s*44px;/.test(html), "recent project actions must meet the 44px touch target"],
  [/\.recent-project-name\s*\{[\s\S]*?text-overflow:\s*ellipsis;/.test(html), "long duplicate-prone names must stay in bounds"],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("Recent projects journey regression checks passed.");
