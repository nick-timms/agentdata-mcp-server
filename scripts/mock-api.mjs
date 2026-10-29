// A mock of useagentdata.com for local tests: /api/oauth/introspect and /api/mcp/v3/*, with the
// same signature check as lib/mcp-auth.ts. Run: MCP_V3_SECRET=... node scripts/mock-api.mjs
import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";

const SECRET = process.env.MCP_V3_SECRET || "";
const PORT = Number(process.env.MOCK_PORT || 4010);
const USERS = { agd_live_trialkey000000000000000000: { id: "u-trial", plan: "trial" }, agd_live_noplankey00000000000000000: { id: "u-none", plan: "none" } };
const TOKENS = { agd_at_validtoken: { user: "u-trial", resource: process.env.MCP_RESOURCE || "http://127.0.0.1:3001/mcp" }, agd_at_wrongaudience: { user: "u-trial", resource: "https://evil.example/mcp" } };
const PLANS = { "u-trial": "trial", "u-none": "none" };

const send = (res, status, body, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/oauth/introspect") {
    if (req.headers.authorization !== `Bearer ${SECRET}`) return send(res, 404, {});
    const token = new URLSearchParams(body).get("token") || "";
    if (USERS[token]) return send(res, 200, { active: true, via: "key", user_id: USERS[token].id });
    if (TOKENS[token]) return send(res, 200, { active: true, via: "oauth", user_id: TOKENS[token].user, resource: TOKENS[token].resource, client_name: "Claude" });
    return send(res, 200, { active: false });
  }
  if (!url.pathname.startsWith("/api/mcp/v3/")) return send(res, 404, { error: "not_found" });
  const user = req.headers["x-agentdata-user"], ts = req.headers["x-agentdata-ts"], sig = req.headers["x-agentdata-sig"];
  const want = createHmac("sha256", SECRET).update(`${user}|${ts}|${req.method}|${url.pathname}${url.search}|${createHash("sha256").update(body).digest("hex")}`).digest("hex");
  if (sig !== want || Math.abs(Date.now() / 1000 - Number(ts)) > 120) return send(res, 401, { error: "bad_signature" });
  const plan = PLANS[user] || "none";
  const h = { "X-Plan": plan, "X-Companies-Limit": "1000", "X-Companies-Remaining": "998" };
  const route = url.pathname.slice("/api/mcp/v3/".length);
  if (route === "facts") return send(res, 200, { pageSize: 50, maxPages: 40, maxListCompanies: 500000, previewRows: 25, slotHoldDays: 7, newCustomerRows: 25 });
  if (route === "me") return send(res, 200, { plan, trial: plan === "trial" ? { ends_at: "2026-11-05T00:00:00Z", days_left: 7 } : null, trial_ended_at: plan === "none" ? "2026-10-20T00:00:00Z" : null, lists: { used: 1, limit: 10, technologies: ["HubSpot"] } }, h);
  if (route === "technologies") return send(res, 200, { matches: 1, technologies: [{ name: "HubSpot", category: "Marketing automation", companies: 314721, on_your_lists: true, too_large: false }] }, h);
  if (route === "list") {
    if (plan === "none" || url.searchParams.get("tool") !== "HubSpot") return send(res, 200, { technology: url.searchParams.get("tool"), preview: true, reason: plan === "none" ? "no_plan" : "not_on_your_lists", rows: [{ domain: "acme.com", found_in: "website", evidence: "Script on the page" }] }, h);
    return send(res, 200, { technology: "HubSpot", preview: false, rows: [{ domain: "acme.com", found_in: "dns", evidence: "SPF record" }], page: Number(url.searchParams.get("page") || 0), hasMore: true }, h);
  }
  if (route === "lists") return plan === "none" ? send(res, 402, { error: "plan_required", trial_ended_at: "2026-10-20T00:00:00Z" }, h) : send(res, 200, { ok: true, tool: JSON.parse(body).tool, lists: { used: 2, limit: 10 } }, h);
  if (route === "new-customers") return !url.searchParams.get("tool") && plan === "none" ? send(res, 402, { error: "plan_required", trial_ended_at: "2026-10-20T00:00:00Z" }, h) : send(res, 200, { technology: url.searchParams.get("tool"), days: 30, started_in_period: 12, rows: [{ domain: "beta.io", first_seen: "2026-10-27" }] }, h);
  if (route === "company") return url.searchParams.get("domain") === "new.example" ? send(res, 404, { error: "not_profiled", domain: "new.example", retry_after_seconds: 300 }, h) : send(res, 200, { domain: url.searchParams.get("domain"), technologies: [], contacts: { included: plan !== "none" } }, h);
  if (route === "downloads") {
    if (req.method === "GET") return send(res, 200, { downloads: [] }, h);
    const b = JSON.parse(body);
    return b.confirm ? send(res, 200, { ok: true, id: 7, rows: 120 }, h) : send(res, 200, { tool: b.tool, rows: 120, remaining: 1000 }, h);
  }
  return send(res, 404, { error: "not_found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock on ${PORT}`));
