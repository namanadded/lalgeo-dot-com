#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const repositorySpec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));

export const DEFAULT_BASE_URL = "https://api.lalgeo.com";
export const DEFAULT_ORIGIN = "https://maps.lalgeo.com";
export const DEFAULT_TIMEOUT_MS = 10_000;
export const AUTHORING_API_TITLE = "LalGeo Maps Authoring API";
export const AUTHORING_GUIDE_URL = "https://lalgeo.com/developers/";
export const SNAPSHOT_API_DOCS_URL = "https://maps.lalgeo.com/api-docs";
export const API_ACCESS_EMAIL = "lalgeospatial@outlook.com";

export const REQUIRED_OPERATIONS = Object.freeze({
  "/v1/health": Object.freeze({ get: "getHealth", head: "headHealth" }),
  "/v1/openapi.json": Object.freeze({ get: "getOpenApi", head: "headOpenApi" }),
  "/v1/maps": Object.freeze({ get: "listMaps", post: "createMap" }),
  "/v1/maps/{mapId}": Object.freeze({ get: "getMap", patch: "updateMap", delete: "deleteMap" }),
  "/v1/maps/{mapId}/export": Object.freeze({ get: "exportMap" }),
  "/v1/maps/{mapId}/open-links": Object.freeze({ post: "createMapOpenLink" }),
  "/v1/map-open/redeem": Object.freeze({ post: "redeemMapOpenLink" }),
  "/v1/maps/{mapId}/layers": Object.freeze({ get: "listLayers", post: "createLayer" }),
  "/v1/maps/{mapId}/layers/{layerId}": Object.freeze({ get: "getLayer", patch: "updateLayer", delete: "deleteLayer" }),
  "/v1/maps/{mapId}/layers/{layerId}/features": Object.freeze({ get: "listFeatures", post: "createFeatures" }),
  "/v1/maps/{mapId}/layers/{layerId}/features/{featureId}": Object.freeze({ get: "getFeature", patch: "updateFeature", delete: "deleteFeature" }),
});

export const REQUIRED_SUCCESS_SCHEMAS = Object.freeze({
  "getHealth:200": "#/components/schemas/HealthResponse",
  "getOpenApi:200": "#/components/schemas/OpenApiDocument",
  "listMaps:200": "#/components/schemas/MapListResponse",
  "createMap:201": "#/components/schemas/MapResponse",
  "getMap:200": "#/components/schemas/MapResponse",
  "updateMap:200": "#/components/schemas/MapResponse",
  "exportMap:200": "#/components/schemas/LalGeoExportResponse",
  "createMapOpenLink:201": "#/components/schemas/MapOpenLinkResponse",
  "redeemMapOpenLink:200": "#/components/schemas/LalGeoExportResponse",
  "listLayers:200": "#/components/schemas/LayerListResponse",
  "createLayer:201": "#/components/schemas/LayerResponse",
  "getLayer:200": "#/components/schemas/LayerResponse",
  "updateLayer:200": "#/components/schemas/LayerResponse",
  "listFeatures:200": "#/components/schemas/FeatureListResponse",
  "createFeatures:201": "#/components/schemas/CreatedFeatureCollection",
  "getFeature:200": "#/components/schemas/StoredFeature",
  "updateFeature:200": "#/components/schemas/StoredFeature",
});

export const REQUIRED_BODYLESS_SUCCESSES = Object.freeze([
  "headHealth:200",
  "headOpenApi:200",
  "deleteMap:204",
  "deleteLayer:204",
  "deleteFeature:204",
]);

