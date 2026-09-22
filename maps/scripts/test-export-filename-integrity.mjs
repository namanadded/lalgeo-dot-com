import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const fixture = JSON.parse(readFileSync(new URL("../fixtures/interoperability/complex-export-filenames.lal", import.meta.url), "utf8"));

const context = vm.createContext({ Set });
const helperStart = source.indexOf("function portableExportStem(");
const helperEnd = source.indexOf("function downloadTextFile(", helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, "portable export helper block is present");
vm.runInContext(source.slice(helperStart, helperEnd), context);

assert.equal(context.portableExportFilename("Field/Assets", { extension: ".geojson" }), "Field-Assets.geojson");
assert.equal(context.portableExportFilename("CON", { extension: ".csv" }), "_CON.csv");
assert.equal(context.portableExportFilename("../", { fallback: "layer", extension: ".geojson" }), "layer.geojson");
assert.equal(context.portableExportFilename("Rivière 漢字.geojson", { extension: ".geojson" }), "Rivière 漢字.geojson");
assert(!/[\\/:*?"<>|]/.test(context.portableExportStem(fixture.project.name)), "project filename excludes filesystem separators and reserved characters");

const usedPaths = new Set();
const layerPaths = fixture.project.layers.map((layer) => context.uniquePortableZipPath("layers", layer.name, {
  fallback: "layer",
  extension: ".geojson",
  usedPaths
}));
assert.deepEqual(Array.from(layerPaths), ["layers/Field-Assets.geojson", "layers/Field-Assets (2).geojson", "layers/_CON.geojson"]);
assert.equal(new Set(layerPaths.map((path) => path.toLowerCase())).size, fixture.project.layers.length, "every layer receives a distinct case-insensitive ZIP path");
assert(layerPaths.every((path) => path.startsWith("layers/") && !path.includes("../")), "layer names cannot escape their ZIP directory");

assert.match(source, /const csv = `\\uFEFF\$\{Papa\.unparse/);
assert.match(source, /text\/csv;charset=utf-8/);
assert.match(source, /uniquePortableZipPath\("attachments"/);
assert.match(source, /usedZipPaths\.add\(projectPath\.toLowerCase\(\)\)/);

console.log("Portable export filename, ZIP collision, and UTF-8 CSV integrity checks passed.");
