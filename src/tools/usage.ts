import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentDataClient } from "../api-client.js";
import { ok, fail, SIGNUP_URL, SETTINGS_URL, PRICING_URL } from "../format.js";

export function registerUsageTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "check_usage",
    {
      title: "Plan and usage",
      description: "Your plan (free or pro) and what is left today: contact reveals, requests in the current 5-hour window, distinct companies. Free, not counted. Without a key it explains the anonymous limits and how to get a free key.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      if (!client.hasKey) {
        return {
          content: [{
            type: "text" as const,
            text: [
              "No API key configured, so this server is running anonymously.",
              "Anonymous: search_companies, get_technologies and get_signals work, at 2 requests a second, 300 requests per 5 hours and 200 distinct companies a day per IP. No emails or people.",
              `Free key (no card): 1,000 contact reveals a day, 5 requests a second, 5,000 per 5 hours, 5,000 companies a day. Sign up at ${SIGNUP_URL}, copy the key from ${SETTINGS_URL}, then start this server with --api-key or AGENTDATA_API_KEY.`,
              `Pro ($99 a year): 10,000 reveals a day, 20 a second, 25,000 per 5 hours. ${PRICING_URL}`,
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
