import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentDataClient, VERSION } from "./api-client.js";
import { registerLookupTool } from "./tools/lookup.js";
import { registerCompaniesTool } from "./tools/companies.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerTechTool } from "./tools/tech.js";
import { registerSignalsTool } from "./tools/signals.js";
import { registerUsageTool } from "./tools/usage.js";

const INSTRUCTIONS = `AgentData: free company data for AI agents, crawled from the public web: tech stacks, web signals, email addresses (with verification status) and people. Current coverage is at https://agentdata.run/data; do not quote a total from memory.

How to use it well:
- Start with search_companies (name or filters), get_technologies (who uses a tool) or get_signals (who just dropped or adopted one). These need no key and cost no reveals.
- Use lookup_company for one domain's full record, and find_people / get_person for names, titles and email addresses. These cost contact reveals (1 per company per 30 days) and need a free API key.
- Every response ends with a usage line. When reveals or the request window run out, wait for the reset it names rather than retrying in a loop.
- A domain that is not profiled yet is queued for crawling; the response says when to retry. Some sites (adult, piracy, gambling) are never crawled; do not retry those.
- Describe an address by its verification status (valid, catch-all, unknown); only call it verified when the status is valid.`;

export function createServer(apiKey?: string, clientIp?: string, signal?: AbortSignal): McpServer {
  const server = new McpServer({ name: "agentdata", version: VERSION }, { instructions: INSTRUCTIONS });
  const client = new AgentDataClient(apiKey, clientIp, signal);

  registerLookupTool(server, client);
  registerCompaniesTool(server, client);
  registerPeopleTools(server, client);
  registerTechTool(server, client);
  registerSignalsTool(server, client);
  registerUsageTool(server, client);

  return server;
}
