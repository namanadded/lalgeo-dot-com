import { readFileSync } from "node:fs";
import vm from "node:vm";

const defaultSourceUrl = new URL("../../public/legacy/lalgeosurvey.html", import.meta.url);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Maps project contract is missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  if (bodyStart === -1) throw new Error(`Maps project contract is missing the body for ${name}.`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Maps project contract contains an unterminated ${name}.`);
}

export function loadLalGeoProjectContract(source = readFileSync(defaultSourceUrl, "utf8")) {
  let nextId = 0;
  const context = vm.createContext({
    DEFAULT_POINT_AGGREGATION: 60,
    generateWorkspaceId(prefix) {
      nextId += 1;
      return `${prefix}-${nextId}`;
    },
    generateSurveyPointId() {
      nextId += 1;
      return `point-${nextId}`;
    },
    getProjectTimeZone() {
      return "UTC";
    },
    stripExtension(name = "") {
      return name.replace(/\.[^/.]+$/, "");
    },
  });

  // Execute the same inline contract functions shipped by Maps so API drift fails this gate.
  vm.runInContext([
    extractFunction(source, "normalizeLayerGeometryType"),
    extractFunction(source, "getDefaultLayerSchema"),
    extractFunction(source, "normalizePointAggregation"),
    extractFunction(source, "getDefaultLayerStyleDefaults"),
    extractFunction(source, "isLayerStyleFieldName"),
    extractFunction(source, "isSystemFieldName"),
    extractFunction(source, "normalizeHeaderName"),
    extractFunction(source, "isAutoManagedField"),
    extractFunction(source, "getLabelCandidateFields"),
    extractFunction(source, "getDefaultLabelFieldForLayer"),
    extractFunction(source, "ensureLayerLabelSettings"),
    extractFunction(source, "cloneLayerSchema"),
    extractFunction(source, "buildQuestionMetaFromSchema"),
    extractFunction(source, "cloneFeatureGeometry"),
    extractFunction(source, "createSchemaFromParsed"),
    extractFunction(source, "buildLayerFeaturesFromParsed"),
    extractFunction(source, "buildParsedFromLayer"),
    extractFunction(source, "createEmptyParsedLayer"),
    extractFunction(source, "ensureLayerStructure"),
    extractFunction(source, "validateLalGeoProject"),
    extractFunction(source, "isApiEndpointSource"),
    extractFunction(source, "isApiReferenceLayer"),
    extractFunction(source, "serializeLayerForStorage"),
    extractFunction(source, "serializeProjectForStorage"),
    "this.validateLalGeoProject = validateLalGeoProject;",
    "this.serializeProjectForStorage = serializeProjectForStorage;",
  ].join("\n"), context);

  return {
    validateLalGeoProject(project, options) {
      return context.validateLalGeoProject(project, options);
    },
    serializeProjectForStorage(project) {
      return context.serializeProjectForStorage(project);
    },
  };
}
