import { AgentDataClient } from "./api-client.js";

/**
 * The numbers tool descriptions quote (rows a page, preview rows, the list size cap...), read from
 * the website's own constants through /api/mcp/v3/facts (spec 5.5), so a description never carries
 * a number typed by hand. Read at start and every hour; the hosted server does not start without them.
 */
export type Facts = { pageSize: number; maxPages: number; maxListCompanies: number; previewRows: number; slotHoldDays: number; newCustomerRows: number };

let current: Facts | null = null;

function valid(f: unknown): f is Facts {
  const o = f as Record<string, unknown> | null;
  return !!o && ["pageSize", "maxPages", "maxListCompanies", "previewRows", "slotHoldDays", "newCustomerRows"].every((k) => typeof o[k] === "number" && (o[k] as number) > 0);
}

export async function loadFacts(): Promise<Facts> {
  const res = await new AgentDataClient("-").facts();
  if (!valid(res.body)) throw new Error("facts: unexpected answer from /api/mcp/v3/facts");
  current = res.body;
  return current;
}

export function facts(): Facts {
  if (!current) throw new Error("facts not loaded");
  return current;
}

/** Fill {name} placeholders from the facts. */
export function fill(template: string): string {
  const f = facts() as unknown as Record<string, number>;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in f ? f[k].toLocaleString("en-US") : m));
}
