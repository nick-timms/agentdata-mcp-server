import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";

export function registerLookupTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "lookup_company",
    {
      title: "Look up a company",
      description:
        "Full record for one domain: company details (sector, size, model, HQ), the detected tech stack, web signals (pricing page, free trial, API docs, careers), the email pattern, email addresses found with their verification status and confidence, and people with titles. " +
        "Costs 1 contact reveal per domain per 30 days (repeat calls on the same domain are free). Needs an API key (free, 1,000 reveals a day). " +
        "A domain we have not profiled yet is queued at the front of the crawl and answers 'retry in about two minutes' without charging.",
      inputSchema: {
        domain: z.string().describe("Bare domain, e.g. stripe.com (no https://, no path)"),
        min_confidence: z.number().min(0).max(95).optional().describe("Minimum email confidence, 0 to 95. Default 50. Use 90 for outreach-safe addresses only."),
        verification_status: z.string().optional().describe("Comma-separated verification statuses to keep: valid, catch-all, catch-all-unknown, unknown. Example 'valid,catch-all' for deliverable addresses."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ domain, min_confidence, verification_status }) => {
      const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      try {
        const res = await client.lookup(d, { min_confidence, verification_status });
        return ok(res, client.hasKey);
      } catch (err) {
        return fail(err, `lookup_company ${d}`, client.hasKey);
      }
    },
  );
}
