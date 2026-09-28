import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentDataClient, VERSION, type Caller } from "./api-client.js";
import { registerLookupTool } from "./tools/lookup.js";
import { registerCompaniesTool } from "./tools/companies.js";
import { registerPeopleTools, registerPublicPeopleTool } from "./tools/people.js";
import { registerTechTool } from "./tools/tech.js";
import { registerSignalsTool } from "./tools/signals.js";
import { registerUsageTool } from "./tools/usage.js";

const INSTRUCTIONS = `AgentData: company data for AI agents, taken from companies' own websites: what a company does, the tools and technologies it runs, web signals, company contact details and people, as on the public website; with an AgentData account, also personal email addresses (with verification status). Current coverage is at https://agentdata.run/data; do not quote a total from memory.

How to use it well:
- One company by domain: lookup_company. A company by name, or a list by sector, technology or country: search_companies. Every company using one technology: get_technologies. Companies that recently added, dropped or switched a tool: get_signals. People at a company or in a role: find_people.
- A domain that is not profiled yet is crawled on request; the reply says when to retry, usually within a few minutes, and nothing is charged. Some sites (adult, piracy, gambling) are never crawled; do not retry those.
- Every response ends with a usage line. When an allowance runs out, wait for the reset it names rather than retrying in a loop.
- A field we could not find is null, not guessed; say "not found" rather than inventing a value.
- Describe an email address by its verification status (valid, catch-all, unknown); only call it verified when the status is valid.`;

/** Context for usage logging in the hosted server. Nothing about the request's content is logged. */
export interface LogContext {
  platform: string;
  client: string;
}

type ToolCallback = (...args: unknown[]) => Promise<{ isError?: boolean } & Record<string, unknown>>;

/**
 * One JSON line per tool call (tool, platform, client, key or not, duration,
 * error or not) so usage can be counted from the logs. Arguments and results
 * are never logged.
 */
function instrument(server: McpServer, ctx: LogContext, keyed: boolean): void {
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
        console.log(JSON.stringify({ evt: "tool_call", tool: name, platform: ctx.platform, client: ctx.client, keyed, ms: Date.now() - started, error: isError }));
      }
    });
}

/**
 * One MCP server for one request (the hosted server is stateless) or for the
 * life of a stdio session.
 *
 * Without a key, only the tools that work without one are offered. Tools that
 * return emails or people appear once the caller brings a key, so a client
 * never sees a tool that can only fail.
 */
export function createServer(apiKey?: string, clientIp?: string, signal?: AbortSignal, caller: Caller = {}, log?: LogContext): McpServer {
  const server = new McpServer({ name: "agentdata", version: VERSION }, { instructions: INSTRUCTIONS });
  const client = new AgentDataClient(apiKey, clientIp, signal, caller);
  if (log) instrument(server, log, client.hasKey);

  registerLookupTool(server, client);
  registerCompaniesTool(server, client);
  if (client.hasKey) registerPeopleTools(server, client);
  else registerPublicPeopleTool(server, client);
  registerTechTool(server, client);
  registerSignalsTool(server, client);
  registerUsageTool(server, client);

  return server;
}
