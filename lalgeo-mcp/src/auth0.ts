import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const issuer = (process.env.AUTH0_ISSUER || "https://dev-bpskzxbdi7zyf44v.ca.auth0.com/").replace(/\/$/, "") + "/";
const audience = process.env.AUTH0_AUDIENCE || "https://mcp.lalgeo.com";
const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

export const AUTH0_SCOPES = ["maps:read", "maps:write"] as const;

export function protectedResourceMetadata() {
  return {
    resource: "https://mcp.lalgeo.com",
    authorization_servers: [issuer],
    scopes_supported: [...AUTH0_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "LalGeo Maps MCP",
  };
}

export async function verifyAuth0Token(token: string, requiredScope = "maps:read") {
  const { payload } = await jwtVerify(token, jwks, { issuer, audience });
  const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [];
  if (!scopes.includes(requiredScope)) throw new Error(`Missing required scope: ${requiredScope}`);
  return payload;
}

export function auth0OwnerId(payload: JWTPayload) {
  const configured = process.env.AUTH0_OWNER_SUB;
  if (configured && payload.sub === configured) return configured;
  throw new Error("Authenticated Auth0 user is not linked to a LalGeo owner.");
}
