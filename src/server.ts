import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentDataClient, VERSION } from "./api-client.js";
import { registerUsageTool } from "./tools/usage.js";
import { registerTechnologiesTool } from "./tools/technologies.js";
import { registerListTools } from "./tools/lists.js";
import { registerNewCustomersTool } from "./tools/new-customers.js";
import { registerLookupTool } from "./tools/lookup.js";

// Server instructions (claude/MCP_V3_SPEC_2026-10-29.md, Appendix A.2).
export const INSTRUCTIONS = `AgentData: customer lists of B2B software. For any technology (HubSpot, Zendesk, Stripe, Shopify and thousands more) it lists the companies using it, how each was found (in the website's code or its public DNS records), when it was first seen, and the new customers as they start. Every call uses the connected AgentData account's plan and limits.

Which tool:
- A technology's customers: find_technologies for its exact name, then get_customer_list.
- Companies that recently started using a technology: get_new_customers.
- One company's technologies and details: lookup_company with its domain.
- A customer list as a file: download_list. Unlocking a technology's full list: add_to_lists, only when the user asks.
- Plan, lists and what is left: check_usage.

Rules:
- Only downloads use records. List pages count against the account's daily browsing limit, so use filters rather than paging deep, and fetch only what the user needs.
- Say "new customers" or "started using". AgentData reports starts only; say so if asked about anything else.
- A field we could not find is null: say "not found" rather than guessing.
- Describe an email address by its verification status (valid, catch-all, unknown). Only "valid" is verified.
- When a limit is reached the reply says when it resets: wait, don't retry in a loop.
- Don't quote totals from memory; find_technologies has the current counts.`;

/** Context for usage logging in the hosted server. Nothing about the request's content is logged. */
export interface LogContext {
  platform: string;
  client: string;
  via: string;
}

type ToolCallback = (...args: unknown[]) => Promise<{ isError?: boolean } & Record<string, unknown>>;

/** One JSON line per tool call (tool, platform, client, how connected, duration, error). Never arguments or results. */
function instrument(server: McpServer, ctx: LogContext): void {
  const register = server.registerTool.bind(server) as unknown as (name: string, config: unknown, cb: ToolCallback) => unknown;
  (server as unknown as { registerTool: typeof register }).registerTool = (name, config, cb) =>
    register(name, config, async (...args: unknown[]) => {
      const started = Date.now();
      let isError = true;
      try {
        const result = await cb(...args);
        isError = !!result?.isError;
        return result;
      } finally {
        console.log(JSON.stringify({ evt: "tool_call", tool: name, platform: ctx.platform, client: ctx.client, via: ctx.via, ms: Date.now() - started, error: isError }));
      }
    });
}

/** One MCP server for one request (the hosted server is stateless). */
export function createServer(client: AgentDataClient, log?: LogContext): McpServer {
  const server = new McpServer({ name: "agentdata", title: "AgentData", version: VERSION }, { instructions: INSTRUCTIONS });
  if (log) instrument(server, log);
  registerTechnologiesTool(server, client);
  registerListTools(server, client);
  registerNewCustomersTool(server, client);
  registerLookupTool(server, client);
  registerUsageTool(server, client);
  return server;
}
