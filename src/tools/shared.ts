import { z } from "zod";

export const SECTORS = [
  "Software & SaaS", "Developer Tools & Infrastructure", "Data & AI", "Marketing & Sales Tech",
  "Financial Services & Fintech", "E-commerce & Retail", "Healthcare & Life Sciences", "Education & Learning",
  "Professional Services", "HR & People Tech", "Media & Content", "Operations & Logistics",
  "Hospitality & Travel", "Cybersecurity", "Other",
] as const;

export const SIZES = ["micro", "small", "medium", "large"] as const;
export const B2B = ["b2b", "b2c", "both"] as const;
export const MODELS = ["saas", "marketplace", "agency", "service", "ecommerce", "other"] as const;
export const SENIORITY = ["founder", "executive", "senior", "mid", "junior"] as const;
export const DEPARTMENTS = [
  "engineering", "product", "design", "marketing", "sales", "customer_success", "support",
  "operations", "finance", "legal", "people", "data", "security",
] as const;

export const sector = z.enum(SECTORS).optional().describe("Industry sector, exact label from the list");
export const size = z.enum(SIZES).optional().describe("Estimate, not headcount: a band by how many people and addresses we found on the company's own website: micro (1-5), small (6-20), medium (21-60), large (61+). Large companies often publish few, so do not use it to exclude them.");
export const b2b = z.enum(B2B).optional().describe("b2b, b2c or both");

/**
 * Every tool here only reads. Directory reviewers (Claude, ChatGPT) want all
 * three hints stated. openWorldHint: the data describes the open web.
 */
export function readOnly(title: string, openWorld = true) {
  return { title, readOnlyHint: true, destructiveHint: false, openWorldHint: openWorld } as const;
}
