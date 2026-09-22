import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LalGeoApi } from "./lalgeo-api.js";
import { createServer } from "./server.js";

const apiKey = process.env.LALGEO_API_KEY;
if (!apiKey) throw new Error("LALGEO_API_KEY is required.");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const apiBaseUrl = process.env.LALGEO_API_BASE_URL || "https://api.lalgeo.com";
const app = createMcpExpressApp({ host });

app.get("/health", (_req, res) => res.json({ ok: true, service: "lalgeo-mcp" }));
app.post("/mcp", async (req, res) => {
  const server = createServer(new LalGeoApi(apiKey, apiBaseUrl));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

app.get("/mcp", (_req, res) => res.status(405).json({
  jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null,
}));
app.delete("/mcp", (_req, res) => res.status(405).json({
  jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null,
}));

app.listen(port, host, (error?: Error) => {
  if (error) throw error;
  console.log(`LalGeo MCP listening at http://${host}:${port}/mcp`);
});
