import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { sector, size, b2b } from "./shared.js";

const TYPES = [
  "tool_added", "tool_removed", "tool_switched",
  "employee_growth", "employee_decline", "hiring_surge", "hiring_stopped", "name_changed",
  "career_move",
] as const;

export function registerSignalsTool(server: McpServer, client: AgentDataClient) {
  server.registerTool(
    "get_signals",
    {
      title: "Switch signals",
      description:
        "Companies that added, removed or switched a technology, plus growth and hiring changes, newest first. Use moved_from / moved_to to find companies leaving or adopting a tool (e.g. moved_from 'Intercom'). " +
        "No contact reveals and no API key needed, except type 'career_move' (people who changed jobs), which costs 1 reveal per company, needs a key, and accepts only limit and offset (the other filters do not apply to it).",
      inputSchema: {
        type: z.enum(TYPES).optional().describe("Signal type; omit for all technology signals"),
        moved_from: z.string().optional().describe("Technology the company dropped, e.g. 'Zendesk'"),
        moved_to: z.string().optional().describe("Technology the company adopted, e.g. 'HubSpot'"),
        days: z.number().int().min(1).max(365).optional().describe("Only signals detected in the last N days"),
        sector,
        size,
        b2b_b2c: b2b,
        limit: z.number().int().min(1).max(100).optional().describe("Results per page, default 20"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ type, limit, offset, ...rest }) => {
      try {
        const res = type === "career_move"
          ? await client.careerMoves({ limit, offset })
          : await client.signals({ type, limit, offset, ...rest });
        return ok(res, client.hasKey);
      } catch (err) {
        return fail(err, "get_signals", client.hasKey);
      }
    },
  );
}
