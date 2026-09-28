import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentDataClient } from "../api-client.js";
import { ok, fail, DOCS_URL } from "../format.js";
import { readOnly } from "./shared.js";

export function registerUsageTool(server: McpServer, client: AgentDataClient) {
  const title = "Plan and usage";
  server.registerTool(
    "check_usage",
    {
      title,
      description: "Use this before a large task to see how much of today's allowance is left: requests in the current 5-hour window, distinct companies today and, with an API key, contact reveals. Free and not counted.",
      inputSchema: {},
      annotations: readOnly(title, false),
    },
    async () => {
      if (!client.hasKey) {
        return {
          content: [{
            type: "text" as const,
            text: [
              "No API key on this connection, so anonymous limits apply to lookup_company, search_companies, find_people, get_technologies and get_signals. The usage line at the end of each response shows what is left.",
              `Personal email addresses, names on company lookups and more than the first page of people need a free AgentData account and its API key: ${DOCS_URL}.`,
            ].join("\n\n"),
          }],
        };
      }
      try {
        return ok(await client.me(), client.hasKey);
      } catch (err) {
        return fail(err, "check_usage", client.hasKey);
      }
    },
  );
}
