import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /openDirectionsPlanner\(place, \{ trigger: event\.currentTarget \}\)/, "The visible directions action should open a planner before requesting location.");
assert.match(source, /function openDirectionsPlanner\(place,[\s\S]*?id="directionsPlanner"[\s\S]*?aria-labelledby="directionsPlannerTitle"[\s\S]*?>Plan a route</, "Directions should use a named planning form with a clear destination.");
assert.match(source, /name="directionsOriginMode" value="location" checked[\s\S]*?name="directionsOriginMode" value="search"/, "The planner should offer current location and a manually entered starting place.");
assert.match(source, /id="directionsOriginInput"[\s\S]*?autocomplete="street-address"[\s\S]*?enterkeyhint="search"/, "The manual start field should provide useful phone keyboard and autofill hints.");
assert.match(source, /name="directionsTravelMode" value="driving" checked[\s\S]*?value="walking"[\s\S]*?value="transit"/, "Drive, walk, and transit should be progressively disclosed in the planner.");
assert.match(source, /requestMapLocation\(\{ center: false, announce: false \}\)[\s\S]*?Location access is unavailable\. Enter a starting place instead\./, "Denied location access should fall back to manual start entry without a competing global error card.");
assert.match(source, /resolveDirectionsOrigin\(query\)[\s\S]*?We couldn’t find that starting place/, "Manual start search should expose a plain-language empty state.");
assert.match(source, /function setDirectionsTriggerBusy\(trigger, busy\)[\s\S]*?trigger\.disabled = busy[\s\S]*?aria-busy[\s\S]*?Getting directions…/, "Directions should prevent duplicate submissions and expose an accessible busy state.");
assert.match(source, /function renderDirectionsStatus\([\s\S]*?setAttribute\("role", "status"\)[\s\S]*?setAttribute\("aria-live", "polite"\)[\s\S]*?setAttribute\("aria-atomic", "true"\)[\s\S]*?directionsRetryBtn[\s\S]*?directionsCloseBtn/, "Loading and failure feedback should use a persistent, announced status with retry and close actions.");
assert.match(source, /async function getDirections\(destLat, destLon,[\s\S]*?origin = null[\s\S]*?transportType = mapkit\.Directions\.Transport\.Automobile[\s\S]*?origin: routeOrigin \|\| myLocationCoord[\s\S]*?transportType/, "Routing should accept a resolved manual origin and the selected travel mode.");
assert.match(source, /directions\.route\(request, \(error, data\) => \{[\s\S]*?requestId !== directionsRequestId[\s\S]*?failDirections\(requestId, "No route was returned/, "Route callbacks should ignore stale results and present recoverable failures.");
assert.match(source, /directionsCloseBtn[\s\S]*?directionsRequestId \+= 1[\s\S]*?statusRegion\.remove\(\)[\s\S]*?lastDirectionsTrigger\.focus\(\)/, "Closing directions should invalidate in-flight work and restore focus to the invoking control.");
assert.match(source, /allCoords\.length > 0[\s\S]*?failDirections\(requestId, "The route contained no usable path/, "A route without drawable coordinates should use the same recovery path.");
assert.match(source, /class="directions-summary"[\s\S]*?aria-label="Route summary"[\s\S]*?>Time<[\s\S]*?>Distance<[\s\S]*?>Arrive</, "Successful routes should present a scannable, named summary.");
assert.match(source, /id="directionsSummaryClose"[\s\S]*?aria-label="Close directions"[\s\S]*?id="changeRouteBtn"/, "Route results should provide familiar close and change actions.");
assert.match(source, /event\.key === "Escape"[\s\S]*?classList\.contains\("directions-open"\)[\s\S]*?allRouteOverlays = \[\][\s\S]*?showSidebar\(lastDirectionsPlace\)[\s\S]*?lastDirectionsTrigger\.focus\(\)/, "Escape should close the planner or route, clear overlays, and restore focus to the invoking action.");
assert.match(source, /\.directions-close \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/, "Planner and result close controls should meet the 44 pixel touch target.");
assert.match(source, /@media \(max-width: 600px\)[\s\S]*?\.directions-choice,[\s\S]*?min-height: 52px;[\s\S]*?\.directions-submit \{[\s\S]*?min-height: 56px;/, "Phone route controls should use generous touch targets.");
assert.doesNotMatch(source, /function getDirections\(destLat, destLon[\s\S]{0,2600}?alert\("Error getting route\."\)/, "Directions failures should never interrupt the workflow with a browser alert.");

console.log("Directions journey checks passed.");
