#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const MAX_DOCUMENT_BYTES = 1_000_000;
export const NEAR_EXPIRY_MILLISECONDS = 14 * 24 * 60 * 60 * 1_000;

const KEY_HASH_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_READ_SCOPES = Object.freeze(["maps:read"]);
const CANONICAL_WRITE_SCOPES = Object.freeze(["maps:read", "maps:write"]);
const DESCRIPTOR_FIELDS = Object.freeze(["expires_at", "owner_id", "scopes"]);

export class KeyDocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "KeyDocumentError";
  }
}

function failJson() {
  throw new KeyDocumentError("The document is not valid JSON.");
}

function scanJsonWithoutDuplicateFields(text) {
  let index = 0;

  function skipWhitespace() {
    while (index < text.length && /[\t\n\r ]/.test(text[index])) index += 1;
  }

  function scanString() {
    if (text[index] !== '"') failJson();
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          failJson();
        }
      }
      if (character === "\\") {
        index += 1;
        const escape = text[index];
        if (escape === "u") {
          const digits = text.slice(index + 1, index + 5);
          if (!/^[a-fA-F0-9]{4}$/.test(digits)) failJson();
          index += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape)) failJson();
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) failJson();
      index += 1;
    }
    failJson();
  }

  function scanValue(depth = 0) {
    if (depth > 64) throw new KeyDocumentError("The JSON document is nested too deeply.");
    skipWhitespace();
    const character = text[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const fields = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        const field = scanString();
        if (fields.has(field)) {
          throw new KeyDocumentError("The JSON document contains a duplicate object field.");
        }
        fields.add(field);
        skipWhitespace();
        if (text[index] !== ":") failJson();
        index += 1;
        scanValue(depth + 1);
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") failJson();
        index += 1;
      }
      failJson();
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        scanValue(depth + 1);
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") failJson();
        index += 1;
      }
      failJson();
    }
    if (character === '"') {
      scanString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!number) failJson();
    index += number[0].length;
  }

  skipWhitespace();
  scanValue();
  skipWhitespace();
  if (index !== text.length) failJson();
}

function parseJson(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new KeyDocumentError("The document is larger than the 1 MB safety limit.");
  }
  scanJsonWithoutDuplicateFields(text);
  try {
    return JSON.parse(text);
  } catch {
    failJson();
  }
}

