import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { readOnly, SECURITY } from "./shared.js";

export function registerLookupTool(server: McpServer, client: AgentDataClient) {
  const title = "Look up a company";
  server.registerTool(
    "lookup_company",
    {
      title,
      description: "Use this when the user asks about one company and you know its website domain, for example to research a company before a call. Returns what the company does, its sector, location, who it sells to and business model, every technology found on it grouped by category (each with how it was found and when it was first and last seen), and website signals (pricing page, free trial, API docs, hiring). With a plan it adds company contacts: the email format, addresses published on public pages with their verification status, and named people from the company's own site. Counts as one look-up; the same company again today doesn't count again. A domain not checked yet is queued: the reply says when to try again, and nothing is counted. Pass a domain, not a company name.",
      inputSchema: { domain: z.string().min(3).max(253).describe("Bare domain, e.g. stripe.com (no https://, no path)") },
      annotations: readOnly(title),
      _meta: SECURITY,
    },
    async ({ domain }) => {
      const d = domain.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
      try {
        return ok(await client.company(d));
      } catch (err) {
        return fail(err, `lookup_company ${d}`);
      }
    },
  );
}
