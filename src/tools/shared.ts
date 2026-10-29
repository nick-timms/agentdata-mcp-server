import { z } from "zod";

/** Explicit hints on every tool (Claude's directory policy and OpenAI's guidelines both ask). */
export function readOnly(title: string, openWorld = true) {
  return { title, readOnlyHint: true, destructiveHint: false, openWorldHint: openWorld } as const;
}

/** The two tools that change something in the account (a list slot; a download). */
export function writes(title: string) {
  return { title, readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
}

/** ChatGPT reads per-tool security schemes; every tool needs the connection (spec 5.1). */
export const SECURITY = { securitySchemes: [{ type: "oauth2", scopes: ["agentdata"] }] } as const;

export const technology = z.string().min(1).max(120).describe("Exact technology name from find_technologies, e.g. 'HubSpot'");

/** The website's list filters (lib/account-data.ts FILTER_KEYS, without method). */
export const listFilters = {
  q: z.string().max(80).optional().describe("Company name or domain contains, e.g. 'acme'"),
  country: z.string().length(2).optional().describe("Headquarters country, ISO-2 code such as US or GB (country is known for a minority of companies)"),
  sector: z.string().max(80).optional().describe("Sector label as it appears in rows, e.g. 'Software & SaaS'"),
  audience: z.enum(["b2b", "b2c", "both"]).optional().describe("Who the company sells to: b2b (includes companies selling to both), b2c or both"),
  model: z.enum(["saas", "marketplace", "agency", "service", "ecommerce", "other"]).optional().describe("Business model"),
  signal: z.enum(["hiring", "free_trial", "pricing_page", "api_docs"]).optional().describe("Only companies whose website shows this"),
  since: z.enum(["7", "30", "90"]).optional().describe("Only companies first seen in the last 7, 30 or 90 days"),
};

export type ListFilterArgs = { q?: string; country?: string; sector?: string; audience?: string; model?: string; signal?: string; since?: string };

export function filtersOf(a: ListFilterArgs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["q", "country", "sector", "audience", "model", "signal", "since"] as const) if (a[k]) out[k] = String(a[k]);
  return out;
}
