#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BASE_URL = "https://api.lalgeo.com";
export const DEFAULT_ORIGIN = "https://maps.lalgeo.com";
export const DEFAULT_TIMEOUT_MS = 10_000;

export const REQUIRED_OPERATIONS = Object.freeze({
  "/v1/health": Object.freeze({ get: "getHealth" }),
  "/v1/openapi.json": Object.freeze({ get: "getOpenApi" }),
  "/v1/maps": Object.freeze({ get: "listMaps", post: "createMap" }),
  "/v1/maps/{mapId}": Object.freeze({ get: "getMap", patch: "updateMap", delete: "deleteMap" }),
  "/v1/maps/{mapId}/export": Object.freeze({ get: "exportMap" }),
  "/v1/maps/{mapId}/layers": Object.freeze({ get: "listLayers", post: "createLayer" }),
  "/v1/maps/{mapId}/layers/{layerId}": Object.freeze({ get: "getLayer", patch: "updateLayer", delete: "deleteLayer" }),
  "/v1/maps/{mapId}/layers/{layerId}/features": Object.freeze({ get: "listFeatures", post: "createFeatures" }),
  "/v1/maps/{mapId}/layers/{layerId}/features/{featureId}": Object.freeze({ get: "getFeature", patch: "updateFeature", delete: "deleteFeature" }),
});

const CANONICAL_SERVER = DEFAULT_BASE_URL;
const DISALLOWED_ORIGIN = "https://cors-probe.invalid";
const MAX_RESPONSE_BYTES = 5_000_000;
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const SAFE_REQUEST_METHODS = new Set(["GET", "OPTIONS"]);
const FORBIDDEN_CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization", "x-api-key", "x-lalgeo-api-key"];

export class VerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerificationError";
  }
}

function check(condition, message) {
  if (!condition) throw new VerificationError(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLoopbackHostname(hostname) {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value.endsWith(".localhost") || value === "::1" || value === "0:0:0:0:0:0:0:1") return true;
  if (!/^127(?:\.\d{1,3}){3}$/.test(value)) return false;
  return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function parseUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new VerificationError(`${label} must be an absolute URL.`);
  }
  check(!url.username && !url.password, `${label} must not contain credentials.`);
  check(!url.search && !url.hash, `${label} must not contain a query string or fragment.`);
  check(url.pathname === "/", `${label} must be an origin without a path.`);
  return url;
}

export function normalizeBaseUrl(value) {
  const url = parseUrl(value, "Base URL");
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && isLoopbackHostname(url.hostname);
  check(secure || localHttp, "Base URL must use HTTPS; HTTP is allowed only for a loopback host.");
  return url.origin;
}

export function normalizeOrigin(value) {
  const url = parseUrl(value, "Origin");
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && isLoopbackHostname(url.hostname);
  check(secure || localHttp, "Origin must use HTTPS; HTTP is allowed only for a loopback host.");
  return url.origin;
}

export function assertTlsSafety(environment = process.env) {
  check(environment.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "Refusing to run while NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate verification.");
}

