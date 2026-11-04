import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  KeyDocumentError,
  MAX_DOCUMENT_BYTES,
  formatResult,
  planKeyRotation,
  validateDocumentText,
  validateKeyDocument,
} from "../scripts/key-document.mjs";

const NOW_TEXT = "2026-11-02T00:00:00Z";
const NOW = Date.parse(NOW_TEXT);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const RAW_SENTINEL = `lalgeo_maps_${"d".repeat(64)}`;
const SCRIPT = fileURLToPath(new URL("../scripts/key-document.mjs", import.meta.url));

function scoped(ownerId = "owner_alpha", scopes = ["maps:read"], expiresAt = "2027-11-02T00:00:00Z") {
  return { owner_id: ownerId, scopes, expires_at: expiresAt };
}

function document(entries) {
  return JSON.stringify(Object.fromEntries(entries));
}

function throwsMessage(callback, expression) {
  assert.throws(callback, (error) => error instanceof KeyDocumentError && expression.test(error.message));
}

test("strict validation accepts only canonical scoped documents and returns a secret-free summary", () => {
  const input = document([
    [HASH_A, scoped()],
    [HASH_B, scoped("owner_alpha", ["maps:read", "maps:write"])],
    [HASH_C, scoped("owner_beta")],
  ]);
  const result = validateKeyDocument(input, { nowMilliseconds: NOW });
  assert.deepEqual(result.summary, {
    keys: 3,
    owners: 2,
    scoped: 3,
    legacy: 0,
    readOnly: 2,
    readWrite: 1,
    expired: 0,
  });
  assert.deepEqual(result.warnings, []);
  const output = formatResult(result);
  assert.match(output, /Valid LalGeo Maps API key document/);
  assert.doesNotMatch(output, new RegExp(HASH_A));
  assert.doesNotMatch(output, /owner_alpha/);
});

test("JSON parsing rejects malformed, empty, non-object, oversized, and duplicate-field documents", () => {
  for (const input of ["{", "{}", "[]", "null"]) {
    assert.throws(() => validateKeyDocument(input, { nowMilliseconds: NOW }), KeyDocumentError);
  }
  throwsMessage(
    () => validateKeyDocument(`{"${HASH_A}":${JSON.stringify(scoped())},"${HASH_A}":${JSON.stringify(scoped("owner_beta"))}}`, { nowMilliseconds: NOW }),
    /duplicate object field/,
  );
  throwsMessage(
    () => validateKeyDocument(`{"${HASH_A}":{"owner_id":"owner_alpha","owner_id":"owner_beta","scopes":["maps:read"],"expires_at":"2027-11-02T00:00:00Z"}}`, { nowMilliseconds: NOW }),
    /duplicate object field/,
  );
  throwsMessage(() => validateKeyDocument(" ".repeat(MAX_DOCUMENT_BYTES + 1)), /larger than the 1 MB/);
});

test("property names must be exact lowercase SHA-256 hashes without leaking the supplied value", () => {
  for (const invalidHash of ["a".repeat(63), "A".repeat(64), RAW_SENTINEL]) {
    let failure;
    try {
      validateKeyDocument(document([[invalidHash, scoped()]]), { nowMilliseconds: NOW });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof KeyDocumentError);
    assert.match(failure.message, /64-character lowercase SHA-256 hash/);
    assert.doesNotMatch(failure.message, new RegExp(invalidHash));
  }
});

test("descriptor validation rejects unknown fields, invalid owners, and noncanonical scopes", () => {
  const invalidDescriptors = [
    { ...scoped(), note: "typo" },
    { owner_id: "owner_alpha", scopes: ["maps:read"] },
    scoped(" owner_alpha"),
    scoped(""),
    scoped("owner_alpha", ["maps:write"]),
    scoped("owner_alpha", ["maps:write", "maps:read"]),
    scoped("owner_alpha", ["maps:read", "maps:read"]),
    scoped("owner_alpha", ["maps:read", "maps:admin"]),
  ];
  for (const descriptor of invalidDescriptors) {
    assert.throws(
      () => validateKeyDocument(document([[HASH_A, descriptor]]), { nowMilliseconds: NOW }),
      KeyDocumentError,
    );
  }
});

test("strict validation requires a valid future RFC3339 expiry", () => {
  for (const expiry of ["not-a-date", "2026-02-30T00:00:00Z", NOW_TEXT, "2026-11-01T23:59:59Z"]) {
    assert.throws(
      () => validateKeyDocument(document([[HASH_A, scoped("owner_alpha", ["maps:read"], expiry)]]), { nowMilliseconds: NOW }),
      KeyDocumentError,
    );
  }
  assert.doesNotThrow(() => validateKeyDocument(
    document([[HASH_A, scoped("owner_alpha", ["maps:read"], "2026-11-02T00:00:01+00:00")]]),
    { nowMilliseconds: NOW },
  ));
});

