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
assert.match(source, /function openDirectionsPlanner\(place,[\s\S]*?await requestMapLocation\(\{ center: false, announce: false \}\)[\s\S]*?Location access is unavailable\. Enter a starting place instead\./, "Directions should request location only on submission and fall back to a manual start without duplicate global feedback.");
assert.doesNotMatch(source, /myLocationBtn\?\.addEventListener\("click"[\s\S]{0,300}watchPosition/, "The locate action should not create an unbounded watch.");
assert.doesNotMatch(source, /function getDirections\(destLat, destLon\) \{[\s\S]{0,900}alert\("Unable to retrieve your location/, "Directions location errors should not interrupt users with browser alerts.");
assert.match(source, /function renderVoiceNavigationStatus\(state, title, message\)[\s\S]*?id = "voiceNavigationStatus"[\s\S]*?aria-live", "polite"[\s\S]*?voiceNavigationRetryBtn/, "Voice navigation should announce state and expose retry recovery in the route sidebar.");
assert.match(source, /function setVoiceNavigationControls\([\s\S]*?startButton\.disabled = active \|\| pending[\s\S]*?aria-busy[\s\S]*?stopButton\.disabled = !active && !pending/, "Voice navigation controls should explain pending and active states without allowing duplicate starts.");
assert.match(source, /function startVoiceNavigation\(steps, \{ trigger = null \} = \{\}\)[\s\S]*?Starting voice navigation…[\s\S]*?Voice navigation active[\s\S]*?stopVoice\(\{ announce: false \}\)[\s\S]*?getLocationErrorMessage\(error\)/, "Voice navigation should cover loading, active, and shared geolocation error recovery states.");
assert.match(source, /function stopVoice\(\{ announce = true \} = \{\}\)[\s\S]*?clearWatch\(locationWatcher\)[\s\S]*?Voice navigation stopped[\s\S]*?lastVoiceNavigationTrigger\?\.focus\(\)/, "Stopping voice navigation should clear tracking, announce completion, and restore focus.");
assert.doesNotMatch(source, /alert\("Please allow location access to enable navigation\."\)|alert\("Location position is unavailable\."\)|alert\("Location request timed out\."\)/, "Voice navigation location failures should never use blocking browser alerts.");

console.log("Location journey checks passed.");