export const REQUIRED_OPERATION_SCOPES = Object.freeze({
  listMaps: "maps:read",
  createMap: "maps:write",
  getMap: "maps:read",
  updateMap: "maps:write",
  deleteMap: "maps:write",
  exportMap: "maps:read",
  createMapOpenLink: "maps:write",
  listLayers: "maps:read",
  createLayer: "maps:write",
  getLayer: "maps:read",
  updateLayer: "maps:write",
  deleteLayer: "maps:write",
  listFeatures: "maps:read",
  createFeatures: "maps:write",
  getFeature: "maps:read",
  updateFeature: "maps:write",
  deleteFeature: "maps:write",
});
const PROTECTED_OPERATIONS = Object.freeze(Object.keys(REQUIRED_OPERATION_SCOPES));
const RESOURCE_OPERATIONS = new Set(PROTECTED_OPERATIONS.filter((id) => !["listMaps", "createMap"].includes(id)));
const BODY_OPERATIONS = new Set(["createMap", "updateMap", "createMapOpenLink", "createLayer", "updateLayer", "createFeatures", "updateFeature"]);
const CREATE_OPERATIONS = new Set(["createMap", "createLayer", "createFeatures"]);

// Only advertise errors the Worker emits today. In particular, there is no 429 rate limiter
// or Idempotency-Key replay yet; agents should reconcile uncertain writes with GET.
export const REQUIRED_ERROR_RESPONSES = Object.freeze({
  ...Object.fromEntries(PROTECTED_OPERATIONS.map((id) => [id, Object.freeze(Object.fromEntries([
    ["400", BODY_OPERATIONS.has(id) ? "BadRequest" : undefined],
    ["401", "Unauthorized"],
    ["403", REQUIRED_OPERATION_SCOPES[id] === "maps:write" ? "Forbidden" : undefined],
    ["404", RESOURCE_OPERATIONS.has(id) ? "NotFound" : undefined],
    ["409", CREATE_OPERATIONS.has(id) ? "Conflict" : undefined],
    ["413", BODY_OPERATIONS.has(id) ? "PayloadTooLarge" : undefined],
    ["500", "InternalServerError"],
    ["503", "ServiceUnavailable"],
  ].filter(([, component]) => component)))])),
  redeemMapOpenLink: Object.freeze({
    "400": "BadRequest",
    "404": "OpenLinkUnavailable",
    "413": "PayloadTooLarge",
    "500": "InternalServerError",
  }),
});

const CANONICAL_SERVER = DEFAULT_BASE_URL;
const DISALLOWED_ORIGIN = "https://cors-probe.invalid";
const MAX_RESPONSE_BYTES = 5_000_000;
const MIN_HSTS_MAX_AGE_SECONDS = 31_536_000;
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const SAFE_REQUEST_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function resolveLocalReference(document, reference, label) {
  check(typeof reference === "string" && reference.startsWith("#/"), `${label} must use a local OpenAPI reference.`);
  let value = document;
  for (const rawToken of reference.slice(2).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    check((isObject(value) || Array.isArray(value)) && Object.hasOwn(value, token), `${label} does not resolve: ${reference}.`);
    value = value[token];
  }
  return value;
}

function resolveReference(document, value, label) {
  const visited = new Set();
  let resolved = value;
  while (isObject(resolved) && Object.hasOwn(resolved, "$ref")) {
    const reference = resolved.$ref;
    check(!visited.has(reference), `${label} contains a circular reference: ${reference}.`);
    visited.add(reference);
    resolved = resolveLocalReference(document, reference, label);
  }
  return resolved;
}

function validateLocalReferences(document, value, label, visited = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => validateLocalReferences(document, item, label, visited));
    return;
  }
  if (!isObject(value)) return;

  if (Object.hasOwn(value, "$ref")) {
    const reference = value.$ref;
    const resolved = resolveLocalReference(document, reference, label);
    if (!visited.has(reference)) {
      visited.add(reference);
      validateLocalReferences(document, resolved, label, visited);
    }
  }

  for (const [key, item] of Object.entries(value)) {
    if (key !== "$ref") validateLocalReferences(document, item, label, visited);
  }
}

function rewriteSchemaReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteSchemaReferences);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === "$ref" && typeof item === "string" && item.startsWith("#/components/schemas/")) {
      return [key, `#/$defs/${item.slice("#/components/schemas/".length)}`];
    }
    return [key, rewriteSchemaReferences(item)];
  }));
}

function collectInlineSchemas(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectInlineSchemas(item, output));
    return output;
  }
  if (!isObject(value)) return output;

  for (const [key, item] of Object.entries(value)) {
    if (key === "schemas") continue;
    if (key === "schema" && (isObject(item) || typeof item === "boolean")) {
      output.push(item);
      continue;
    }
    collectInlineSchemas(item, output);
  }
  return output;
}

