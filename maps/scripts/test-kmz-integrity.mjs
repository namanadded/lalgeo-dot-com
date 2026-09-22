import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");

function readZipEntries(path) {
  const bytes = readFileSync(new URL(`../fixtures/interoperability/${path}`, import.meta.url));
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    assert.equal(flags & 0x08, 0, "fixture ZIP stores sizes in local headers");
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataOffset = offset + 30 + nameLength + extraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    entries.set(name, method === 0 ? compressed : inflateRawSync(compressed));
    offset = dataOffset + compressedSize;
  }
  return entries;
}

const functionMatch = source.match(/function selectKmzKmlEntry\(zip\) \{[\s\S]*?^        \}/m);
assert.ok(functionMatch, "KMZ selection helper is present");
const selectKmzKmlEntry = Function(`${functionMatch[0]}; return selectKmzKmlEntry;`)();
const mockZip = (names) => ({
  files: Object.fromEntries(names.map((name) => [name, { dir: false }]))
});

assert.equal(selectKmzKmlEntry(mockZip(["support/preview.kml", "doc.kml"])), "doc.kml");
assert.equal(selectKmzKmlEntry(mockZip(["nested/helper.kml", "survey-main.kml"])), "survey-main.kml");
assert.equal(selectKmzKmlEntry(mockZip(["nested/only.kml"])), "nested/only.kml");
assert.throws(
  () => selectKmzKmlEntry(mockZip(["alpha.kml", "beta.kml"])),
  /Rename the main document to doc\.kml at the archive root/,
  "ambiguous KMZ packages explain how to select the main document"
);
assert.throws(
  () => selectKmzKmlEntry(mockZip(["images/icon.png"])),
  /Add a KML file, preferably named doc\.kml/,
  "KMZ packages without KML explain how to repair the archive"
);

const complex = readZipEntries("complex-main-document.kmz");
assert.deepEqual([...complex.keys()].sort(), ["doc.kml", "support/preview.kml"]);
assert.match(complex.get("doc.kml").toString("utf8"), /Station Été 🌲/);
assert.match(complex.get("doc.kml").toString("utf8"), /field_12/);
assert.match(complex.get("doc.kml").toString("utf8"), /innerBoundaryIs/);
assert.match(complex.get("support\/preview.kml").toString("utf8"), /must not replace doc\.kml/);

const ambiguous = readZipEntries("ambiguous-main-document.kmz");
assert.deepEqual([...ambiguous.keys()].sort(), ["alpha.kml", "beta.kml"]);

assert.match(source, /const kmlEntryName = selectKmzKmlEntry\(zip\)/);
console.log("KMZ main-document and fixture integrity checks passed.");
