import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { sector, size, b2b, SENIORITY, DEPARTMENTS, readOnly } from "./shared.js";

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
