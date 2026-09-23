import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { sector, size, b2b, SENIORITY, DEPARTMENTS } from "./shared.js";

export function registerPeopleTools(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "find_people",
    {
      title: "Find people",
      description:
        "People with names and titles, found on company team pages. Filter by title, seniority, department, whether an email or LinkedIn was found, and by company attributes (domain, sector, size, technology used). " +
        "Costs 1 contact reveal per company in the response (max 2 people per company unless a domain is given); results are capped to the reveals you have left today. Needs an API key (free). " +
        "Each person has an id; call get_person for one person's email.",
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
      annotations: { readOnlyHint: true, openWorldHint: true },
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
      description: "One person by id (from find_people or lookup_company), with their email address where we have one (use lookup_company for verification status). Costs 1 contact reveal for that person's company (free if the company was revealed in the last 30 days). Needs an API key.",
      inputSchema: { id: z.string().describe("Person id") },
      annotations: { readOnlyHint: true, openWorldHint: true },
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
