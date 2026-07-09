import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const legacyHtmlPath = resolve(__dirname, "../public/legacy/lalgeosurvey.html");
const legacyHtml = readFileSync(legacyHtmlPath, "utf8");

function assertContains(pattern, message) {
  assert.match(legacyHtml, pattern, message);
}

assertContains(
  /function createToolbarButtonViewModel\(\{ key, element, group = "", role = "button" \}\)/,
  "Toolbar buttons should use reusable button view models.",
);
assertContains(
  /function createToolbarComponent\(\{ key, root, groups = \{\}, buttons = \{\}, controls = \{\} \}\)/,
  "Toolbars should be represented by reusable component objects.",
);

assertContains(
  /const topToolbarComponent = createToolbarComponent\(\{[\s\S]*?key: "top-toolbar"[\s\S]*?root: toolbar[\s\S]*?menuCommands: document\.getElementById\("toolbarMenuCommands"\)[\s\S]*?quickActions: document\.getElementById\("quickActionBar"\)[\s\S]*?searchShell: toolbarSearchShell/s,
  "Top toolbar should be separated into a reusable component with groups and controls.",
);
assertContains(
  /const topToolbarViewModel = \{[\s\S]*?menuBoundaryButtons:[\s\S]*?containsMenuButton\(target\)[\s\S]*?collapseOverflow\(side\)/s,
  "Top toolbar should expose reusable menu boundary and overflow behavior.",
);

assertContains(
  /const editingToolbarComponent = createToolbarComponent\(\{[\s\S]*?key: "editing-toolbar"[\s\S]*?root: editFloatingPanel[\s\S]*?layerSelect: editPanelLayerSelect[\s\S]*?selectedBadge: editPanelSelectedBadge/s,
  "Editing toolbar should be separated into a reusable component.",
);
assertContains(
  /const layerToolbarComponent = createToolbarComponent\(\{[\s\S]*?key: "layer-toolbar"[\s\S]*?root: layerToolsPanel[\s\S]*?layerSelect: layerToolsLayerSelect/s,
  "Layer toolbar should share the contextual toolbar component structure.",
);
assertContains(
  /const contextualToolbarComponents = \[editingToolbarComponent, layerToolbarComponent\]/,
  "Contextual toolbars should be registered together for future toolbar additions.",
);
assertContains(
  /function getDockedToolbars\(\) \{\s*return contextualToolbarViewModel\.visibleDockedPanels\(\);\s*\}/,
  "Docking should use the contextual toolbar registry instead of hard-coded panels.",
);
assertContains(
  /contextualToolbarComponents\.forEach\(\(component\) => installToolbarTooltipEvents\(component\.root\)\)/,
  "Toolbar tooltip events should install through contextual toolbar components.",
);
assertContains(
  /const onToolbarMenuButton = topToolbarViewModel\.containsMenuButton\(event\.target\)/,
  "Global toolbar menu dismissal should use the top toolbar view model.",
);

console.log("Toolbar architecture checks passed.");
