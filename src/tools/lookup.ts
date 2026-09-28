import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { readOnly } from "./shared.js";

export function registerLookupTool(server: McpServer, client: AgentDataClient) {
  const contacts = client.hasKey
    ? "With this connection's API key it also returns the company's email address pattern, the addresses found (each with verification status, confidence and the page it was found on) and people with titles; that costs 1 contact reveal per domain per 30 days. "
    : "Without an API key it returns the public profile and how many email addresses and people were found, not the addresses, pattern or names. ";
  const title = "Look up a company";
  server.registerTool(
    "lookup_company",
    {
      title,
      description:
        "Use this when the user asks about one specific company and you know its website domain: what it does, sector and business model, headquarters where known, the tools and technologies it runs (each with how it was detected and when it was first and last seen), and web signals (pricing page, free trial, API docs, careers). " +
        contacts +
        "A domain not profiled yet is crawled on request: the reply says when to retry, usually about two minutes, and nothing is charged. " +
        "Do not use it to find a company by name; use search_companies to get the domain first.",
      inputSchema: {
        domain: z.string().describe("Bare domain, e.g. stripe.com (no https://, no path)"),
        ...(client.hasKey ? {
          min_confidence: z.number().min(0).max(95).optional().describe("Minimum email confidence, 0 to 95. Default 50. Use 90 for outreach-safe addresses only."),
          verification_status: z.string().optional().describe("Comma-separated verification statuses to keep: valid, catch-all, catch-all-unknown, unknown. Example 'valid,catch-all' for deliverable addresses."),
        } : {}),
      },
      annotations: readOnly(title),
    },
    async (args: { domain: string; min_confidence?: number; verification_status?: string }) => {
      const d = args.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      try {
        const res = await client.lookup(d, { min_confidence: args.min_confidence, verification_status: args.verification_status });
        return ok(res, client.hasKey);
      } catch (err) {
        return fail(err, `lookup_company ${d}`, client.hasKey);
      }
    },
  );
}