function validateJsonSchemas(spec) {
  const componentSchemas = spec.components?.schemas;
  check(isObject(componentSchemas), "OpenAPI must define components.schemas.");
  const definitions = Object.fromEntries(
    Object.entries(componentSchemas).map(([name, schema]) => [name, rewriteSchemaReferences(schema)]),
  );
  const inlineSchemas = collectInlineSchemas(spec).map(rewriteSchemaReferences);
  const references = Object.keys(definitions).map((name) => ({
    $ref: `#/$defs/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`,
  }));
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    strictTuples: false,
  });
  addFormats(ajv);
  try {
    ajv.compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: definitions,
      anyOf: [...references, ...inlineSchemas],
    });
  } catch (error) {
    throw new VerificationError(`OpenAPI JSON Schemas must compile as Draft 2020-12: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    "The verifier sends only unauthenticated GET, HEAD, and OPTIONS requests.",
  ].join("\n");
}

function errorReason(error) {
  if (isObject(error?.cause) && typeof error.cause.code === "string") return error.cause.code;
  if (isObject(error?.cause) && typeof error.cause.message === "string") return error.cause.message;
  return error instanceof Error ? error.message : String(error);
}

async function request(baseUrl, pathname, {
  method = "GET",
  headers = {},
  fetchImpl,
  timeoutMs,
  allowRedirect = false,
}) {
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
    check(
      allowRedirect || response.status < 300 || response.status >= 400,
      `${method} ${pathname} redirected; refusing to follow a fallback target.`,
    );

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

function expectVaryOrigin(response, label) {
  check(headerTokens(response, "vary").includes("origin"), `${label} must include Vary: Origin.`);
}

function expectHsts(response, label) {
  const value = response.headers.get("strict-transport-security") || "";
  const maxAgeDirective = value.split(";").map((part) => part.trim()).find((part) => /^max-age=/i.test(part));
  const maxAge = Number(maxAgeDirective?.slice(maxAgeDirective.indexOf("=") + 1));
  check(
    Number.isInteger(maxAge) && maxAge >= MIN_HSTS_MAX_AGE_SECONDS,
    `${label} must return Strict-Transport-Security with max-age of at least ${MIN_HSTS_MAX_AGE_SECONDS} seconds.`,
  );
}

function expectRequestIdExposed(response, label) {
  check(
    headerTokens(response, "access-control-expose-headers").includes("x-request-id"),
    `${label} must expose X-Request-Id to browser clients.`,
  );
}

function verifiesCanonicalTransport(baseUrl) {
  const url = new URL(baseUrl);
  return url.protocol === "https:" && !isLoopbackHostname(url.hostname);
}

async function verifyHttpsRedirect(options) {
  const insecure = new URL(options.baseUrl);
  insecure.protocol = "http:";
  insecure.port = "";
  const expected = new URL("/v1/health", `${options.baseUrl}/`).toString();
  const result = await request(insecure.origin, "/v1/health", {
    method: "GET",
    headers: { Accept: "application/json" },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    allowRedirect: true,
  });
  expectStatus(result, 308, "Plain-HTTP health endpoint");
  expectRequestId(result, "Plain-HTTP health endpoint");
  expectNoStore(result, "Plain-HTTP health endpoint");
  check(result.headers.get("location") === expected, `Plain-HTTP health endpoint must redirect exactly to ${expected}.`);
  check(result.text === "", "Plain-HTTP health endpoint redirect must return an empty body.");
}

async function verifySharedHostTransport(options) {
  const pathname = "/v1/transport-probe?surface=shared";
  const insecure = new URL(options.baseUrl);
  insecure.protocol = "http:";
  insecure.port = "";
  const expected = new URL(pathname, `${options.baseUrl}/`).toString();
  const redirect = await request(insecure.origin, pathname, {
    method: "GET",
    headers: { Accept: "application/json" },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    allowRedirect: true,
  });
  expectStatus(redirect, 308, "Plain-HTTP shared-host probe");
  expectRequestId(redirect, "Plain-HTTP shared-host probe");
  expectNoStore(redirect, "Plain-HTTP shared-host probe");
  check(redirect.headers.get("location") === expected, `Plain-HTTP shared-host probe must redirect exactly to ${expected}.`);
  check(redirect.text === "", "Plain-HTTP shared-host probe redirect must return an empty body.");

  const secure = await request(options.baseUrl, pathname, {
    method: "GET",
    headers: { Accept: "application/json" },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  check([401, 404].includes(secure.status), `HTTPS shared-host probe returned HTTP ${secure.status}; expected 401 or 404.`);
  expectHsts(secure, "HTTPS shared-host probe");
}

export function validateOpenApi(spec) {
  check(isObject(spec), "OpenAPI document must be a JSON object.");
  check(typeof spec.openapi === "string" && /^3\.1(?:\.\d+)?$/.test(spec.openapi), `OpenAPI version must be 3.1.x; received ${String(spec.openapi)}.`);
  check(Array.isArray(spec.servers) && spec.servers[0]?.url === CANONICAL_SERVER, `OpenAPI's primary server must be ${CANONICAL_SERVER}.`);

  const info = spec.info;
  check(isObject(info) && info.title === AUTHORING_API_TITLE, `OpenAPI must identify itself as ${AUTHORING_API_TITLE}.`);
  check(
    typeof info.description === "string" &&
      info.description.includes("owner-scoped") &&
      info.description.includes("bearer-authenticated") &&
      info.description.includes(SNAPSHOT_API_DOCS_URL),
    `OpenAPI description must distinguish private owner-scoped authoring from the anonymous-create Snapshot API at ${SNAPSHOT_API_DOCS_URL}.`,
  );
  check(
    isObject(info.contact) &&
      info.contact.name === "LalGeo Maps API access" &&
      info.contact.url === AUTHORING_GUIDE_URL &&
      info.contact.email === API_ACCESS_EMAIL,
    "OpenAPI contact must provide the canonical Authoring API access path.",
  );
  check(
    isObject(spec.externalDocs) && spec.externalDocs.url === AUTHORING_GUIDE_URL,
    `OpenAPI externalDocs must link to ${AUTHORING_GUIDE_URL}.`,
  );
  check(
    canonicalJson(info) === canonicalJson(repositorySpec.info) &&
      canonicalJson(spec.externalDocs) === canonicalJson(repositorySpec.externalDocs),
    "OpenAPI authoring identity and access metadata must match the repository contract.",
  );

  const bearer = spec.components?.securitySchemes?.bearerAuth;
  check(isObject(bearer) && bearer.type === "http" && String(bearer.scheme).toLowerCase() === "bearer", "OpenAPI must define components.securitySchemes.bearerAuth as HTTP bearer authentication.");
  check(
    typeof bearer.description === "string" &&
      bearer.description.includes("owner-scoped") &&
      bearer.description.includes("maps:read") &&
      bearer.description.includes("maps:write") &&
      bearer.description.includes("maps:write is never valid without maps:read") &&
      bearer.description.includes(AUTHORING_GUIDE_URL),
    "OpenAPI bearerAuth must explain owner, read/write scope, and where to request access.",
  );
  check(Array.isArray(spec.security) && spec.security.some((entry) => isObject(entry) && Array.isArray(entry.bearerAuth)), "OpenAPI must apply bearerAuth security by default.");

  for (const publicPath of ["/v1/health", "/v1/openapi.json"]) {
    for (const method of ["get", "head"]) {
      const security = spec.paths?.[publicPath]?.[method]?.security;
      check(Array.isArray(security) && security.length === 0, `${publicPath} must explicitly allow unauthenticated ${method.toUpperCase()} requests.`);
    }
  }

  for (const [path, methods] of Object.entries(REQUIRED_OPERATIONS)) {
    const pathItem = spec.paths?.[path];
    check(isObject(pathItem), `OpenAPI is missing required path ${path}.`);
    for (const [method, operationId] of Object.entries(methods)) {
      check(pathItem[method]?.operationId === operationId, `OpenAPI ${method.toUpperCase()} ${path} must use operationId ${operationId}.`);
      if (PROTECTED_OPERATIONS.includes(operationId)) {
        const security = pathItem[method].security ?? spec.security;
        check(
          Array.isArray(security) && security.some((entry) => isObject(entry) && Array.isArray(entry.bearerAuth)),
          `OpenAPI ${operationId} must require bearerAuth.`,
        );
        check(
          pathItem[method]["x-lalgeo-required-scope"] === REQUIRED_OPERATION_SCOPES[operationId],
          `OpenAPI ${operationId} must require ${REQUIRED_OPERATION_SCOPES[operationId]}.`,
        );
      }
    }
  }

  const redeemOperation = spec.paths?.["/v1/map-open/redeem"]?.post;
  check(Array.isArray(redeemOperation?.security) && redeemOperation.security.length === 0, "/v1/map-open/redeem must explicitly allow unauthenticated POST requests.");
  const createOpenLinkBody = spec.paths?.["/v1/maps/{mapId}/open-links"]?.post?.requestBody;
  check(isObject(createOpenLinkBody) && createOpenLinkBody.required !== true, "createMapOpenLink request body must remain optional.");
  check(
    createOpenLinkBody.content?.["application/json"]?.schema?.$ref === "#/components/schemas/MapOpenLinkInput",
    "createMapOpenLink must use the MapOpenLinkInput request schema.",
  );
  const redeemBody = redeemOperation?.requestBody;
  check(isObject(redeemBody) && redeemBody.required === true, "redeemMapOpenLink request body must be required.");
  check(
    redeemBody.content?.["application/json"]?.schema?.$ref === "#/components/schemas/MapOpenRedeemInput",
    "redeemMapOpenLink must use the MapOpenRedeemInput request schema.",
  );

  const operationIds = [];
  const documentedSuccesses = new Set();
  let successSchemaCount = 0;
  let bodylessSuccessCount = 0;
  let errorResponseCount = 0;
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!isObject(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      check(isObject(operation) && typeof operation.operationId === "string" && operation.operationId, `OpenAPI ${method.toUpperCase()} ${path} must have an operationId.`);
      operationIds.push(operation.operationId);

      const responses = operation.responses;
      check(isObject(responses), `OpenAPI ${operation.operationId} must define responses.`);
      const successes = Object.entries(responses).filter(([status]) => /^2\d\d$/.test(status));
      check(successes.length > 0, `OpenAPI ${operation.operationId} must define a successful response.`);

      const expectedErrors = Object.entries(REQUIRED_ERROR_RESPONSES[operation.operationId] || {});
      const actualErrors = Object.keys(responses).filter((status) => /^[45]\d\d$/.test(status)).sort();
      check(
        JSON.stringify(actualErrors) === JSON.stringify(expectedErrors.map(([status]) => status).sort()),
        `OpenAPI ${operation.operationId} must define exactly these error responses: ${expectedErrors.map(([status]) => status).join(", ") || "none"}.`,
      );
      for (const [status, component] of expectedErrors) {
        const label = `OpenAPI ${operation.operationId} ${status} response`;
        check(responses[status]?.$ref === `#/components/responses/${component}`, `${label} must reference #/components/responses/${component}.`);
        const resolved = resolveReference(spec, responses[status], label);
        check(resolved.content?.["application/json"]?.schema?.$ref === "#/components/schemas/Error", `${label} must use the JSON Error schema.`);
        check(resolved.headers?.["X-Request-Id"]?.$ref === "#/components/headers/RequestId", `${label} must document the X-Request-Id header.`);
        if (status === "401") check(resolved.headers?.["WWW-Authenticate"]?.schema?.const === 'Bearer realm="lalgeo-maps-api"', `${label} must document the bearer challenge.`);
        if (status === "403") {
          check(
            resolved.headers?.["WWW-Authenticate"]?.schema?.const === 'Bearer realm="lalgeo-maps-api", error="insufficient_scope", scope="maps:write"',
            `${label} must document the scoped bearer challenge.`,
          );
        }
        errorResponseCount += 1;
      }

      for (const [status, documentedResponse] of successes) {
        const label = `OpenAPI ${operation.operationId} ${status} response`;
        const successKey = `${operation.operationId}:${status}`;
        const resolvedResponse = resolveReference(spec, documentedResponse, label);
        check(isObject(resolvedResponse), `${label} must be an object.`);
        check(resolvedResponse.headers?.["X-Request-Id"]?.$ref === "#/components/headers/RequestId", `${label} must document the X-Request-Id header.`);
        if (REQUIRED_BODYLESS_SUCCESSES.includes(successKey)) {
          check(!Object.hasOwn(resolvedResponse, "content"), `${label} must remain bodyless and omit content.`);
          documentedSuccesses.add(successKey);
          bodylessSuccessCount += 1;
          continue;
        }

        check(status !== "204", `${label} is not a canonical bodyless success.`);

        const json = resolvedResponse.content?.["application/json"];
        check(isObject(json) && isObject(json.schema), `${label} must define content.application/json.schema.`);
        validateLocalReferences(spec, json.schema, `${label} schema`);
        const expectedReference = REQUIRED_SUCCESS_SCHEMAS[successKey];
        check(expectedReference, `${label} is not a canonical JSON success.`);
        check(json.schema.$ref === expectedReference, `${label} schema must reference ${expectedReference}.`);
        documentedSuccesses.add(successKey);
        successSchemaCount += 1;
      }
    }
  }
  check(new Set(operationIds).size === operationIds.length, "OpenAPI operationIds must be unique.");
  for (const successKey of [...Object.keys(REQUIRED_SUCCESS_SCHEMAS), ...REQUIRED_BODYLESS_SUCCESSES]) {
    check(documentedSuccesses.has(successKey), `OpenAPI is missing canonical success ${successKey}.`);
  }
  validateLocalReferences(spec, spec, "OpenAPI document");
  validateJsonSchemas(spec);
  check(
    canonicalJson(spec.components.headers?.RequestId) === canonicalJson(repositorySpec.components.headers.RequestId),
    "OpenAPI RequestId header must match the repository contract.",
  );
  check(
    canonicalJson(spec.components.schemas) === canonicalJson(repositorySpec.components.schemas),
    "OpenAPI components.schemas must match the repository contract.",
  );
  return { operationCount: operationIds.length, successSchemaCount, bodylessSuccessCount, errorResponseCount };
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
  expectVaryOrigin(result, "Health endpoint");
  if (options.verifyTransport) expectHsts(result, "Health endpoint");
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
  expectVaryOrigin(result, "OpenAPI endpoint");
  if (options.verifyTransport) expectHsts(result, "OpenAPI endpoint");
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
  if (options.verifyTransport) expectHsts(result, "Unauthenticated maps request");
  const challenge = result.headers.get("www-authenticate")?.trim() || "";
  check(/^Bearer(?:\s|$)/i.test(challenge), "Unauthenticated maps request must return a WWW-Authenticate Bearer challenge.");
  check(result.headers.get("access-control-allow-origin") === options.origin, `Unauthenticated maps request must allow origin ${options.origin}.`);
  expectVaryOrigin(result, "Unauthenticated maps request");
  expectRequestIdExposed(result, "Unauthenticated maps request");
  check(headerTokens(result, "access-control-expose-headers").includes("www-authenticate"), "Unauthenticated maps request must expose WWW-Authenticate to browser clients.");

  const payload = parseJsonResponse(result, "Unauthenticated maps request");
  check(isObject(payload) && isObject(payload.error), "Unauthenticated maps request must return a JSON error object.");
  check(payload.error.code === "UNAUTHORIZED", `Unauthenticated maps request must return error code UNAUTHORIZED; received ${String(payload.error.code)}.`);
  check(typeof payload.error.message === "string" && payload.error.message, "Unauthenticated maps request must return a non-empty error message.");
  check(typeof payload.request_id === "string" && payload.request_id, "Unauthenticated maps request must return request_id in its JSON body.");
  check(payload.request_id === requestId, "Unauthenticated maps request body request_id must match X-Request-Id.");
}

