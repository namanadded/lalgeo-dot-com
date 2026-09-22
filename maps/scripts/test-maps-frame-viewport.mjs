import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapsFramePath = resolve(__dirname, "../app/MapsFrame.tsx");
const mapsFrameSource = readFileSync(mapsFramePath, "utf8");
const layoutSource = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");
const viewportGuardSource = readFileSync(resolve(__dirname, "../app/MobileViewportGuard.tsx"), "utf8");
const legacyMapSource = readFileSync(resolve(__dirname, "../public/legacy/lalgeosurvey.html"), "utf8");

assert.match(
  mapsFrameSource,
  /className="maps-shell"/,
  "Expected the maps frame shell to have a stable class for viewport sizing."
);

assert.match(
  mapsFrameSource,
  /height:\s*"100vh"/,
  "Expected a 100vh fallback for browsers without dynamic viewport unit support."
);

assert.match(
  mapsFrameSource,
  /@supports\s*\(\s*height:\s*100dvh\s*\)[\s\S]*\.maps-shell[\s\S]*height:\s*100dvh\s*!important/,
  "Expected a 100dvh enhancement for modern mobile browser viewport sizing."
);

assert.match(
  layoutSource,
  /export const viewport:[\s\S]*maximumScale:\s*1,[\s\S]*userScalable:\s*false,[\s\S]*viewportFit:\s*"cover"/,
  "The outer maps page should prevent Safari from magnifying the full app shell."
);

assert.match(
  viewportGuardSource,
  /document\.addEventListener\("gesturestart",\s*preventPageScale,[\s\S]*document\.addEventListener\("gesturechange",\s*preventPageScale/,
  "The outer shell should suppress Safari page-scale gestures that viewport metadata may not stop."
);

assert.match(
  legacyMapSource,
  /name="viewport" content="[^"]*maximum-scale=1\.0,[^"]*user-scalable=no,[^"]*viewport-fit=cover"/,
  "The embedded map document should also disable browser-level page scaling."
);

assert.match(
  legacyMapSource,
  /const isMapGestureTarget[\s\S]*target\.closest\("#map"\)[\s\S]*document\.addEventListener\("gesturestart",\s*preventNonMapPinch,[\s\S]*event\.touches\.length > 1[\s\S]*preventNonMapPinch\(event\)/,
  "The embedded app should block multi-touch page scaling outside the map while preserving MapKit gestures."
);
