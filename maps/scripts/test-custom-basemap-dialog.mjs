import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("public/legacy/lalgeosurvey.html"), "utf8");

const functionBody = (name, nextName) => {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Expected ${name} to exist.`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `Expected ${nextName} after ${name}.`);
  return source.slice(start, end);
};

const settingsMarkup = source.slice(
  source.indexOf('<div id="settingsPanel"'),
  source.indexOf('<div id="toolbarMenuTray"'),
);
assert.doesNotMatch(settingsMarkup, /id="customBasemapNameInput"|class="custom-basemap-editor"/, "Settings must not embed the custom basemap form.");
assert.match(settingsMarkup, /custom-basemap-settings-row[\s\S]*?Custom Basemap[\s\S]*?customBasemapSettingsDescription[\s\S]*?configureCustomBasemapBtn/, "Settings should contain only the compact Configure/Edit entry.");

assert.match(
  source,
  /id="customBasemapBackdrop" class="layer-modal-backdrop" hidden>[\s\S]*?<section id="customBasemapDialog"[^>]*role="dialog" aria-modal="true" aria-labelledby="customBasemapDialogTitle" aria-describedby="customBasemapDialogDescription"/,
  "A labelled, top-level modal dialog should host custom basemap configuration.",
);
assert.match(source, /id="customBasemapDialogTitle">Custom Basemap<[\s\S]*?id="customBasemapDialogDescription"[^>]*>Connect an HTTPS XYZ tile service or ArcGIS MapServer\.<[\s\S]*?aria-label="Close custom basemap dialog"/, "The modal should expose its title, description, and close control.");
assert.match(source, /id="removeCustomBasemapBtn"[^>]*hidden[\s\S]*?id="cancelCustomBasemapBtn"[\s\S]*?id="saveCustomBasemapBtn"[^>]*>Save &amp; Use</, "Remove, Cancel, and Save & Use actions should use the required hierarchy.");
assert.match(source, /id="customBasemapUrlInput"[^>]*aria-describedby="customBasemapUrlHint customBasemapUrlError"[\s\S]*?id="customBasemapUrlError"[^>]*role="alert"[^>]*hidden/, "Tile URL help and validation must remain field-specific.");

const visibility = functionBody("setCustomBasemapDialogVisibility", "openCustomBasemapDialog");
assert.doesNotMatch(visibility, /setSettingsPanelVisibility\(true\)/, "The dedicated dialog flow must never open Settings.");
assert.match(visibility, /setToolbarMoreVisibility\(false\)[\s\S]*?setToolbarMenuVisibility\(false\)[\s\S]*?setAddActionPopoverVisibility\(false\)[\s\S]*?setMobileSelectPopoverVisibility\(false\)[\s\S]*?closeFeatureDrawer\(\)/, "Opening should close conflicting menus, popovers, and Feature Details.");
assert.match(visibility, /updateMapTypeControls\(activeProjectRecord\)[\s\S]*?clearCustomBasemapFieldErrors\(\)[\s\S]*?customBasemapBackdrop\.hidden = false/, "Opening should populate current values and clear stale errors before showing the dialog.");
assert.match(visibility, /Create or open a project before adding a custom basemap\./, "Opening must be blocked without an active project.");

assert.match(source, /mapType === "custom" && !getCustomBasemapConfig\(\)[\s\S]*?requestCustomBasemapSetup\(mapTypeButton\)/, "Selecting unconfigured Custom should start the dedicated setup flow.");
assert.match(source, /function requestCustomBasemapSetup[\s\S]*?pendingCustomBasemapSetup = true[\s\S]*?openCreateProjectModal\(\)[\s\S]*?function continuePendingCustomBasemapSetup[\s\S]*?openCustomBasemapDialog\(createProjectSubmitBtn\)/, "Custom should guide an empty workspace through project creation and then open its editor.");
assert.match(source, /data-custom-basemap-edit[^>]*aria-label="Edit custom basemap"|aria-label="Edit custom basemap"[^>]*data-custom-basemap-edit/, "Configured Custom should provide an accessible Edit action.");
assert.match(source, /data-custom-basemap-description>Connect an imagery or tile service<[\s\S]*?querySelectorAll\("\[data-custom-basemap-description\]"\)/, "The visible description markup and synchronization selector should share one data attribute.");

const updateControls = functionBody("updateMapTypeControls", "applyProjectMapType");
assert.match(updateControls, /customBasemapNameInput\.value = config\?\.name[\s\S]*?customBasemapUrlInput\.value = config\?\.sourceUrl[\s\S]*?customBasemapAttributionInput\.value = config\?\.attribution/, "Existing configuration should populate every form field.");
assert.match(updateControls, /removeCustomBasemapBtn\.hidden = !config[\s\S]*?editCustomBasemapBtn\.hidden = !config/, "Remove and Edit should appear only for saved configuration.");
assert.match(updateControls, /customBasemapSettingsDescription\.textContent = config\?\.name \|\| "No custom basemap configured\."[\s\S]*?configureCustomBasemapBtn\.textContent = config \? "Edit…" : "Configure…"/, "The compact Settings row should reflect configuration state.");

const save = functionBody("saveCustomBasemap", "removeCustomBasemap");
assert.match(save, /normalizeHttpsUrl\(customBasemapUrlInput\?\.value, "Tile service URL"\)[\s\S]*?normalizeCustomBasemapTileUrl\(sourceUrl\)/, "Save should retain HTTPS and tile-service normalization.");
assert.match(save, /customBasemap: \{ name, sourceUrl, tileUrl, attribution, attributionUrl \}[\s\S]*?scheduleLocalAutosave\(\)[\s\S]*?applyProjectMapType\(activeProjectRecord\)[\s\S]*?closeCustomBasemapDialog\(\)/, "Save should persist, apply, autosave, and close only after success.");

const close = functionBody("closeCustomBasemapDialog", "setCustomBasemapDialogVisibility");
assert.doesNotMatch(close, /activeProjectRecord\.mapOptions|scheduleLocalAutosave/, "Cancel/close must not alter project data.");
assert.match(close, /clearCustomBasemapFieldErrors\(\)[\s\S]*?focusTarget[\s\S]*?focus\(\)/, "Close should clear transient errors and restore focus.");
assert.match(source, /if \(event\.key === "Escape"\)[\s\S]*?customBasemapBackdrop && !customBasemapBackdrop\.hidden[\s\S]*?closeCustomBasemapDialog\(\)/, "Escape should close the modal before other UI layers.");
assert.match(source, /function trapCustomBasemapDialogFocus[\s\S]*?event\.key !== "Tab"[\s\S]*?last\.focus\(\)[\s\S]*?first\.focus\(\)/, "Tab and Shift+Tab should stay inside the dialog.");
assert.match(source, /function setCustomBasemapBackgroundInteraction[\s\S]*?document\.body\.children[\s\S]*?setAttribute\("inert"[\s\S]*?removeAttribute\("inert"/, "Background controls should be inert only while the dialog is open.");

assert.match(source, /\.layer-modal-backdrop \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;[\s\S]*?z-index: 4200;/, "The dialog backdrop should use the established modal layer above the toolbar.");
assert.match(source, /\.layer-modal\.custom-basemap-dialog \{[\s\S]*?width: min\(560px, calc\(100vw - 32px\)\);[\s\S]*?max-height: calc\(100dvh - 48px\);[\s\S]*?overflow: hidden;/, "Desktop dialog geometry should remain inside the viewport.");
assert.match(source, /@media \(max-width: 600px\) \{[\s\S]*?#customBasemapBackdrop \{[\s\S]*?align-items: flex-end;[\s\S]*?\.layer-modal\.custom-basemap-dialog \{[\s\S]*?width: calc\(100vw - 16px\);[\s\S]*?max-height: calc\(100dvh - 16px - env\(safe-area-inset-bottom\)\);/, "Mobile should use a safe-area-aware bottom-sheet layout.");
assert.match(source, /\.layer-modal\.custom-basemap-dialog input,[\s\S]*?\.layer-modal\.custom-basemap-dialog button,[\s\S]*?min-height: 44px;/, "Mobile dialog fields and actions should retain 44px touch targets.");

console.log("Custom basemap dialog checks passed.");
