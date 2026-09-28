import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { readOnly } from "./shared.js";

export function registerTechTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "get_technologies",
    {
      title: "Technologies and who uses them",
      description:
        "Use this when the user asks which companies use a particular technology (for example Intercom, Zendesk, HubSpot, Shopify, Stripe), or which technologies are most used. " +
        "With a slug: companies detected using that technology, 20 per page. company_count is every company detected using it; listed_count is how many the list can page through, so stop at page ceil(listed_count / 20). " +
        "Without a slug: the technology index, most-used first, with company counts (default 100, up to 1,000). " +
        "Slugs are lower-case with hyphens, e.g. intercom, hubspot, google-analytics, shopify. Works without an API key; no contact reveals.",
      inputSchema: {
        slug: z.string().optional().describe("Technology slug, e.g. intercom"),
        page: z.number().int().min(1).optional().describe("Page of companies when a slug is given"),
        limit: z.number().int().min(1).max(1000).optional().describe("Index size when no slug is given, default 100"),
      },
      annotations: readOnly("Technologies and who uses them"),
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