test("current compatibility accepts runtime-compatible legacy and scoped entries only for planning", () => {
  const noncanonicalDescriptor = {
    owner_id: "owner_alpha",
    scopes: ["maps:write", "maps:read"],
    expires_at: "2026-11-01T00:00:00Z",
    retained_note: "runtime ignores this field",
  };
  const currentText = document([
    [HASH_A, " owner_alpha "],
    [HASH_B, noncanonicalDescriptor],
  ]);
  const current = validateDocumentText(currentText, { role: "current", nowMilliseconds: NOW });
  assert.equal(current.entries[0].kind, "legacy");
  assert.equal(current.entries[1].expired, true);
  assert.equal(current.entries[0].noncanonical, true);
  assert.equal(current.entries[1].noncanonical, true);
  assert.throws(() => validateKeyDocument(currentText, { nowMilliseconds: NOW }), KeyDocumentError);

  const staged = planKeyRotation(
    currentText,
    document([[HASH_A, " owner_alpha "], [HASH_B, noncanonicalDescriptor], [HASH_C, scoped("owner_beta")]]),
    { phase: "stage", nowMilliseconds: NOW },
  );
  assert.match(staged.warnings.join("\n"), /2 retained runtime-compatible entries are noncanonical/);
});

test("stage plans add scoped keys while retaining every existing entry unchanged", () => {
  const current = document([
    [HASH_A, "owner_alpha"],
    [HASH_B, scoped("owner_beta")],
  ]);
  const proposed = document([
    [HASH_A, "owner_alpha"],
    [HASH_B, scoped("owner_beta")],
    [HASH_C, scoped("owner_alpha", ["maps:read", "maps:write"])],
  ]);
  const result = planKeyRotation(current, proposed, { phase: "stage", nowMilliseconds: NOW });
  assert.deepEqual(result.changes, { added: 1, retained: 2, retired: 0 });
  assert.match(result.warnings.join("\n"), /retained legacy full-access key/);
  const output = formatResult(result);
  assert.doesNotMatch(output, new RegExp(HASH_A));
  assert.doesNotMatch(output, /owner_alpha/);
});

test("stage plans reject removals, no-op plans, new legacy entries, and same-hash edits", () => {
  const first = document([[HASH_A, scoped()]]);
  assert.throws(() => planKeyRotation(first, first, { phase: "stage", nowMilliseconds: NOW }), /must add at least one/);
  assert.throws(
    () => planKeyRotation(document([[HASH_A, scoped()], [HASH_B, scoped()]]), document([[HASH_A, scoped()], [HASH_C, scoped()]]), { phase: "stage", nowMilliseconds: NOW }),
    /retain every current key/,
  );
  assert.throws(
    () => planKeyRotation(first, document([[HASH_A, scoped()], [HASH_B, "owner_alpha"]]), { phase: "stage", nowMilliseconds: NOW }),
    /legacy entry was not retained/,
  );
  assert.throws(
    () => planKeyRotation(first, document([[HASH_A, scoped("owner_beta")], [HASH_B, scoped()]]), { phase: "stage", nowMilliseconds: NOW }),
    /rotate to a new hash/,
  );
});

test("stage plans may retain an expired current entry but reject a newly added expired entry", () => {
  const expired = scoped("owner_alpha", ["maps:read"], "2026-11-01T00:00:00Z");
  const current = document([[HASH_A, expired]]);
  const proposed = document([[HASH_A, expired], [HASH_B, scoped()]]);
  const result = planKeyRotation(current, proposed, { phase: "stage", nowMilliseconds: NOW });
  assert.deepEqual(result.changes, { added: 1, retained: 1, retired: 0 });
  assert.match(result.warnings.join("\n"), /expired entry is present/);

  assert.throws(
    () => planKeyRotation(
      current,
      document([[HASH_A, expired], [HASH_B, scoped("owner_alpha", ["maps:read"], "2026-11-01T00:00:00Z")]]),
      { phase: "stage", nowMilliseconds: NOW },
    ),
    /expire in the future/,
  );
});

