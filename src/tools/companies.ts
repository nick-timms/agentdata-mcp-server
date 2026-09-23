import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { sector, size, b2b, MODELS } from "./shared.js";

export function registerCompaniesTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "search_companies",
    {
      title: "Search companies",
      description:
        "Find companies by name or domain (query), or build a list by filters: sector, size, b2b/b2c, business model, technology used, country. " +
        "No contact reveals and no API key needed; counts against the request window and the distinct-companies dial. " +
        "Returns company summaries with the number of email addresses found; call lookup_company for a domain's full record.",
      inputSchema: {
        query: z.string().optional().describe("Company name or domain fragment, e.g. 'notion' or 'stripe.com'. Used on its own; filters below are ignored when set."),
        sector,
        vertical: z.string().optional().describe("Vertical inside the sector, free text as stored, e.g. 'B2B SaaS'"),
        size,
        b2b,
        model: z.enum(MODELS).optional().describe("Business model"),
        tech: z.string().optional().describe("Technology name as detected, e.g. 'Intercom', 'HubSpot', 'Shopify'"),
        country: z.string().optional().describe("Headquarters country, ISO-2 code such as US or GB"),
        page: z.number().int().min(1).optional().describe("Page number, 20 companies per page"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, page, ...filters }) => {
      try {
        const res = query?.trim()
          ? await client.search(query.trim())
          : await client.companies({ ...filters, page });
        return ok(res, client.hasKey);
      } catch (err) {
        return fail(err, "search_companies", client.hasKey);
      }
    },
  );
}
