import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
for (const key of [undefined, "agd_test_123"]) {
  const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3999/mcp"), key ? { requestInit: { headers: { Authorization: `Bearer ${key}` } } } : undefined);
  const client = new Client({ name: "http-test", version: "0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const r = await client.callTool({ name: "lookup_company", arguments: { domain: "stripe.com" } });
  console.log(`key=${!!key} tools=${tools.tools.length} lookup isError=${!!r.isError} -> ${r.content[0].text.slice(0, 90).replace(/\n/g, " ")}`);
  await client.close();
}
const h = await fetch("http://127.0.0.1:3999/health").then(r => r.json()); console.log("health", h);
const g = await fetch("http://127.0.0.1:3999/mcp"); console.log("GET /mcp", g.status);
const o = await fetch("http://127.0.0.1:3999/mcp", { method: "OPTIONS" }); console.log("OPTIONS /mcp", o.status, o.headers.get("access-control-allow-origin"));