test("retire plans preserve each removed owner's scope coverage", () => {
  const current = document([
    [HASH_A, scoped("owner_alpha", ["maps:read"])],
    [HASH_B, scoped("owner_alpha", ["maps:read", "maps:write"])],
    [HASH_C, scoped("owner_beta")],
  ]);
  const proposed = document([
    [HASH_B, scoped("owner_alpha", ["maps:read", "maps:write"])],
    [HASH_C, scoped("owner_beta")],
  ]);
  const result = planKeyRotation(current, proposed, { phase: "retire", nowMilliseconds: NOW });
  assert.deepEqual(result.changes, { added: 0, retained: 2, retired: 1 });

  assert.throws(
    () => planKeyRotation(
      document([[HASH_A, "owner_alpha"], [HASH_B, scoped("owner_alpha")]]),
      document([[HASH_B, scoped("owner_alpha")]]),
      { phase: "retire", nowMilliseconds: NOW },
    ),
    /scope coverage/,
  );
  assert.throws(
    () => planKeyRotation(document([[HASH_A, scoped()]]), document([[HASH_B, scoped("owner_beta")]]), { phase: "retire", nowMilliseconds: NOW }),
    /may only remove keys/,
  );
  assert.throws(
    () => planKeyRotation(document([[HASH_A, scoped()], [HASH_B, scoped("owner_beta")]]), document([[HASH_B, scoped("owner_beta")]]), { phase: "retire", nowMilliseconds: NOW }),
    /last credential/,
  );

  const expiredWrite = scoped("owner_alpha", ["maps:read", "maps:write"], "2026-11-01T00:00:00Z");
  assert.throws(
    () => planKeyRotation(
      document([[HASH_A, scoped("owner_alpha", ["maps:read", "maps:write"])], [HASH_B, expiredWrite]]),
      document([[HASH_B, expiredWrite]]),
      { phase: "retire", nowMilliseconds: NOW },
    ),
    /last credential/,
  );
});

test("deeply nested JSON fails with a bounded sanitized error", () => {
  const nested = `${"[".repeat(70)}null${"]".repeat(70)}`;
  throwsMessage(() => validateKeyDocument(nested, { nowMilliseconds: NOW }), /nested too deeply/);
});

test("retiring the final legacy key is allowed with full scoped coverage and warns about rollback", () => {
  const current = document([
    [HASH_A, "owner_alpha"],
    [HASH_B, scoped("owner_alpha", ["maps:read", "maps:write"])],
  ]);
  const proposed = document([[HASH_B, scoped("owner_alpha", ["maps:read", "maps:write"])]]);
  const result = planKeyRotation(current, proposed, { phase: "retire", nowMilliseconds: NOW });
  assert.match(result.warnings.join("\n"), /rollback window is closed/);
});

test("near-expiry warnings are deterministic at the injected clock", () => {
  const input = document([[HASH_A, scoped("owner_alpha", ["maps:read"], "2026-11-15T23:59:59Z")]]);
  const result = validateKeyDocument(input, { nowMilliseconds: NOW });
  assert.deepEqual(result.warnings, ["1 scoped key expires within 14 days."]);
});

test("CLI returns redacted JSON for stdin and never echoes invalid secrets or hashes", async () => {
  const valid = document([[HASH_A, scoped("owner_alpha", ["maps:read"], "2099-11-02T00:00:00Z")]]);
  const success = spawnSync(process.execPath, [SCRIPT, "validate", "--document", "-", "--json"], {
    input: valid,
    encoding: "utf8",
  });
  assert.equal(success.status, 0, success.stderr);
  const parsed = JSON.parse(success.stdout);
  assert.equal(parsed.summary.keys, 1);
  assert.doesNotMatch(success.stdout, new RegExp(HASH_A));

  const invalid = document([[RAW_SENTINEL, scoped()]]);
  const failure = spawnSync(process.execPath, [SCRIPT, "validate", "--document", "-"], {
    input: invalid,
    encoding: "utf8",
  });
  assert.equal(failure.status, 1);
  assert.doesNotMatch(failure.stderr, new RegExp(RAW_SENTINEL));
  assert.doesNotMatch(failure.stderr, new RegExp(HASH_A));
});

test("CLI stage planning reads bounded local files and reports safe counts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lalgeo-key-plan-"));
  try {
    const currentPath = join(directory, "current.json");
    const proposedPath = join(directory, "proposed.json");
    const longLivedRead = scoped("owner_alpha", ["maps:read"], "2099-11-02T00:00:00Z");
    const longLivedWrite = scoped("owner_alpha", ["maps:read", "maps:write"], "2099-11-02T00:00:00Z");
    await writeFile(currentPath, document([[HASH_A, longLivedRead]]), { mode: 0o600 });
    await writeFile(proposedPath, document([[HASH_A, longLivedRead], [HASH_B, longLivedWrite]]), { mode: 0o600 });
    const result = spawnSync(process.execPath, [
      SCRIPT,
      "plan",
      "--phase", "stage",
      "--current", currentPath,
      "--proposed", proposedPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\+1 added, 1 retained, -0 retired/);
    assert.doesNotMatch(result.stdout, new RegExp(HASH_A));
    assert.doesNotMatch(result.stdout, /owner_alpha/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
