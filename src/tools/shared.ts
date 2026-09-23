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
export const size = z.enum(SIZES).optional().describe("Team size band: micro (1-5 people found), small (6-20), medium (21-60), large (61+)");
export const b2b = z.enum(B2B).optional().describe("b2b, b2c or both");
