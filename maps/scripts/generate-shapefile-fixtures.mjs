import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/interoperability");
const scratchDir = mkdtempSync(resolve(tmpdir(), "lalgeo-shapefile-fixtures-"));

const points = [
  { lon: -114.0719, lat: 51.0447, name: "Café rivière", inspected: "20260727", nullable: "", fields: Array.from({ length: 12 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`) },
  { lon: -73.5673, lat: 45.5019, name: "Montréal α", inspected: "20260203", nullable: "present", fields: Array.from({ length: 12 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`) }
];

function webMercator({ lon, lat }) {
  const x = lon * 20037508.34 / 180;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  return { x, y };
}

function makeShp(records) {
  const projected = records.map(webMercator);
  const bytes = Buffer.alloc(100 + projected.length * 28);
  const xmin = Math.min(...projected.map(({ x }) => x));
  const ymin = Math.min(...projected.map(({ y }) => y));
  const xmax = Math.max(...projected.map(({ x }) => x));
  const ymax = Math.max(...projected.map(({ y }) => y));
  bytes.writeInt32BE(9994, 0);
  bytes.writeInt32BE(bytes.length / 2, 24);
  bytes.writeInt32LE(1000, 28);
  bytes.writeInt32LE(1, 32);
  [xmin, ymin, xmax, ymax].forEach((value, index) => bytes.writeDoubleLE(value, 36 + index * 8));
  projected.forEach(({ x, y }, index) => {
    const offset = 100 + index * 28;
    bytes.writeInt32BE(index + 1, offset);
    bytes.writeInt32BE(10, offset + 4);
    bytes.writeInt32LE(1, offset + 8);
    bytes.writeDoubleLE(x, offset + 12);
    bytes.writeDoubleLE(y, offset + 20);
  });
  return bytes;
}

function makeShx(records, shpLength) {
  const bytes = Buffer.alloc(100 + records.length * 8);
  makeShp(records).copy(bytes, 0, 0, 100);
  bytes.writeInt32BE(bytes.length / 2, 24);
  records.forEach((_record, index) => {
    bytes.writeInt32BE((100 + index * 28) / 2, 100 + index * 8);
    bytes.writeInt32BE(10, 104 + index * 8);
  });
  return bytes;
}

const dbfFields = [
  ["NAME", "C", 48],
  ["INSPECTED", "D", 8],
  ["NULLABLE", "C", 16],
  ...Array.from({ length: 12 }, (_, index) => [`FIELD_${String(index + 1).padStart(2, "0")}`, "C", 8])
];

function writeDbfValue(target, offset, length, value) {
  target.fill(0x20, offset, offset + length);
  Buffer.from(String(value), "utf8").copy(target, offset, 0, length);
}

function makeDbf(records) {
  const headerLength = 32 + dbfFields.length * 32 + 1;
  const recordLength = 1 + dbfFields.reduce((sum, [, , length]) => sum + length, 0);
  const bytes = Buffer.alloc(headerLength + records.length * recordLength + 1);
  bytes[0] = 0x03;
  bytes[1] = 126;
  bytes[2] = 7;
  bytes[3] = 27;
  bytes.writeUInt32LE(records.length, 4);
  bytes.writeUInt16LE(headerLength, 8);
  bytes.writeUInt16LE(recordLength, 10);
  dbfFields.forEach(([name, type, length], index) => {
    const offset = 32 + index * 32;
    Buffer.from(name, "ascii").copy(bytes, offset, 0, 11);
    bytes[offset + 11] = type.charCodeAt(0);
    bytes[offset + 16] = length;
  });
  bytes[headerLength - 1] = 0x0d;
  records.forEach((record, recordIndex) => {
    let offset = headerLength + recordIndex * recordLength;
    bytes[offset++] = 0x20;
    const values = [record.name, record.inspected, record.nullable, ...record.fields];
    dbfFields.forEach(([, , length], fieldIndex) => {
      writeDbfValue(bytes, offset, length, values[fieldIndex]);
      offset += length;
    });
  });
  bytes[bytes.length - 1] = 0x1a;
  return bytes;
}

const shp = makeShp(points);
const files = {
  "complex-web-mercator.shp": shp,
  "complex-web-mercator.shx": makeShx(points, shp.length),
  "complex-web-mercator.dbf": makeDbf(points),
  "complex-web-mercator.prj": 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","3857"]]',
  "complex-web-mercator.cpg": "UTF-8"
};

for (const [name, contents] of Object.entries(files)) writeFileSync(resolve(scratchDir, name), contents);

function zipFixture(name, members) {
  const target = resolve(fixtureDir, name);
  execFileSync("/usr/bin/zip", ["-q", "-j", target, ...members.map((member) => resolve(scratchDir, member))]);
}

zipFixture("complex-web-mercator.zip", Object.keys(files));
zipFixture("projected-missing-prj.zip", Object.keys(files).filter((name) => !name.endsWith(".prj")));
zipFixture("missing-attributes.zip", Object.keys(files).filter((name) => !name.endsWith(".dbf")));
rmSync(scratchDir, { recursive: true, force: true });