export function rfc3339Milliseconds(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const calendarSecond = Math.min(parts[5], 59);
  const calendar = new Date(0);
  calendar.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  calendar.setUTCHours(parts[3], parts[4], calendarSecond, 0);
  if (calendar.getUTCFullYear() !== parts[0] || calendar.getUTCMonth() !== parts[1] - 1 ||
      calendar.getUTCDate() !== parts[2] || calendar.getUTCHours() !== parts[3] ||
      calendar.getUTCMinutes() !== parts[4] || calendar.getUTCSeconds() !== calendarSecond || parts[5] > 60 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return null;
  const normalized = (parts[5] === 60
    ? value.replace(/:60(?=(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$)/, ":59")
    : value).replace("t", "T").replace(/z$/, "Z");
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? milliseconds + (parts[5] === 60 ? 1_000 : 0) : null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isCanonicalScopes(scopes) {
  if (!Array.isArray(scopes)) return false;
  return (scopes.length === 1 && scopes[0] === CANONICAL_READ_SCOPES[0]) ||
    (scopes.length === 2 && scopes[0] === CANONICAL_WRITE_SCOPES[0] && scopes[1] === CANONICAL_WRITE_SCOPES[1]);
}

function descriptorEntry(hash, configured, nowMilliseconds, options = {}) {
  const allowExpired = options.allowExpired ?? false;
  const requireCanonical = options.requireCanonical ?? true;
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
    throw new KeyDocumentError("Every scoped entry must be an object descriptor.");
  }
  const fields = Object.keys(configured).sort();
  const canonicalFields = fields.length === DESCRIPTOR_FIELDS.length &&
    fields.every((field, position) => field === DESCRIPTOR_FIELDS[position]);
  if (!DESCRIPTOR_FIELDS.every((field) => Object.hasOwn(configured, field)) || (requireCanonical && !canonicalFields)) {
    throw new KeyDocumentError("A scoped descriptor contains missing or unknown fields.");
  }
  if (typeof configured.owner_id !== "string" || !configured.owner_id || configured.owner_id !== configured.owner_id.trim()) {
    throw new KeyDocumentError("Every owner_id must be a non-empty string without surrounding whitespace.");
  }
  const runtimeCompatibleScopes = Array.isArray(configured.scopes) && configured.scopes.length > 0 &&
    configured.scopes.every((scope) => scope === "maps:read" || scope === "maps:write") &&
    new Set(configured.scopes).size === configured.scopes.length && configured.scopes.includes("maps:read");
  if (!runtimeCompatibleScopes || (requireCanonical && !isCanonicalScopes(configured.scopes))) {
    throw new KeyDocumentError("Scopes must be exactly [maps:read] or [maps:read, maps:write], in that order.");
  }
  const expiryMilliseconds = rfc3339Milliseconds(configured.expires_at);
  if (expiryMilliseconds === null) {
    throw new KeyDocumentError("Every expires_at must be a valid RFC3339 timestamp.");
  }
  if (!allowExpired && expiryMilliseconds <= nowMilliseconds) {
    throw new KeyDocumentError("Every scoped key in the proposed document must expire in the future.");
  }
  return {
    hash,
    kind: "scoped",
    ownerId: configured.owner_id,
    scopes: Object.freeze([...configured.scopes]),
    expiresAt: configured.expires_at,
    expiryMilliseconds,
    expired: expiryMilliseconds <= nowMilliseconds,
    noncanonical: !canonicalFields || !isCanonicalScopes(configured.scopes),
    canonicalValue: canonicalJson(configured),
  };
}

function legacyEntry(hash, configured, requireCanonical = true) {
  if (!configured || (requireCanonical && configured !== configured.trim())) {
    throw new KeyDocumentError("Every legacy owner ID must be non-empty; new owner IDs may not have surrounding whitespace.");
  }
  return {
    hash,
    kind: "legacy",
    ownerId: configured,
    scopes: Object.freeze([...CANONICAL_WRITE_SCOPES]),
    expiresAt: null,
    expiryMilliseconds: null,
    expired: false,
    noncanonical: configured !== configured.trim(),
    canonicalValue: canonicalJson(configured),
  };
}

export function validateDocumentText(text, options = {}) {
  const role = options.role ?? "document";
  const nowMilliseconds = options.nowMilliseconds ?? Date.now();
  const retainedEntries = options.retainedEntries ?? new Map();
  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new KeyDocumentError("The key document must be a JSON object.");
  }
  const configuredEntries = Object.entries(parsed);
  if (configuredEntries.length === 0) {
    throw new KeyDocumentError("The key document must contain at least one key.");
  }

  const entries = configuredEntries.map(([hash, configured]) => {
    if (!KEY_HASH_PATTERN.test(hash)) {
      throw new KeyDocumentError("Every property name must be a 64-character lowercase SHA-256 hash.");
    }
    if (typeof configured === "string") {
      if (role === "current") return legacyEntry(hash, configured, false);
      if (role === "proposed" && retainedEntries.get(hash) === canonicalJson(configured)) {
        return legacyEntry(hash, configured, false);
      }
      legacyEntry(hash, configured);
      throw new KeyDocumentError("New key documents must use scoped, expiring descriptors; a legacy entry was not retained unchanged.");
    }
    const retainedUnchanged = role === "proposed" && retainedEntries.get(hash) === canonicalJson(configured);
    return descriptorEntry(hash, configured, nowMilliseconds, {
      allowExpired: role === "current" || retainedUnchanged,
      requireCanonical: role !== "current" && !retainedUnchanged,
    });
  }).sort((left, right) => left.hash.localeCompare(right.hash));

  const byHash = new Map(entries.map((entry) => [entry.hash, entry]));
  return Object.freeze({ entries: Object.freeze(entries), byHash });
}

function summary(document) {
  const scoped = document.entries.filter((entry) => entry.kind === "scoped");
  const legacy = document.entries.length - scoped.length;
  return {
    keys: document.entries.length,
    owners: new Set(document.entries.map((entry) => entry.ownerId)).size,
    scoped: scoped.length,
    legacy,
    readOnly: scoped.filter((entry) => entry.scopes.length === 1).length,
    readWrite: scoped.filter((entry) => entry.scopes.length === 2).length,
    expired: scoped.filter((entry) => entry.expired).length,
  };
}

function warningsFor(document, nowMilliseconds) {
  const result = [];
  const details = summary(document);
  if (details.legacy > 0) {
    result.push(`${details.legacy} retained legacy full-access ${details.legacy === 1 ? "key remains" : "keys remain"}; retire it after the rollback window closes.`);
  }
  if (details.expired > 0) {
    result.push(`${details.expired} expired ${details.expired === 1 ? "entry is" : "entries are"} present in the current document and must be retired.`);
  }
  const noncanonical = document.entries.filter((entry) => entry.noncanonical).length;
  if (noncanonical > 0) {
    result.push(`${noncanonical} retained runtime-compatible ${noncanonical === 1 ? "entry is" : "entries are"} noncanonical and needs operator review before retirement.`);
  }
  const nearExpiry = document.entries.filter((entry) => entry.kind === "scoped" && !entry.expired &&
    entry.expiryMilliseconds - nowMilliseconds <= NEAR_EXPIRY_MILLISECONDS).length;
  if (nearExpiry > 0) {
    result.push(`${nearExpiry} scoped ${nearExpiry === 1 ? "key expires" : "keys expire"} within 14 days.`);
  }
  return result;
}

function entryCovers(retained, removed) {
  return !retained.expired && retained.ownerId === removed.ownerId &&
    removed.scopes.every((scope) => retained.scopes.includes(scope));
}

export function validateKeyDocument(text, options = {}) {
  const nowMilliseconds = options.nowMilliseconds ?? Date.now();
  const document = validateDocumentText(text, { role: "document", nowMilliseconds });
  return {
    kind: "validation",
    summary: summary(document),
    warnings: warningsFor(document, nowMilliseconds),
  };
}

export function planKeyRotation(currentText, proposedText, options = {}) {
  const phase = options.phase;
  if (phase !== "stage" && phase !== "retire") {
    throw new KeyDocumentError("Rotation phase must be stage or retire.");
  }
  const nowMilliseconds = options.nowMilliseconds ?? Date.now();
  const current = validateDocumentText(currentText, { role: "current", nowMilliseconds });
  const retainedEntries = new Map(current.entries.map((entry) => [entry.hash, entry.canonicalValue]));
  const proposed = validateDocumentText(proposedText, { role: "proposed", nowMilliseconds, retainedEntries });

  const added = proposed.entries.filter((entry) => !current.byHash.has(entry.hash));
  const removed = current.entries.filter((entry) => !proposed.byHash.has(entry.hash));
  const changed = current.entries.filter((entry) => {
    const replacement = proposed.byHash.get(entry.hash);
    return replacement && replacement.canonicalValue !== entry.canonicalValue;
  });
  const retained = current.entries.length - removed.length - changed.length;

  if (changed.length > 0) {
    throw new KeyDocumentError("An existing hash changes owner, scope, or expiry. Issue a new raw key and rotate to a new hash instead.");
  }
  if (phase === "stage") {
    if (removed.length > 0) {
      throw new KeyDocumentError("The stage phase must retain every current key unchanged.");
    }
    if (added.length === 0) {
      throw new KeyDocumentError("The stage phase must add at least one new scoped key.");
    }
  } else {
    if (added.length > 0) {
      throw new KeyDocumentError("The retire phase may only remove keys; stage additions in a separate document first.");
    }
    if (removed.length === 0) {
      throw new KeyDocumentError("The retire phase must remove at least one key.");
    }
    for (const entry of removed) {
      if (!proposed.entries.some((candidate) => entryCovers(candidate, entry))) {
        throw new KeyDocumentError("Retirement would remove an owner's last credential or reduce that owner's required scope coverage.");
      }
    }
  }

  const warnings = [...warningsFor(proposed, nowMilliseconds)];
  if (phase === "retire" && current.entries.some((entry) => entry.kind === "legacy") && !proposed.entries.some((entry) => entry.kind === "legacy")) {
    warnings.push("No legacy rollback credential remains; confirm the pre-1.2.0 Worker rollback window is closed.");
  }

  return {
    kind: "rotation",
    phase,
    current: summary(current),
    proposed: summary(proposed),
    changes: { added: added.length, retained, retired: removed.length },
    warnings,
  };
}

function formatSummary(label, details) {
  return `${label}: ${details.keys} keys, ${details.owners} owners, ${details.scoped} scoped (${details.readOnly} read-only, ${details.readWrite} read/write), ${details.legacy} legacy.`;
}

export function formatResult(result, json = false) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  const lines = [];
  if (result.kind === "validation") {
    lines.push("Valid LalGeo Maps API key document.", formatSummary("Document", result.summary));
    lines.push("Next: keep this complete document in the password manager; validation does not prove production authentication.");
  } else {
    lines.push(`Valid ${result.phase} rotation plan.`);
    lines.push(formatSummary("Current", result.current), formatSummary("Proposed", result.proposed));
    lines.push(`Changes: +${result.changes.added} added, ${result.changes.retained} retained, -${result.changes.retired} retired.`);
    lines.push(result.phase === "stage"
      ? "Next: upload the complete proposed document after readiness passes, then accept the new key before retirement."
      : "Next: upload the complete proposed document only after the retained key has passed owner acceptance.");
  }
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  return `${lines.join("\n")}\n`;
}

