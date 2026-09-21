import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const frame = await readFile(new URL("../app/MapsFrame.tsx", import.meta.url), "utf8");
const legacy = await readFile(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");

assert.match(frame, /^"use client";/, "The outer Maps shell must capture the browser-only URL fragment.");
assert.match(frame, /OPEN_TOKEN_PATTERN = \/\^\[0-9a-f\]\{64\}\$\//, "Only a 256-bit lowercase hexadecimal capability may be redeemed.");
assert.match(frame, /params\.getAll\("open"\)/, "Duplicate open parameters must be detectable.");

const scrubIndex = frame.indexOf("window.history.replaceState");
const confirmIndex = frame.indexOf('setHandoff({ kind: "ready" })');
const redeemIndex = frame.indexOf("fetch(MAPS_API_REDEEM_URL");
assert.ok(scrubIndex >= 0 && scrubIndex < confirmIndex && confirmIndex < redeemIndex, "The fragment must be scrubbed before confirmation and redemption.");
assert.doesNotMatch(frame, /(?:localStorage|sessionStorage)\.setItem[^\n]*(?:open|capability|token)/i, "The capability must never be persisted in browser storage.");

assert.match(frame, /MAPS_API_REDEEM_URL = "https:\/\/api\.lalgeo\.com\/v1\/map-open\/redeem"/, "Redemption must use the canonical API hostname.");
assert.match(frame, /credentials: "omit"/, "The public exchange must not send browser credentials.");
assert.match(frame, /referrerPolicy: "no-referrer"/, "The capability exchange must suppress referrer data.");
assert.match(frame, /body: JSON\.stringify\(\{ token: capability \}\)/, "Only the one-time capability belongs in the redeem body.");
assert.match(frame, /target\.postMessage\(\{ type: OPEN_MESSAGE, payload, requestId \}, window\.location\.origin\)/, "The imported project must be posted only to the same-origin Maps frame.");

assert.match(frame, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="map-open-title"[\s\S]*?aria-describedby="map-open-description"/, "The handoff confirmation must be an accessible modal.");
assert.match(frame, /Open editable copy/, "The destructive-looking external handoff needs an explicit, plain-language confirmation.");
assert.match(frame, /Changes you make here won’t update the original API map/, "The UI must explain that the handoff is a copy, not write-through editing.");
assert.match(frame, /shellRef\.current\?\.toggleAttribute\("inert", dialogOpen\)/, "The map behind the modal must be inert.");
assert.match(frame, /event\.key === "Escape"[\s\S]*?event\.key !== "Tab"/, "The modal must support Escape and trapped keyboard focus.");
assert.match(frame, /This one-time link has expired or was already used/, "Expired and reused capabilities must share a recovery message.");
assert.match(frame, /Request ID:/, "Failures should expose the API request ID when available.");

assert.match(
  frame,
  /event\.origin !== window\.location\.origin \|\| event\.source !== frameRef\.current\?\.contentWindow/,
  "The parent must ignore result messages from any other source or origin.",
);
assert.match(
  legacy,
  /event\.origin !== window\.location\.origin \|\| event\.source !== window\.parent/,
  "The embedded importer must accept commands only from its same-origin parent.",
);
assert.match(legacy, /event\.data\.type !== "lalgeo:open-api-copy"/, "The importer must require the dedicated handoff message.");
assert.match(legacy, /await openImportedProject\(event\.data\.payload\)/, "The handoff must reuse the validated project-import journey.");
assert.match(
  legacy,
  /type: "lalgeo:open-api-copy-result",[\s\S]*?ok: true,[\s\S]*?projectName:/,
  "The frame must acknowledge a successful local import.",
);
assert.match(
  legacy,
  /catch \(error\)[\s\S]*?setProjectStatus\(message, "error"\)[\s\S]*?ok: false/,
  "An invalid API project must leave the user in Maps with an actionable error.",
);
assert.doesNotMatch(legacy, /postMessage\([\s\S]{0,200},\s*["']\*["']\)/, "Handoff messages must never use a wildcard target origin.");

console.log("Secure API map-open handoff contract passed.");
