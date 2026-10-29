import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { readOnly, SECURITY } from "./shared.js";

export function registerTechnologiesTool(server: McpServer, client: AgentDataClient) {
  const title = "Find technologies";
  server.registerTool(
    "find_technologies",
    {
      title,
      description: "Use this to find a technology AgentData tracks, or to browse a category, before asking for its customers. Search by name ('hubspot', 'help scout') or by category ('Help desk', 'Email marketing'). Returns each technology's exact name, its category, how many companies use it, whether it is on your lists, and whether it is too large to be a customer list. Pass the exact name to the other tools. Not counted.",
      inputSchema: {
        query: z.string().max(120).optional().describe("Technology name or part of it, e.g. 'hubspot'"),
        category: z.string().max(80).optional().describe("A category name as this tool returns it, e.g. 'Help desk'"),
        limit: z.number().int().min(1).max(100).optional().describe("How many to return, 1 to 100, default 20"),
      },
      annotations: readOnly(title, false),
      _meta: SECURITY,
    },
    async ({ query, category, limit }) => {
      try {
        return ok(await client.technologies({ q: query?.trim(), category: category?.trim(), limit }));
      } catch (err) {
        return fail(err, "find_technologies");
      }
    },
  );
}