function usage() {
  return [
    "Validate a complete proposed document:",
    "  npm run keys:validate -- --document <path|-> [--json]",
    "",
    "Plan a safe two-phase rotation:",
    "  npm run keys:plan -- --phase <stage|retire> --current <path> --proposed <path> [--json]",
  ].join("\n");
}

function parseArguments(argv) {
  const mode = argv[0];
  if (mode !== "validate" && mode !== "plan") throw new KeyDocumentError(usage());
  const options = { mode, json: false };
  const valued = new Set(["--document", "--current", "--proposed", "--phase"]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      if (options.json) throw new KeyDocumentError("Option --json may be supplied only once.");
      options.json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!valued.has(argument)) throw new KeyDocumentError("Unknown option.\n\n" + usage());
    if (Object.hasOwn(options, argument.slice(2))) throw new KeyDocumentError(`Option ${argument} may be supplied only once.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new KeyDocumentError(`Option ${argument} requires a value.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  if (mode === "validate") {
    if (!options.document || options.current || options.proposed || options.phase) throw new KeyDocumentError(usage());
  } else if (!options.current || !options.proposed || !options.phase || options.document) {
    throw new KeyDocumentError(usage());
  }
  if (mode === "plan" && options.current === "-" && options.proposed === "-") {
    throw new KeyDocumentError("Only one plan input may use stdin.");
  }
  return options;
}

async function readStdin() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_DOCUMENT_BYTES) throw new KeyDocumentError("The document is larger than the 1 MB safety limit.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readSource(source, label) {
  if (source === "-") return readStdin();
  try {
    const details = await stat(source);
    if (!details.isFile()) throw new Error();
    if (details.size > MAX_DOCUMENT_BYTES) throw new KeyDocumentError("The document is larger than the 1 MB safety limit.");
    const contents = await readFile(source);
    if (contents.length > MAX_DOCUMENT_BYTES) throw new KeyDocumentError("The document is larger than the 1 MB safety limit.");
    return contents.toString("utf8");
  } catch (error) {
    if (error instanceof KeyDocumentError) throw error;
    throw new KeyDocumentError(`Could not read the ${label} document.`);
  }
}

export async function runCli(argv) {
  const options = parseArguments(argv);
  if (options.help) return { output: `${usage()}\n`, error: false };
  const nowMilliseconds = Date.now();
  if (options.mode === "validate") {
    const document = await readSource(options.document, "key");
    return { output: formatResult(validateKeyDocument(document, { nowMilliseconds }), options.json), error: false };
  }
  const [current, proposed] = await Promise.all([
    readSource(options.current, "current"),
    readSource(options.proposed, "proposed"),
  ]);
  return {
    output: formatResult(planKeyRotation(current, proposed, { phase: options.phase, nowMilliseconds }), options.json),
    error: false,
  };
}

async function main() {
  try {
    const result = await runCli(process.argv.slice(2));
    process.stdout.write(result.output);
  } catch (error) {
    const message = error instanceof KeyDocumentError ? error.message : "The key document could not be checked.";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
