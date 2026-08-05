import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /getDirections\(place\.coordinate\.latitude, place\.coordinate\.longitude, \{ trigger: event\.currentTarget \}\)/, "The visible directions action should identify its trigger for busy state and focus recovery.");
assert.match(source, /function setDirectionsTriggerBusy\(trigger, busy\)[\s\S]*?trigger\.disabled = busy[\s\S]*?aria-busy[\s\S]*?Getting directions…/, "Directions should prevent duplicate submissions and expose an accessible busy state.");
assert.match(source, /function renderDirectionsStatus\([\s\S]*?setAttribute\("role", "status"\)[\s\S]*?setAttribute\("aria-live", "polite"\)[\s\S]*?setAttribute\("aria-atomic", "true"\)[\s\S]*?directionsRetryBtn[\s\S]*?directionsCloseBtn/, "Loading and failure feedback should use a persistent, announced status with retry and close actions.");
assert.match(source, /async function getDirections\(destLat, destLon, \{ trigger = null \} = \{\}\)[\s\S]*?const requestId = \+\+directionsRequestId[\s\S]*?await requestMapLocation\(\{ center: false \}\)[\s\S]*?requestId !== directionsRequestId/, "Directions should share location recovery and invalidate superseded requests.");
assert.match(source, /directions\.route\(request, \(error, data\) => \{[\s\S]*?requestId !== directionsRequestId[\s\S]*?failDirections\(requestId, "No route was returned/, "Route callbacks should ignore stale results and present recoverable failures.");
assert.match(source, /directionsCloseBtn[\s\S]*?directionsRequestId \+= 1[\s\S]*?statusRegion\.remove\(\)[\s\S]*?lastDirectionsTrigger\.focus\(\)/, "Closing directions should invalidate in-flight work and restore focus to the invoking control.");
assert.match(source, /allCoords\.length > 0[\s\S]*?failDirections\(requestId, "The route contained no usable path/, "A route without drawable coordinates should use the same recovery path.");
assert.doesNotMatch(source, /function getDirections\(destLat, destLon[\s\S]{0,2600}?alert\("Error getting route\."\)/, "Directions failures should never interrupt the workflow with a browser alert.");

console.log("Directions journey checks passed.");