function readOption(argv, index, option) {
  const value = argv[index + 1];
  check(value && !value.startsWith("--"), `${option} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  let baseUrl = DEFAULT_BASE_URL;
  let origin = DEFAULT_ORIGIN;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--base-url") {
      baseUrl = readOption(argv, index, "--base-url");
      index += 1;
    } else if (argument.startsWith("--base-url=")) {
      baseUrl = argument.slice("--base-url=".length);
      check(baseUrl, "--base-url requires a value.");
    } else if (argument === "--origin") {
      origin = readOption(argv, index, "--origin");
      index += 1;
    } else if (argument.startsWith("--origin=")) {
      origin = argument.slice("--origin=".length);
      check(origin, "--origin requires a value.");
    } else {
      throw new VerificationError(`Unknown option: ${argument}`);
    }
  }

  return { baseUrl, origin, help };
}

export function usage() {
  return [
    "Usage: node scripts/verify-production.mjs [options]",
    "",
    `  --base-url <url>  API origin (default: ${DEFAULT_BASE_URL})`,
    `  --origin <url>    Allowed browser origin to verify (default: ${DEFAULT_ORIGIN})`,
    "  --help            Show this help",
    "",
    "The verifier sends only unauthenticated GET and OPTIONS requests.",
  ].join("\n");
}

function errorReason(error) {
  if (isObject(error?.cause) && typeof error.cause.code === "string") return error.cause.code;
  if (isObject(error?.cause) && typeof error.cause.message === "string") return error.cause.message;
  return error instanceof Error ? error.message : String(error);
}

async function request(baseUrl, pathname, { method = "GET", headers = {}, fetchImpl, timeoutMs }) {
  check(SAFE_REQUEST_METHODS.has(method), `Internal safety check rejected mutating method ${method}.`);
  const target = new URL(pathname, `${baseUrl}/`);
  check(target.origin === baseUrl, "Internal safety check rejected a cross-origin request.");

  const outgoing = new Headers(headers);
  for (const header of FORBIDDEN_CREDENTIAL_HEADERS) {
    check(!outgoing.has(header), `Internal safety check rejected credential header ${header}.`);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(target, {
      method,
      headers: outgoing,
      body: undefined,
      credentials: "omit",
      redirect: "manual",
      signal: controller.signal,
    });
    check(response.status < 300 || response.status >= 400, `${method} ${pathname} redirected; refusing to follow a fallback target.`);

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new VerificationError(`${method} ${pathname} exceeded the ${MAX_RESPONSE_BYTES}-byte response limit.`);
    }

    const text = await response.text();
    check(new TextEncoder().encode(text).byteLength <= MAX_RESPONSE_BYTES, `${method} ${pathname} exceeded the ${MAX_RESPONSE_BYTES}-byte response limit.`);
    return { status: response.status, headers: response.headers, text };
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    if (timedOut) throw new VerificationError(`${method} ${pathname} timed out after ${timeoutMs} ms.`);
    throw new VerificationError(`${method} ${pathname} failed: ${errorReason(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function expectStatus(response, status, label) {
  check(response.status === status, `${label} returned HTTP ${response.status}; expected ${status}.`);
}

function expectJsonContentType(response, label) {
  const contentType = response.headers.get("content-type") || "";
  check(contentType.split(";", 1)[0].trim().toLowerCase() === "application/json", `${label} must return Content-Type application/json; received ${contentType || "none"}.`);
}

function parseJsonResponse(response, label) {
  expectJsonContentType(response, label);
  try {
    return JSON.parse(response.text);
  } catch {
    throw new VerificationError(`${label} did not return valid JSON.`);
  }
}

function expectRequestId(response, label) {
  const requestId = response.headers.get("x-request-id")?.trim();
  check(requestId, `${label} must return a non-empty X-Request-Id header.`);
  return requestId;
}

function headerTokens(response, name) {
  return (response.headers.get(name) || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function expectNoStore(response, label) {
  check(headerTokens(response, "cache-control").includes("no-store"), `${label} must return Cache-Control: no-store.`);
}

export function validateOpenApi(spec) {
  check(isObject(spec), "OpenAPI document must be a JSON object.");
  check(typeof spec.openapi === "string" && /^3\.1(?:\.\d+)?$/.test(spec.openapi), `OpenAPI version must be 3.1.x; received ${String(spec.openapi)}.`);
  check(Array.isArray(spec.servers) && spec.servers[0]?.url === CANONICAL_SERVER, `OpenAPI's primary server must be ${CANONICAL_SERVER}.`);

  const bearer = spec.components?.securitySchemes?.bearerAuth;
  check(isObject(bearer) && bearer.type === "http" && String(bearer.scheme).toLowerCase() === "bearer", "OpenAPI must define components.securitySchemes.bearerAuth as HTTP bearer authentication.");
  check(Array.isArray(spec.security) && spec.security.some((entry) => isObject(entry) && Array.isArray(entry.bearerAuth)), "OpenAPI must apply bearerAuth security by default.");

  for (const publicPath of ["/v1/health", "/v1/openapi.json"]) {
    const security = spec.paths?.[publicPath]?.get?.security;
    check(Array.isArray(security) && security.length === 0, `${publicPath} must explicitly allow unauthenticated GET requests.`);
  }

  for (const [path, methods] of Object.entries(REQUIRED_OPERATIONS)) {
    const pathItem = spec.paths?.[path];
    check(isObject(pathItem), `OpenAPI is missing required path ${path}.`);
    for (const [method, operationId] of Object.entries(methods)) {
      check(pathItem[method]?.operationId === operationId, `OpenAPI ${method.toUpperCase()} ${path} must use operationId ${operationId}.`);
    }
  }

  const operationIds = [];
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!isObject(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      check(isObject(operation) && typeof operation.operationId === "string" && operation.operationId, `OpenAPI ${method.toUpperCase()} ${path} must have an operationId.`);
      operationIds.push(operation.operationId);
    }
  }
  check(new Set(operationIds).size === operationIds.length, "OpenAPI operationIds must be unique.");
  return { operationCount: operationIds.length };
}

async function verifyHealth(options) {
  const result = await request(options.baseUrl, "/v1/health", {
    method: "GET",
    headers: { Accept: "application/json" },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  expectStatus(result, 200, "Health endpoint");
  expectRequestId(result, "Health endpoint");
  expectNoStore(result, "Health endpoint");
  const payload = parseJsonResponse(result, "Health endpoint");
  check(isObject(payload), "Health endpoint JSON must be an object.");
  check(JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(["ok", "service", "version"]), "Health endpoint must return exactly ok, service, and version fields.");
  check(payload.ok === true && payload.service === "lalgeo-maps-api" && payload.version === "v1", "Health endpoint must return { ok: true, service: \"lalgeo-maps-api\", version: \"v1\" }.");
}

async function verifyOpenApi(options) {
  const result = await request(options.baseUrl, "/v1/openapi.json", {
    method: "GET",
    headers: { Accept: "application/json" },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  expectStatus(result, 200, "OpenAPI endpoint");
  expectRequestId(result, "OpenAPI endpoint");
  const cacheControl = headerTokens(result, "cache-control");
  check(cacheControl.includes("public") && cacheControl.includes("max-age=300"), "OpenAPI endpoint must return Cache-Control: public, max-age=300.");
  const spec = parseJsonResponse(result, "OpenAPI endpoint");
  return validateOpenApi(spec);
}

async function verifyUnauthorized(options) {
  const result = await request(options.baseUrl, "/v1/maps", {
    method: "GET",
    headers: { Accept: "application/json", Origin: options.origin },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  expectStatus(result, 401, "Unauthenticated maps request");
  const requestId = expectRequestId(result, "Unauthenticated maps request");
  expectNoStore(result, "Unauthenticated maps request");
  const challenge = result.headers.get("www-authenticate")?.trim() || "";
  check(/^Bearer(?:\s|$)/i.test(challenge), "Unauthenticated maps request must return a WWW-Authenticate Bearer challenge.");
  check(result.headers.get("access-control-allow-origin") === options.origin, `Unauthenticated maps request must allow origin ${options.origin}.`);
  check(headerTokens(result, "vary").includes("origin"), "Unauthenticated maps request must include Vary: Origin.");

  const payload = parseJsonResponse(result, "Unauthenticated maps request");
  check(isObject(payload) && isObject(payload.error), "Unauthenticated maps request must return a JSON error object.");
  check(payload.error.code === "UNAUTHORIZED", `Unauthenticated maps request must return error code UNAUTHORIZED; received ${String(payload.error.code)}.`);
  check(typeof payload.error.message === "string" && payload.error.message, "Unauthenticated maps request must return a non-empty error message.");
  check(typeof payload.request_id === "string" && payload.request_id, "Unauthenticated maps request must return request_id in its JSON body.");
  check(payload.request_id === requestId, "Unauthenticated maps request body request_id must match X-Request-Id.");
}

async function verifyCors(options) {
  const result = await request(options.baseUrl, "/v1/maps", {
    method: "OPTIONS",
    headers: {
      Accept: "application/json",
      Origin: options.origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization, Content-Type",
    },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  expectStatus(result, 204, "CORS preflight");
  expectRequestId(result, "CORS preflight");
  check(result.text === "", "CORS preflight must return an empty response body.");
  check(result.headers.get("access-control-allow-origin") === options.origin, `CORS preflight must echo allowed origin ${options.origin}.`);
  check(result.headers.get("access-control-allow-origin") !== "*", "CORS preflight must not use a wildcard origin.");

  const methods = headerTokens(result, "access-control-allow-methods");
  for (const method of ["get", "post", "patch", "delete", "options"]) {
    check(methods.includes(method), `CORS preflight must allow ${method.toUpperCase()}.`);
  }
  const headers = headerTokens(result, "access-control-allow-headers");
  for (const header of ["authorization", "content-type"]) {
    check(headers.includes(header), `CORS preflight must allow the ${header} header.`);
  }
  check(result.headers.get("access-control-max-age") === "86400", "CORS preflight must return Access-Control-Max-Age: 86400.");
  check(headerTokens(result, "vary").includes("origin"), "CORS preflight must include Vary: Origin.");

  const rejected = await request(options.baseUrl, "/v1/maps", {
    method: "OPTIONS",
    headers: {
      Accept: "application/json",
      Origin: DISALLOWED_ORIGIN,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization, Content-Type",
    },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  expectStatus(rejected, 204, "Disallowed CORS preflight");
  expectRequestId(rejected, "Disallowed CORS preflight");
  check(!rejected.headers.has("access-control-allow-origin"), "Disallowed CORS preflight must not return Access-Control-Allow-Origin.");
  check(!rejected.headers.has("access-control-allow-credentials"), "Disallowed CORS preflight must not return Access-Control-Allow-Credentials.");
}

export async function verifyProduction({
  baseUrl = DEFAULT_BASE_URL,
  origin = DEFAULT_ORIGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  logger = console,
  environment = process.env,
} = {}) {
  assertTlsSafety(environment);
  check(typeof fetchImpl === "function", "This Node runtime does not provide fetch.");
  check(Number.isFinite(timeoutMs) && timeoutMs > 0, "Timeout must be a positive number of milliseconds.");

  const normalized = {
    baseUrl: normalizeBaseUrl(baseUrl),
    origin: normalizeOrigin(origin),
    timeoutMs,
    fetchImpl,
  };

  await verifyHealth(normalized);
  logger.log("PASS health: exact service identity, JSON, cache policy, and request ID");
  const openApi = await verifyOpenApi(normalized);
  logger.log(`PASS OpenAPI: 3.1 contract with ${openApi.operationCount} unique operations`);
  await verifyUnauthorized(normalized);
  logger.log("PASS auth: unauthenticated read rejected with JSON Bearer challenge");
  await verifyCors(normalized);
  logger.log(`PASS CORS: ${normalized.origin} allowed and an untrusted origin rejected`);
  logger.log(`PASS production verifier: ${normalized.baseUrl}`);

  return { baseUrl: normalized.baseUrl, origin: normalized.origin, operationCount: openApi.operationCount };
}

async function main() {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    if (arguments_.help) {
      console.log(usage());
      return;
    }
    await verifyProduction(arguments_);
  } catch (error) {
    console.error(`FAIL production verifier: ${errorReason(error)}`);
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) await main();
