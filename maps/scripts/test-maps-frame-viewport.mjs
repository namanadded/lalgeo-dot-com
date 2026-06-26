import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapsFramePath = resolve(__dirname, "../app/MapsFrame.tsx");
const mapsFrameSource = readFileSync(mapsFramePath, "utf8");

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
