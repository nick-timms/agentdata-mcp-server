import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { sector, size, b2b, readOnly } from "./shared.js";

const COMPANY_TYPES = [
  "tool_added", "tool_removed", "tool_switched",
  "employee_growth", "employee_decline", "hiring_surge", "hiring_stopped", "name_changed",
] as const;
const ALL_TYPES = [...COMPANY_TYPES, "career_move"] as const;

export function registerSignalsTool(server: McpServer, client: AgentDataClient) {
  // career_move returns people, so it is offered only with a key.
  const types = client.hasKey ? ALL_TYPES : COMPANY_TYPES;
  const careerNote = client.hasKey
    ? " Type 'career_move' lists people who changed jobs; it costs 1 contact reveal per company and accepts only limit and offset."
    : "";
  const title = "Switch signals";
  server.registerTool(
    "get_signals",
    {
      title,
      description:
        "Use this when the user asks which companies recently started, stopped or switched using a technology, for example companies that left Intercom or adopted HubSpot: set moved_from or moved_to. " +
        "Also covers growth and hiring changes. Newest first. Changes are recorded as each site is re-crawled, so an empty result means none recorded yet, not that none happened. " +
        "Works without an API key; no contact reveals." + careerNote,
      inputSchema: {
        type: z.enum(types as unknown as [string, ...string[]]).optional().describe("Signal type; omit for all technology signals"),
        moved_from: z.string().optional().describe("Technology the company dropped, e.g. 'Zendesk'"),
        moved_to: z.string().optional().describe("Technology the company adopted, e.g. 'HubSpot'"),
        days: z.number().int().min(1).max(365).optional().describe("Only signals detected in the last N days"),
        sector,
        size,
        b2b_b2c: b2b,
        limit: z.number().int().min(1).max(100).optional().describe("Results per page, default 20"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnly(title),
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