async function verifyPublicHead(options) {
  for (const endpoint of [
    { pathname: "/v1/health", label: "Health HEAD", cache: "no-store" },
    { pathname: "/v1/openapi.json", label: "OpenAPI HEAD", cache: "public" },
  ]) {
    const result = await request(options.baseUrl, endpoint.pathname, {
      method: "HEAD",
      headers: { Accept: "application/json" },
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    expectStatus(result, 200, endpoint.label);
    expectRequestId(result, endpoint.label);
    expectJsonContentType(result, endpoint.label);
    expectVaryOrigin(result, endpoint.label);
    if (options.verifyTransport) expectHsts(result, endpoint.label);
    if (endpoint.cache === "no-store") expectNoStore(result, endpoint.label);
    else {
      const cacheControl = headerTokens(result, "cache-control");
      check(cacheControl.includes("public") && cacheControl.includes("max-age=300"), `${endpoint.label} must return Cache-Control: public, max-age=300.`);
    }
    check(result.text === "", `${endpoint.label} must return an empty response body.`);
  }
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
  if (options.verifyTransport) expectHsts(result, "CORS preflight");
  check(result.text === "", "CORS preflight must return an empty response body.");
  check(result.headers.get("access-control-allow-origin") === options.origin, `CORS preflight must echo allowed origin ${options.origin}.`);
  check(result.headers.get("access-control-allow-origin") !== "*", "CORS preflight must not use a wildcard origin.");

  const methods = headerTokens(result, "access-control-allow-methods");
  for (const method of ["get", "head", "post", "patch", "delete", "options"]) {
    check(methods.includes(method), `CORS preflight must allow ${method.toUpperCase()}.`);
  }
  const headers = headerTokens(result, "access-control-allow-headers");
  for (const header of ["authorization", "content-type"]) {
    check(headers.includes(header), `CORS preflight must allow the ${header} header.`);
  }
  check(result.headers.get("access-control-max-age") === "86400", "CORS preflight must return Access-Control-Max-Age: 86400.");
  expectVaryOrigin(result, "CORS preflight");
  expectRequestIdExposed(result, "CORS preflight");

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
  expectVaryOrigin(rejected, "Disallowed CORS preflight");
  if (options.verifyTransport) expectHsts(rejected, "Disallowed CORS preflight");
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

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalized = {
    baseUrl: normalizedBaseUrl,
    origin: normalizeOrigin(origin),
    timeoutMs,
    fetchImpl,
    verifyTransport: verifiesCanonicalTransport(normalizedBaseUrl),
  };

  if (normalized.verifyTransport) {
    await verifyHttpsRedirect(normalized);
    logger.log("PASS transport redirect: HTTP upgrades permanently to the exact HTTPS URL");
  }

  await verifyHealth(normalized);
  logger.log(`PASS health: exact service identity, JSON, cache policy, request ID${normalized.verifyTransport ? ", and HSTS" : ""}`);
  if (normalized.verifyTransport) {
    await verifySharedHostTransport(normalized);
    logger.log("PASS shared transport: redirect and HSTS cover non-Maps routes on the canonical host");
  }
  const openApi = await verifyOpenApi(normalized);
  logger.log(`PASS OpenAPI: private authoring identity, one-time handoff contract, ${openApi.operationCount} unique operations, ${openApi.successSchemaCount} JSON success schemas, and ${openApi.bodylessSuccessCount} bodyless successes (capability not redeemed)`);
  await verifyPublicHead(normalized);
  logger.log("PASS public HEAD: health and OpenAPI are reachable without response bodies");
  await verifyUnauthorized(normalized);
  logger.log("PASS auth: unauthenticated read rejected with JSON Bearer challenge");
  logger.log(`PASS error contract: ${openApi.errorResponseCount} documented route failures`);
  await verifyCors(normalized);
  logger.log(`PASS CORS: ${normalized.origin} allowed and an untrusted origin rejected`);
  logger.log(`PASS production verifier: ${normalized.baseUrl}`);

  return {
    baseUrl: normalized.baseUrl,
    origin: normalized.origin,
    operationCount: openApi.operationCount,
    successSchemaCount: openApi.successSchemaCount,
    bodylessSuccessCount: openApi.bodylessSuccessCount,
    errorResponseCount: openApi.errorResponseCount,
  };
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
