import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");

function readZipEntries(path) {
  const bytes = readFileSync(new URL(`../fixtures/interoperability/${path}`, import.meta.url));
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataOffset = offset + 30 + nameLength + extraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    entries.set(name, method === 0 ? compressed : inflateRawSync(compressed));
    offset = dataOffset + compressedSize;
  }
  return entries;
}

function readBounds(bytes) {
  assert.equal(bytes.readInt32BE(0), 9994, "fixture has a valid Shapefile header");
  assert.equal(bytes.readInt32LE(28), 1000, "fixture uses Shapefile version 1000");
  return {
    xmin: bytes.readDoubleLE(36),
    ymin: bytes.readDoubleLE(44),
    xmax: bytes.readDoubleLE(52),
    ymax: bytes.readDoubleLE(60)
  };
}

const complex = readZipEntries("complex-web-mercator.zip");
assert.deepEqual(
  [...complex.keys()].sort(),
  ["complex-web-mercator.cpg", "complex-web-mercator.dbf", "complex-web-mercator.prj", "complex-web-mercator.shp", "complex-web-mercator.shx"],
  "complex fixture contains a complete projected Shapefile"
);
assert.equal(complex.get("complex-web-mercator.cpg").toString("utf8"), "UTF-8");
assert.match(complex.get("complex-web-mercator.prj").toString("utf8"), /EPSG","3857/);
const bounds = readBounds(complex.get("complex-web-mercator.shp"));
assert.ok(Math.abs(bounds.xmin) > 180 && Math.abs(bounds.ymin) > 90, "complex fixture requires CRS transformation");

const missingPrj = readZipEntries("projected-missing-prj.zip");
assert.ok(![...missingPrj.keys()].some((name) => name.endsWith(".prj")), "missing-PRJ fixture omits its projection");
assert.ok([...missingPrj.keys()].some((name) => name.endsWith(".dbf")), "missing-PRJ fixture retains attributes");

const missingAttributes = readZipEntries("missing-attributes.zip");
assert.ok(![...missingAttributes.keys()].some((name) => name.endsWith(".dbf")), "missing-DBF fixture omits its attribute table");
assert.ok([...missingAttributes.keys()].some((name) => name.endsWith(".prj")), "missing-DBF fixture retains its projection");

assert.match(source, /Shapefile ZIP contains more than one \.shp dataset/);
assert.match(source, /missing its matching \.dbf attribute table/);
assert.match(source, /appears to use projected coordinates but has no \.prj file/);
assert.match(source, /coordinates could not be transformed to WGS84/);
assert.match(source, /value instanceof Date/);
assert.match(source, /normalizeShapefileAttributeValues\(assertGeoJsonUsesWgs84\(parsed\)\)/);

console.log("Shapefile completeness and CRS integrity checks passed.");
