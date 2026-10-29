import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgentDataClient } from "../api-client.js";
import { ok, fail } from "../format.js";
import { fill } from "../facts.js";
import { readOnly, writes, technology, listFilters, filtersOf, SECURITY, type ListFilterArgs } from "./shared.js";

export function registerListTools(server: McpServer, client: AgentDataClient) {
  // ── get_customer_list ────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_customer_list",
    {
      title: "Customer list",
      description: fill("Use this when the user wants the companies that use a technology, for example \"who uses Intercom\", \"Zendesk customers in the UK\" or \"B2B companies on HubSpot\". Returns {pageSize} companies a page, newest first, each with how the technology was found (in the website's code or its DNS records), when it was first and last seen, and company details (sector, country, who it sells to, business model, hiring, pricing page). For a technology on your lists it pages through every company, with filters. For any other technology it returns the first {previewRows}, unfiltered; add_to_lists unlocks the rest. Pages count against the account's daily browsing limit, so narrow with filters instead of paging deep: a filter combination stops after {maxPages} pages. For a file, use download_list. For companies that only just started using it, use get_new_customers."),
      inputSchema: {
        technology,
        ...listFilters,
        page: z.number().int().min(0).optional().describe("Page number, starting at 0"),
      },
      annotations: readOnly("Customer list"),
      _meta: SECURITY,
    },
    async (args: { technology: string; page?: number } & ListFilterArgs) => {
      try {
        const res = await client.list({ tool: args.technology.trim(), page: args.page, ...filtersOf(args) });
        const preview = res.body.preview === true;
        const filtered = Object.keys(filtersOf(args)).length > 0;
        const note = preview
          ? res.body.reason === "no_plan"
            ? "This is the public preview. Full customer lists need a plan; see check_usage."
            : `This is the public preview${filtered ? " (filters apply only to technologies on your lists)" : ""}. add_to_lists unlocks every company if the user wants it.`
          : undefined;
        return ok(res, note);
      } catch (err) {
        return fail(err, `get_customer_list ${args.technology}`);
      }
    },
  );

  // ── add_to_lists ─────────────────────────────────────────────────────────────────────
  server.registerTool(
    "add_to_lists",
    {
      title: "Add to your lists",
      description: fill("Use this only when the user asks to add a technology to their AgentData lists, or agrees after you explain that it unlocks the technology's full customer list. It uses one of the plan's list slots, and a removed list keeps its slot for {slotHoldDays} days. Technologies used by more than {maxListCompanies} companies can't be lists. Returns the lists in use and the slots left."),
      inputSchema: { technology },
      annotations: writes("Add to your lists"),
      _meta: SECURITY,
    },
    async ({ technology: tool }) => {
      try {
        const res = await client.addList(tool.trim());
        return ok(res, res.body.already ? "It was already on your lists." : "Added. Its full customer list is being prepared and usually opens within a few minutes.");
      } catch (err) {
        return fail(err, `add_to_lists ${tool}`);
      }
    },
  );

  // ── download_list ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "download_list",
    {
      title: "Download a customer list",
      description: "Use this when the user wants a technology's customer list as a file. Works for technologies on your lists, with the same filters as get_customer_list. Call it first without confirm: it returns how many companies match and how many download records are left. Ask the user, then call again with confirm set to true to start it. The CSV is emailed to the account and listed under Downloads in the AgentData account, usually within a few minutes. Companies downloaded before never count again. One download runs at a time on plans with a record allowance.",
      inputSchema: {
        technology,
        ...listFilters,
        confirm: z.boolean().optional().describe("true to start the download after the user has agreed to the record count"),
      },
      annotations: writes("Download a customer list"),
      _meta: SECURITY,
    },
    async (args: { technology: string; confirm?: boolean } & ListFilterArgs) => {
      try {
        const res = await client.download(args.technology.trim(), filtersOf(args), args.confirm === true);
        const note = args.confirm === true
          ? "Started. The file is emailed to the account and appears under Downloads at useagentdata.com/app/downloads, usually within a few minutes."
          : "Preview only: nothing has started. 'rows' is how many companies match and 'remaining' the download records left (null means no limit). Ask the user, then call again with confirm: true.";
        return ok(res, note);
      } catch (err) {
        return fail(err, `download_list ${args.technology}`);
      }
    },
  );
}
