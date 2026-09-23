import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";

export function registerTechTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "get_technologies",
    {
      title: "Technologies and who uses them",
      description:
        "Without a slug: the technology index, most-used first, with company counts (default 100, up to 1,000). With a slug: companies using that technology, 20 per page. company_count is every company detected using it; listed_count is how many the list can page through, so stop at page ceil(listed_count / 20). " +
        "No contact reveals and no API key needed. Slugs are lower-case with hyphens, e.g. intercom, hubspot, google-analytics, shopify.",
      inputSchema: {
        slug: z.string().optional().describe("Technology slug, e.g. intercom"),
        page: z.number().int().min(1).optional().describe("Page of companies when a slug is given"),
        limit: z.number().int().min(1).max(1000).optional().describe("Index size when no slug is given, default 100"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ slug, page, limit }) => {
      try {
        const s = slug?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const res = s ? await client.technology(s, page) : await client.technologies(limit);
        return ok(res, client.hasKey);
      } catch (err) {
        return fail(err, `get_technologies${slug ? ` ${slug}` : ""}`, client.hasKey);
      }
    },
  );
}
