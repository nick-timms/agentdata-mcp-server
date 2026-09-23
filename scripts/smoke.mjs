import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const key = process.env.AGENTDATA_API_KEY;
const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js", ...(key ? ["--api-key", key] : [])], env: { PATH: process.env.PATH, AGENTDATA_API_URL: process.env.AGENTDATA_API_URL || "http://127.0.0.1:4545/api/v1", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" }, stderr: "pipe" });
const client = new Client({ name: "test", version: "0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map(t => `${t.name}${t.annotations?.readOnlyHint ? "(ro)" : ""}`).join(", "));
console.log("INSTRUCTIONS:", (client.getInstructions() || "").split("\n")[0]);
const calls = JSON.parse(process.env.CALLS);
for (const [name, args] of calls) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  console.log(`\n=== ${name} ${JSON.stringify(args)} isError=${!!r.isError}\n${text.length > 500 ? text.slice(0, 250) + " ... " + text.slice(-220) : text}`);
}
await client.close();
