import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { sector, size, b2b, SENIORITY, DEPARTMENTS, readOnly } from "./shared.js";

/**
 * Without a key: find_people as the public /people page gives it to a visitor
 * who is not signed in (first 20 matches, the last 5 withheld, no email
 * addresses), with the page's filters.
 */
export function registerPublicPeopleTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "find_people",
    {
      title: "Find people",
      description:
        "Use this when the user wants people at a company or in a role: names, job titles, seniority, department and LinkedIn URLs found on company team, about and author pages. Filter by company domain, name, title, seniority, department, sector or B2B/B2C. " +
        "Without an API key it returns what the public people directory shows to a visitor who is not signed in: the first 20 matches, with the last 5 withheld, and no email addresses. Narrow the filters (for example a domain plus a title) to get the right people into that first page.",
      inputSchema: {
        domain: z.string().optional().describe("Only people at this company domain, e.g. stripe.com"),
        q: z.string().optional().describe("Name search"),
        title: z.string().optional().describe("Title contains, e.g. 'CTO', 'Head of Sales'"),
        seniority: z.enum(SENIORITY).optional().describe("founder, executive, senior, mid or junior"),
        department: z.enum(DEPARTMENTS).optional(),
        has_email: z.boolean().optional().describe("Only people with an email address found (the address itself needs an API key)"),
        has_linkedin: z.boolean().optional().describe("Only people with a LinkedIn URL"),
        sector,
        b2b_b2c: b2b,
      },
      annotations: readOnly("Find people"),
    },
    async (params) => {
      try {
        return ok(await client.people(params), client.hasKey);
      } catch (err) {
        return fail(err, "find_people", client.hasKey);
      }
    },
  );
}

export function registerPeopleTools(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "find_people",
    {
      title: "Find people",
      description:
        "Use this when the user wants people at companies: names and job titles found on company team, about and author pages. Filter by title, seniority, department, whether an email or LinkedIn URL was found, and by company attributes (domain, sector, technology used). " +
        "Costs 1 contact reveal per company in the response (at most 2 people per company unless a domain is given); results are capped to the reveals left today. " +
        "Each person has an id; use get_person for one person's email address.",
      inputSchema: {
        domain: z.string().optional().describe("Only people at this company domain"),
        q: z.string().optional().describe("Name search"),
        title: z.string().optional().describe("Title contains, e.g. 'CTO', 'Head of Sales'"),
        seniority: z.enum(SENIORITY).optional().describe("founder, executive, senior, mid or junior"),
        department: z.enum(DEPARTMENTS).optional(),
        has_email: z.boolean().optional().describe("Only people with an email address found"),
        has_linkedin: z.boolean().optional().describe("Only people with a LinkedIn URL"),
        email_confidence: z.enum(["high", "medium", "low"]).optional().describe("high (80+), medium (50-79), low (below 50)"),
        sector,
        size,
        b2b_b2c: b2b,
        tech: z.string().optional().describe("Technology the company uses, e.g. 'Zendesk'"),
        limit: z.number().int().min(1).max(100).optional().describe("Results per page, default 20, max 100"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnly("Find people"),
    },
    async (params) => {
      try {
        const res = await client.people(params);
        return ok(res, client.hasKey);
      } catch (err) {
        return fail(err, "find_people", client.hasKey);
      }
    },
  );

  server.registerTool(
    "get_person",
    {
      title: "Get one person",
      description: "Use this to get one person's details by id (from find_people or lookup_company), including their email address where one was found; use lookup_company for the address's verification status. Costs 1 contact reveal for that person's company, free if the company was revealed in the last 30 days.",
      inputSchema: { id: z.string().describe("Person id") },
      annotations: readOnly("Get one person"),
    },
    async ({ id }) => {
      try {
        return ok(await client.person(id), client.hasKey);
      } catch (err) {
        return fail(err, `get_person ${id}`, client.hasKey);
      }
    },
  );
}
