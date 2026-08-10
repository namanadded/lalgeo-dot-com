import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/legacy/lalgeosurvey.html", import.meta.url), "utf8");

assert.match(
  source,
  /id="helpCenterModal"[^>]*class="workspace-modal-backdrop"[\s\S]*?class="workspace-modal help-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="helpCenterTitle"[^>]*aria-describedby="helpCenterIntro"/,
  "Help Center should expose a named modal dialog relationship."
);

assert.match(
  source,
  /id="helpCenterCloseBtn"[^>]*class="help-modal-close"[^>]*aria-label="Close Help Center"/,
  "Help Center should use a purpose-specific close control."
);

assert.match(
  source,
  /for="helpSearchInput">What do you need help with\?<\/label>[\s\S]*?id="helpSearchInput"[^>]*type="search"[^>]*aria-describedby="helpResultsStatus"[\s\S]*?id="helpResultsStatus"[^>]*role="status"[^>]*aria-live="polite"/,
  "Help search should be visibly labeled and announce its result count."
);

assert.match(
  source,
  /data-help-query="create project"[\s\S]*?data-help-query="import layer"[\s\S]*?data-help-query="edit feature"[\s\S]*?data-help-query="share export"/,
  "Help Center should provide useful popular-task shortcuts."
);

assert.doesNotMatch(source, /helpAskInput|helpAskBtn|help-ai-note|AI help option|Ollama on your Mac mini/,
  "Help Center should not duplicate local search or expose developer-only AI notes.");

assert.match(
  source,
  /function renderHelpTopics\(query = ""\)[\s\S]*?helpResultsStatus\.textContent[\s\S]*?<details class="help-topic-card"[\s\S]*?<summary>[\s\S]*?No guide found/,
  "Help topics should use progressive disclosure with useful result and empty states."
);

assert.match(
  source,
  /function setHelpCenterVisibility\(show, query = ""\)[\s\S]*?helpCenterReturnFocus = document\.activeElement[\s\S]*?helpCenterReturnFocus\?\.offsetParent !== null[\s\S]*?: sidebarToggleBtn;[\s\S]*?focusTarget\?\.focus\?\.\(\)/,
  "Closing Help Center should restore focus to its trigger."
);

assert.match(
  source,
  /helpCenterModal\?\.addEventListener\("keydown"[\s\S]*?event\.key === "Escape"[\s\S]*?event\.key !== "Tab"[\s\S]*?first\.focus\(\)[\s\S]*?last\.focus\(\)/,
  "Help Center should support Escape dismissal and contained keyboard focus."
);

assert.match(
  source,
  /mobileMenuPane\?\.addEventListener\("click"[\s\S]*?closest\("\.mobile-menu-summary"\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?target === menuHelpCenterBtn[\s\S]*?setHelpCenterVisibility\(true\)/,
  "The responsive main menu should keep tablet disclosures open and launch Help Center directly."
);

assert.match(
  source,
  /@media \(max-width: 600px\)[\s\S]*?#helpCenterModal\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?#helpCenterModal \.help-modal\s*\{[\s\S]*?max-height:\s*min\(86dvh, 760px\);[\s\S]*?border-radius:\s*22px 22px 0 0;[\s\S]*?env\(safe-area-inset-bottom/,
  "Help Center should become a bounded, safe-area-aware phone sheet."
);

console.log("Help Center journey regression checks passed.");
