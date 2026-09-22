import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");
const complex = readFileSync(new URL("../fixtures/interoperability/complex-styled-multigeometry.kml", import.meta.url), "utf8");
const malformed = readFileSync(new URL("../fixtures/interoperability/malformed-kml-coordinate.kml", import.meta.url), "utf8");

assert.match(complex, /<MultiGeometry>/);
assert.match(complex, /<SimpleData name="unicode_owner">Montréal α<\/SimpleData>/);
assert.match(complex, /<SimpleData name="field_12">A12<\/SimpleData>/);
assert.match(complex, /<innerBoundaryIs>/);
assert.match(complex, /<color>99ff8c42<\/color>/);
assert.match(malformed, /not-a-longitude,51\.0497/);

assert.match(source, /coordinate \$\{tupleIndex \+ 1\} is invalid\. Use longitude,latitude values in WGS84/);
assert.match(source, /Array\.from\(placemark\.getElementsByTagName\("SimpleData"\)\)/);
assert.match(source, /properties\.kml_style_color = kmlColor/);
assert.match(source, /properties\.symbol_color = symbolColor/);
assert.match(source, /KML placemark \$\{placemarkIndex \+ 1\}, line \$\{geometryIndex \+ 1\}/);
assert.match(source, /properties: \{ \.\.\.properties \}/);

console.log("KML coordinate, attribute, style, and multigeometry integrity checks passed.");
