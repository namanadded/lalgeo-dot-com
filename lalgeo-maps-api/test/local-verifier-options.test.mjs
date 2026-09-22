import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DATABASE,
  DEFAULT_REQUEST_HOSTNAME,
  DEFAULT_WORKER_DIRECTORY,
  createErrorResponseValidator,
  isEntryPoint,
  normalizeDatabaseName,
  normalizeRequestHostname,
  parseArguments,
  usage,
} from "../scripts/verify-local.mjs";

const spec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));

test("local gate validates documented error bodies and matching request IDs", async () => {
  const errors = createErrorResponseValidator(spec);
  const reply = (status, code, requestId = "synthetic_error") => new Response(JSON.stringify({
    error: { code, message: "Synthetic error" }, request_id: requestId,
  }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": "synthetic_error",
      ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="lalgeo-maps-api"' } : {}),
    },
  });
  assert.equal((await errors.validate("createMap", reply(409, "ID_CONFLICT"))).error.code, "ID_CONFLICT");
  await assert.rejects(errors.validate("createMap", reply(409, "UNKNOWN_ERROR")), /does not match OpenAPI/);
  await assert.rejects(errors.validate("createMap", reply(409, "ID_CONFLICT", "different_id")), /request_id/);
  await assert.rejects(errors.validate("listMaps", reply(409, "ID_CONFLICT")), /No documented error response/);
});

test("local gate recognizes a symlinked CLI entry point", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lalgeo-local-gate-entry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const link = path.join(directory, "verify-local.mjs");
  await symlink(fileURLToPath(new URL("../scripts/verify-local.mjs", import.meta.url)), link);
  assert.equal(await isEntryPoint(link), true);
});

test("local gate defaults to the standalone Worker", () => {
  assert.deepEqual(parseArguments([]), {
    workerDirectory: DEFAULT_WORKER_DIRECTORY,
    database: DEFAULT_DATABASE,
    requestHostname: DEFAULT_REQUEST_HOSTNAME,
    help: false,
  });
});

test("local gate accepts an explicit Worker directory and safe D1 database", () => {
  const callerDirectory = path.resolve("/synthetic/repository/lalgeo-saas-api");
  assert.deepEqual(parseArguments([
    "--worker-directory", ".",
    "--database=lalgeo-business",
    "--request-hostname", "api.lalgeo.com",
  ], callerDirectory), {
    workerDirectory: callerDirectory,
    database: "lalgeo-business",
    requestHostname: "api.lalgeo.com",
    help: false,
  });
  assert.deepEqual(parseArguments([
    "--worker-directory=../worker",
    "--database", "maps_test_1",
    "--request-hostname=API.LALGEO.COM",
    "--help",
  ], callerDirectory), {
    workerDirectory: path.resolve(callerDirectory, "../worker"),
    database: "maps_test_1",
    requestHostname: "api.lalgeo.com",
    help: true,
  });
  assert.equal(normalizeDatabaseName(" lalgeo-business "), "lalgeo-business");
  assert.equal(normalizeRequestHostname(" API.LALGEO.COM "), "api.lalgeo.com");
  assert.match(usage(), /always run locally/);
});

test("local gate rejects missing, unsafe, and unknown options", () => {
  assert.throws(() => parseArguments(["--worker-directory"]), /requires a value/);
  assert.throws(() => parseArguments(["--worker-directory="]), /requires a value/);
  assert.throws(() => parseArguments(["--database"]), /requires a value/);
  assert.throws(() => parseArguments(["--database=lalgeo business"]), /Database names may contain only/);
  assert.throws(() => parseArguments(["--database=--remote"]), /Database names may contain only/);
  assert.throws(() => parseArguments(["--request-hostname=https:\/\/api.lalgeo.com"]), /plain DNS hostname/);
  assert.throws(() => parseArguments(["--request-hostname=api.lalgeo.com:443"]), /plain DNS hostname/);
  assert.throws(() => parseArguments(["--request-hostname=api..lalgeo.com"]), /plain DNS hostname/);
  assert.throws(() => parseArguments(["--remote"]), /Unknown option/);
});
