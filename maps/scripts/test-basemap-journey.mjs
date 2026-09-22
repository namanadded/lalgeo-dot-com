import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  source,
  /id="desktopBasemapMenu"[\s\S]*?role="menu" aria-labelledby="basemapPopoverTitle" aria-describedby="basemapPopoverHelper"/,
  "The Basemap surface should have a visible title and plain-language description.",
);
assert.match(
  source,
  /id="basemapPopoverHelper"[^>]*>Choose the map background\. Changes apply immediately\.<\/p>/,
  "The Basemap surface should explain its purpose and immediate behavior.",
);
assert.match(
  source,
  /data-map-type="standard"[\s\S]*?Roads, places, and boundaries[\s\S]*?data-map-type="satellite"[\s\S]*?Aerial imagery without labels[\s\S]*?data-map-type="hybrid"[\s\S]*?Aerial imagery with map labels/,
  "Familiar basemap choices should include short descriptions for light GIS users.",
);
assert.match(
  source,
  /data-map-type="custom"[\s\S]*?aria-describedby="basemapCustomDescription"[\s\S]*?data-custom-basemap-description/,
  "The Custom option should expose its contextual explanation to assistive technology.",
);
assert.match(
  source,
  /data-custom-basemap-description[\s\S]*?activeProjectRecord[\s\S]*?Connect an imagery or tile service[\s\S]*?Create or open a project first/,
  "Custom-basemap guidance should explain both its available and empty-project states.",
);
assert.match(
  source,
  /id="desktopBasemapPoisBtn"[\s\S]*?aria-describedby="basemapPoisDescription"[\s\S]*?Show parks, landmarks, and businesses/,
  "The Points of Interest toggle should explain what it changes.",
);
assert.match(
  source,
  /#toolbarMenuTray\[data-active-menu="basemap"\] \{[\s\S]*?min-width: 0 !important;[\s\S]*?max-width: none !important;[\s\S]*?max-height: min\(62dvh, 520px\)[\s\S]*?overflow: hidden;/,
  "The phone sheet should reset the desktop width cap and stay within the viewport.",
);
assert.match(
  source,
  /#toolbarMenuTray\[data-active-menu="basemap"\] \.basemap-menu-content \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/,
  "Long Basemap content should scroll inside the sheet without moving the map.",
);
assert.match(
  source,
  /#toolbarMenuTray\[data-active-menu="basemap"\] \.basemap-menu-item \{[\s\S]*?min-height: 52px;[\s\S]*?grid-template-columns: 22px minmax\(0, 1fr\);/,
  "Basemap choices should have generous touch targets and a resilient text column.",
);
assert.match(
  source,
  /mobileBasemapCloseBtn\?\.addEventListener\("click",[\s\S]*?setToolbarMenuVisibility\(false\);[\s\S]*?toolbarBasemapBtn\?\.focus\(\)/,
  "The close control should dismiss the sheet and restore focus.",
);
assert.match(
  source,
  /if \(event\.key === "Escape"\)[\s\S]*?if \(toolbarMenuVisible\)[\s\S]*?toolbarMenuKey === "basemap"[\s\S]*?setToolbarMenuVisibility\(false\);[\s\S]*?returnTarget\?\.focus\(\)/,
  "Escape should dismiss Basemap and return keyboard focus.",
);

console.log("Basemap journey checks passed.");
