import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../public/legacy/lalgeosurvey.html"), "utf8");
const parserStart = html.indexOf("function tokenizeLayerSqlFilter");
const parserEnd = html.indexOf("function getLayerSqlFilterCompilation");

assert.ok(parserStart >= 0 && parserEnd > parserStart, "SQL filter parser should be present.");

const context = {};
vm.createContext(context);
vm.runInContext(
  `${html.slice(parserStart, parserEnd)}\nglobalThis.compileLayerSqlFilter = compileLayerSqlFilter;`,
  context,
);

const layer = {
  schema: ["Status", "Priority", "Name", "Asset Type", "Notes"].map((name) => ({ name })),
};
const rows = [
  { Status: "Open", Priority: 4, Name: "Central Park", "Asset Type": "Hydrant", Notes: "" },
  { Status: "Review", Priority: 2, Name: "North Gate", "Asset Type": "Valve", Notes: null },
  { Status: "Closed", Priority: 1, Name: "Depot", "Asset Type": "Hydrant", Notes: "done" },
];

const matches = (query) => rows.filter(context.compileLayerSqlFilter(query, layer).predicate);

assert.equal(matches("Status = 'Open' AND Priority >= 3").length, 1);
assert.equal(matches("WHERE Name LIKE '%park%'").length, 1);
assert.equal(matches("Status IN ('Open', 'Review')").length, 2);
assert.equal(matches("Priority BETWEEN 2 AND 4").length, 2);
assert.equal(matches("Notes IS NULL").length, 2);
assert.equal(matches("NOT (Status = 'Closed' OR Priority < 2)").length, 2);
assert.equal(matches('"Asset Type" = \'Hydrant\'').length, 2);
assert.equal(matches("Status = 'open'").length, 1, "Text comparisons should be case-insensitive.");
assert.throws(() => context.compileLayerSqlFilter("Missing = 1", layer), /Unknown field/);
assert.throws(() => context.compileLayerSqlFilter("Status = 'Open", layer), /unfinished text value/);
assert.throws(() => context.compileLayerSqlFilter("Status = 'Open'; alert(1)", layer), /unsupported character/);

assert.match(
  html,
  /Feature display filter[\s\S]*?Use a SQL WHERE expression[\s\S]*?id="layerSqlFilterQuery"[\s\S]*?Test filter[\s\S]*?Clear/,
  "Layer Properties should expose the Apple-style SQL filter editor and controls.",
);
assert.match(
  html,
  /getLayerFilteredFeatureEntries\(layer\)[\s\S]*?renderFeatureGeometryOnMap/,
  "Map rendering should use filtered layer feature entries.",
);
assert.match(
  html,
  /layerFilterPredicate[\s\S]*?No features match the active layer filter/,
  "The attribute table should use the layer filter and explain an empty result.",
);
assert.match(
  html,
  /layer\.filterQuery = nextFilterQuery[\s\S]*?scheduleLocalAutosave/,
  "Validated layer filters should persist with the project.",
);

console.log("Layer SQL filter checks passed.");
