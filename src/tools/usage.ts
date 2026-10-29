import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { readOnly, SECURITY } from "./shared.js";

export function registerUsageTool(server: McpServer, client: AgentDataClient) {
  const title = "Plan and usage";
  server.registerTool(
    "check_usage",
    {
      title,
      description: "Use this before a large task, or when a reply says a limit was reached. Returns the account's plan (or its trial and the days left), how many technologies are on its lists and how many more can be added, download records left this period, and how many company look-ups a day it includes (each reply's usage line shows what is left today). Not counted.",
      inputSchema: {},
      annotations: readOnly(title, false),
      _meta: SECURITY,
    },
    async () => {
      try {
        return ok(await client.me());
      } catch (err) {
        return fail(err, "check_usage");
      }
    },
  );
}
