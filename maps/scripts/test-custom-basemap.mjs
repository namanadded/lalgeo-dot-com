import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.doesNotMatch(
  source,
  /Post_Flood_2013_Ortho|calgary-2013-august|Calgary Aug 2013 Orthophoto/,
  "The example Calgary orthophoto must not be installed as a permanent basemap."
);
assert.match(
  source,
  /id="customBasemapNameInput"[\s\S]*?id="customBasemapUrlInput"[\s\S]*?id="customBasemapAttributionInput"[\s\S]*?id="saveCustomBasemapBtn"/,
  "Settings should provide a reusable custom-basemap editor."
);
assert.match(
  source,
  /function normalizeCustomBasemapTileUrl\(value\)[\s\S]*?\{z\\\}[\s\S]*?\{x\\\}[\s\S]*?\{y\\\}[\s\S]*?\/MapServer[\s\S]*?\/tile\/\{z\}\/\{y\}\/\{x\}/,
  "Custom basemaps should accept XYZ templates and normalize ArcGIS MapServer URLs."
);
assert.match(
  source,
  /function normalizeHttpsUrl\(value, fieldLabel\)[\s\S]*?parsed\.protocol !== "https:"[\s\S]*?parsed\.username = ""[\s\S]*?parsed\.password = ""/,
  "Remote tile and attribution URLs should require HTTPS and discard embedded credentials."
);
assert.match(
  source,
  /function saveCustomBasemap\(\)[\s\S]*?customBasemap: \{ name, sourceUrl, tileUrl, attribution, attributionUrl \}[\s\S]*?scheduleLocalAutosave\(\)[\s\S]*?applyProjectMapType/,
  "A saved definition should persist with the project and become active."
);
assert.match(
  source,
  /new mapkit\.TileOverlay\(customBasemapTileUrl,[\s\S]*?minimumZ: 0,[\s\S]*?maximumZ: 22,[\s\S]*?opacity:/,
  "Custom imagery should load lazily through one MapKit tile overlay."
);
assert.match(
  source,
  /function removeCustomBasemapTileOverlay\(\)[\s\S]*?map\.removeTileOverlay\(customBasemapTileOverlay\)[\s\S]*?customBasemapTileOverlay = null/,
  "Turning off custom imagery should stop its tile overlay work."
);
assert.match(
  source,
  /function handleCustomBasemapTileError\(\)[\s\S]*?customBasemapTileErrorCount < 3[\s\S]*?mapType: "standard"[\s\S]*?Returned to the Standard basemap/,
  "Repeated tile failures should recover to the Standard basemap."
);
assert.match(
  source,
  /function renderCustomBasemapAttribution[\s\S]*?document\.createElement\("a"\)[\s\S]*?rel = "noopener noreferrer"[\s\S]*?textContent = config\.attribution/,
  "Provider attribution should be rendered with text-safe DOM APIs and a protected external link."
);
assert.match(
  source,
  /function removeCustomBasemap\(\)[\s\S]*?delete mapOptions\.customBasemap[\s\S]*?mapType: "standard"|function removeCustomBasemap\(\)[\s\S]*?mapType: "standard"[\s\S]*?delete mapOptions\.customBasemap/,
  "Users should be able to remove a saved custom basemap and return to Standard."
);

console.log("Generic custom basemap checks passed.");
