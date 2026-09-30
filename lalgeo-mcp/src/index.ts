import { createLalGeoMcpApp } from "./app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const app = createLalGeoMcpApp();

app.listen(port, host, (error?: Error) => {
  if (error) throw error;
  console.log(`LalGeo MCP listening at http://${host}:${port}/mcp`);
});
