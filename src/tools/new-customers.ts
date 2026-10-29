import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { fill } from "../facts.js";
import { readOnly, SECURITY } from "./shared.js";

export function registerNewCustomersTool(server: McpServer, client: AgentDataClient) {
  const title = "New customers";
  server.registerTool(
    "get_new_customers",
    {
      title,
      description: fill("Use this when the user asks which companies recently started using a technology: \"new HubSpot customers this month\", \"who started using Zendesk this week\", or the new customers across all of your lists. Newest first, each with the date it was first seen, how it was found and company details. Periods: 7, 30 or 90 days. Returns the latest {newCustomerRows}. AgentData reports starts only."),
      inputSchema: {
        technology: z.string().max(120).optional().describe("Exact name from find_technologies; leave out for every technology on your lists"),
        days: z.enum(["7", "30", "90"]).optional().describe("7, 30 or 90, default 30"),
      },
      annotations: readOnly(title),
      _meta: SECURITY,
    },
    async ({ technology, days }) => {
      try {
        return ok(await client.newCustomers({ tool: technology?.trim(), days }), "'started_in_period' counts every start recorded in the period; 'rows' are the latest.");
      } catch (err) {
        return fail(err, "get_new_customers");
      }
    },
  );
}
