import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(source, /id="locationStatusCard"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/, "Location feedback should be announced as one polite status update.");
assert.match(source, /id="locationStatusClose"[\s\S]*?aria-label="Dismiss location status"/, "Location feedback should provide a named close control.");
assert.match(source, /id="locationRetryBtn"[\s\S]*?>Try again<[\s\S]*?id="locationRecenterBtn"[\s\S]*?>Recenter</, "Error and success states should expose familiar recovery actions.");
assert.match(source, /if \(event\.key === "Escape"\) \{[\s\S]*?locationStatusCard && !locationStatusCard\.hidden[\s\S]*?hideLocationStatus\(\{ restoreFocus: true \}\)/, "Escape should dismiss location feedback and restore focus.");
assert.match(source, /@media \(max-width: 600px\)[\s\S]*?\.location-status-close \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/, "The mobile close target should be at least 44 by 44 pixels.");
assert.match(source, /function requestMapLocation\(\{ center = true, announce = true \} = \{\}\)[\s\S]*?navigator\.geolocation\.getCurrentPosition[\s\S]*?timeout: 12000[\s\S]*?maximumAge: 60000/, "Location should use a bounded one-shot request with a short-lived cached position.");
assert.match(source, /id="mobileLocationBtn"[^>]*aria-label="My Location"[\s\S]*?mobileLocationBtn\?\.addEventListener\("click"[\s\S]*?requestMapLocation\(\)/, "The mobile floating location control should reuse the shared location journey.");
assert.match(source, /function getLocationErrorMessage\(error\)[\s\S]*?Location access is off[\s\S]*?temporarily unavailable[\s\S]*?took too long/, "Permission, unavailable, and timeout failures should have plain-language guidance.");
assert.match(source, /setLocationStatus\("loading", "Finding your location…", "Your browser may ask for permission\."\)[\s\S]*?setLocationStatus\("success", "Location found", "Your position is marked on the map\."\)/, "The journey should announce useful loading and success states.");
assert.match(source, /async function getDirections\(destLat, destLon[\s\S]*?await requestMapLocation\(\{ center: false \}\)[\s\S]*?failDirections\(requestId, "Your location could not be used/, "Directions should reuse the shared location acquisition and recovery journey.");
assert.doesNotMatch(source, /myLocationBtn\?\.addEventListener\("click"[\s\S]{0,300}watchPosition/, "The locate action should not create an unbounded watch.");
assert.doesNotMatch(source, /function getDirections\(destLat, destLon\) \{[\s\S]{0,900}alert\("Unable to retrieve your location/, "Directions location errors should not interrupt users with browser alerts.");

console.log("Location journey checks passed.");
