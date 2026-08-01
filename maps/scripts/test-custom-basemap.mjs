import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /id="customBasemapDialog"[\s\S]*?id="customBasemapNameInput"[\s\S]*?id="customBasemapUrlInput"[\s\S]*?id="customBasemapAttributionInput"[\s\S]*?id="saveCustomBasemapBtn"/,
  "The dedicated dialog should provide the reusable custom-basemap editor.",
);
assert.match(
  source,
  /id="desktopBasemapStyleList"[\s\S]*?data-map-type="custom"[\s\S]*?data-custom-basemap-choice[\s\S]*?data-custom-basemap-label>Custom…<\/span>/,
  "The Basemap popover should expose Custom directly instead of hiding it in Settings.",
);
assert.match(
  source,
  /mapType === "custom" && !getCustomBasemapConfig\(\)[\s\S]*?openCustomBasemapDialog\(mapTypeButton\)/,
  "Choosing Custom before configuration should open the dedicated dialog.",
);
assert.match(
  source,
  /function setCustomBasemapDialogVisibility\(show,[\s\S]*?setToolbarMenuVisibility\(false\)[\s\S]*?closeFeatureDrawer\(\)[\s\S]*?customBasemapBackdrop\.hidden = false[\s\S]*?customBasemapNameInput\)\?\.focus\(\)/,
  "Opening the editor should close conflicting UI, show the dialog, and focus the relevant field.",
);
assert.match(
  source,
  /function normalizeCustomBasemapTileUrl\(value\)[\s\S]*?\{z\\\}[\s\S]*?\{x\\\}[\s\S]*?\{y\\\}[\s\S]*?\/MapServer[\s\S]*?\/tile\/\{z\}\/\{y\}\/\{x\}/,
  "Custom basemaps should accept XYZ templates and normalize ArcGIS MapServer URLs.",
);
assert.match(
  source,
  /function normalizeHttpsUrl\(value, fieldLabel\)[\s\S]*?parsed\.protocol !== "https:"[\s\S]*?parsed\.username = ""[\s\S]*?parsed\.password = ""/,
  "Remote tile and attribution URLs should require HTTPS and discard embedded credentials.",
);
assert.match(
  source,
  /id="customBasemapUrlInput"[^>]*required[^>]*aria-describedby="customBasemapUrlHint customBasemapUrlError"[\s\S]*?id="customBasemapUrlError"[^>]*role="alert"[^>]*hidden/,
  "The required tile URL should expose durable help and a field-local alert.",
);
assert.match(
  source,
  /function setCustomBasemapFieldError\(input, errorElement, message = ""\)[\s\S]*?aria-invalid[\s\S]*?errorElement\.hidden = !hasError[\s\S]*?function clearCustomBasemapFieldErrors/,
  "Custom-basemap validation should synchronize visible and accessible error state.",
);
assert.match(
  source,
  /normalizeCustomBasemapTileUrl\(sourceUrl\)[\s\S]*?setCustomBasemapFieldError\(customBasemapUrlInput, customBasemapUrlError, message\)[\s\S]*?customBasemapUrlInput\?\.focus\(\)[\s\S]*?normalizeHttpsUrl\(attributionUrlValue, "Attribution link"\)[\s\S]*?setCustomBasemapFieldError\(customBasemapAttributionUrlInput, customBasemapAttributionUrlError, message\)[\s\S]*?customBasemapAttributionUrlInput\?\.focus\(\)/,
  "Each invalid URL should be explained at, and return focus to, the responsible field.",
);
assert.match(
  source,
  /customBasemapUrlInput\?\.addEventListener\("input"[\s\S]*?setCustomBasemapFieldError\(customBasemapUrlInput, customBasemapUrlError\)[\s\S]*?customBasemapAttributionUrlInput\?\.addEventListener\("input"/,
  "Editing an invalid custom-basemap URL should clear stale field error state.",
);
assert.match(
  source,
  /function saveCustomBasemap\(\)[\s\S]*?customBasemap: \{ name, sourceUrl, tileUrl, attribution, attributionUrl \}[\s\S]*?scheduleLocalAutosave\(\)[\s\S]*?applyProjectMapType/,
  "A saved definition should persist with the project and become active.",
);
assert.match(
  source,
  /new mapkit\.TileOverlay\(customBasemapTileUrl,[\s\S]*?minimumZ: 0,[\s\S]*?maximumZ: 22,[\s\S]*?opacity:/,
  "Custom imagery should load lazily through one MapKit tile overlay.",
);
assert.match(
  source,
  /function removeCustomBasemapTileOverlay\(\)[\s\S]*?map\.removeTileOverlay\(customBasemapTileOverlay\)[\s\S]*?customBasemapTileOverlay = null/,
  "Turning off custom imagery should stop its tile overlay work.",
);
assert.match(
  source,
  /function handleCustomBasemapTileError\(\)[\s\S]*?customBasemapTileErrorCount < 3[\s\S]*?mapType: "standard"[\s\S]*?Returned to the Standard basemap/,
  "Repeated tile failures should recover to the Standard basemap.",
);
assert.match(
  source,
  /function renderCustomBasemapAttribution[\s\S]*?document\.createElement\("a"\)[\s\S]*?rel = "noopener noreferrer"[\s\S]*?textContent = config\.attribution/,
  "Provider attribution should use text-safe DOM APIs and a protected external link.",
);
assert.match(
  source,
  /function removeCustomBasemap\(\)[\s\S]*?delete mapOptions\.customBasemap[\s\S]*?mapType: "standard"|function removeCustomBasemap\(\)[\s\S]*?mapType: "standard"[\s\S]*?delete mapOptions\.customBasemap/,
  "Users should be able to remove a saved custom basemap and return to Standard.",
);

console.log("Custom basemap checks passed.");
