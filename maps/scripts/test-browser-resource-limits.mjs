import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../public/legacy/lalgeosurvey.html"), "utf8");

const expectedLimits = [
  ["MAX_BROWSER_LAYER_FEATURES", "10000"],
  ["MAX_BROWSER_PROJECT_FEATURES", "25000"],
  ["MAX_BROWSER_PROJECT_STORAGE_BYTES", "3 * 1024 * 1024"],
  ["MAX_BROWSER_WORKSPACE_STORAGE_BYTES", "4 * 1024 * 1024"],
  ["MAX_IMPORT_FILE_BYTES", "25 * 1024 * 1024"],
  ["MAX_IMPORT_BATCH_BYTES", "40 * 1024 * 1024"],
  ["MAX_API_RESPONSE_BYTES", "10 * 1024 * 1024"],
  ["MAX_ZIP_UNCOMPRESSED_BYTES", "60 * 1024 * 1024"],
];

for (const [name, value] of expectedLimits) {
  assert.match(
    html,
    new RegExp(`const ${name} = ${value.replaceAll("*", "\\*")};`),
    `${name} should remain explicitly defined at the reviewed safety value.`,
  );
}

assert.match(
  html,
  /function assertImportFilesWithinLimits[\s\S]*?MAX_IMPORT_FILE_BYTES[\s\S]*?MAX_IMPORT_BATCH_BYTES/,
  "Local file imports must enforce individual and batch byte limits.",
);
assert.match(
  html,
  /function assertZipArchiveWithinLimits[\s\S]*?MAX_ZIP_ENTRY_COUNT[\s\S]*?MAX_ZIP_UNCOMPRESSED_BYTES/,
  "ZIP-based imports must enforce entry and uncompressed-size limits.",
);
assert.match(
  html,
  /function readResponseArrayBufferWithinLimit[\s\S]*?response\.body\.getReader\(\)[\s\S]*?totalBytes > maxBytes[\s\S]*?reader\.cancel\(\)/,
  "Remote responses must be streamed and cancelled once the byte cap is exceeded.",
);
assert.match(
  html,
  /buildApiEndpointPayload[\s\S]*?readResponseTextWithinLimit\(response, MAX_API_RESPONSE_BYTES, "API response"\)/,
  "API endpoint imports must use the limited streaming reader.",
);
assert.match(
  html,
  /function assertLayerCollectionWithinBrowserLimits[\s\S]*?MAX_BROWSER_LAYER_FEATURES[\s\S]*?MAX_BROWSER_PROJECT_FEATURES[\s\S]*?MAX_BROWSER_PROJECT_VERTICES/,
  "Imported and saved layers must enforce feature and geometry limits.",
);
assert.match(
  html,
  /<strong>Browser safety limits<\/strong>[\s\S]*?25 MB each[\s\S]*?2 MB per batch[\s\S]*?60 MB uncompressed[\s\S]*?10,000 features per layer[\s\S]*?3 MB each or 4 MB total[\s\S]*?API responses: 10 MB/,
  "The Projects sheet must disclose the reviewed browser limits in plain language.",
);
assert.match(
  html,
  /Responses are limited to 10 MB[\s\S]*?<strong>Why limits apply<\/strong>[\s\S]*?map geometry, annotations, and table rows/,
  "The API import screen must disclose its response cap and resource rationale.",
);
assert.match(
  html,
  /function createBrowserLimitError[\s\S]*?Import blocked —[\s\S]*?BrowserLimitError/,
  "Limit failures must use an explicit, understandable blocked-import warning.",
);
assert.match(
  html,
  /DROPBOX_LARGE_PROJECT_GUIDANCE[\s\S]*?store it in Dropbox[\s\S]*?Large GIS layers must still be filtered, split, or simplified/,
  "Oversized-project warnings must recommend Dropbox without implying that it bypasses browser layer limits.",
);
assert.match(
  html,
  /#importPanel #projectStatus\.error,[\s\S]*?#layerImportStatus\.error[\s\S]*?background: rgba\(254, 242, 242, 0\.96\)/,
  "Blocked imports must appear as a prominent inline warning in both project and layer import surfaces.",
);
assert.match(
  html,
  /function setProjectStatus[\s\S]*?state === "error" \? "alert" : "status"[\s\S]*?layerImportStatus\.setAttribute\("role", state === "error" \? "alert" : "status"\)/,
  "Blocked-import warnings must be announced as alerts to assistive technology.",
);

console.log("Browser resource limit checks passed.");
