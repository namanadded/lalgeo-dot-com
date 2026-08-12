import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /id="measurementPanel"[^>]*role="region"[^>]*aria-labelledby="measurementTitle"[^>]*aria-describedby="measurementDescription measurementHint"/, "Measurement should be exposed as a named, described region.");
assert.match(source, /<h2 id="measurementTitle"[^>]*>Measure<\/h2>[\s\S]*?id="measurementDescription"[^>]*>Measure a path or outline an area on the map\./, "Measurement should have a clear heading and plain-language purpose.");
assert.match(source, /class="measurement-unit-field"[\s\S]*?for="measurementUnitSelect"[\s\S]*?<span>Units<\/span>[\s\S]*?<select id="measurementUnitSelect">/, "The units control should keep a visible associated label.");
assert.match(source, /id="measurementStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/, "Committed measurement updates should be announced politely.");
assert.match(source, /function addMeasurementPoint\(coordinate\)[\s\S]*?Point \$\{measurementCoordinates\.length\} added\.[\s\S]*?Add another point or finish\./, "Adding a point should announce progress and the next action.");
assert.match(source, /function finishMeasurement\(\)[\s\S]*?measurementStatus\.textContent = `Measurement complete\./, "Completing a measurement should announce the result.");
assert.match(source, /function setMeasurementActive\(active, \{ restoreFocus = false \} = \{\}\)[\s\S]*?measurementReturnFocus[\s\S]*?measurementDistanceModeBtn\?\.focus\(\)/, "Opening should focus the first useful control and retain a return target.");
assert.match(source, /if \(measurementActive\) \{[\s\S]*?setMeasurementActive\(false, \{ restoreFocus: true \}\)/, "Escape should close measurement and restore focus.");
assert.match(source, /#measurementPanel \.measurement-mode-switch \{[\s\S]*?height: 48px;[\s\S]*?#measurementPanel \.measurement-mode-btn \{[\s\S]*?height: 44px;[\s\S]*?#measurementPanel #measurementUnitSelect \{[\s\S]*?height: 44px;/, "Phone measurement choices should provide at least 44-pixel targets.");
assert.match(source, /Tap or click the map to add the first point\./, "Measurement guidance should work for touch, mouse, and trackpad users.");

console.log("Measurement journey checks passed.");
