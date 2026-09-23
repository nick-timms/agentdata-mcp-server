import http from "node:http";
const usage = { "X-Plan": "free", "X-Lookups-Limit": "1000", "X-Lookups-Remaining": "993", "X-Lookups-Consumed": "0", "X-RateLimit-Limit": "5000", "X-RateLimit-Remaining": "4980", "X-RateLimit-Window": "5h", "X-Companies-Limit": "5000", "X-Companies-Remaining": "4979" };
const anon = { ...usage, "X-Plan": "anonymous", "X-RateLimit-Limit": "300", "X-Companies-Limit": "200" };
delete anon["X-Lookups-Limit"]; delete anon["X-Lookups-Remaining"]; delete anon["X-Lookups-Consumed"];
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname; const key = (req.headers.authorization || "").replace("Bearer ", "");
  const send = (status, body, h = {}) => { res.writeHead(status, { "content-type": "application/json", ...h }); res.end(JSON.stringify(body)); };
  const h = key ? usage : anon;
  process.stderr.write(`MOCK ${req.method} ${req.url} key=${key ? "yes" : "no"} ua=${req.headers["user-agent"]}\n`);
  if (key === "bad") return send(401, { error: "Invalid API key" });
  if (p === "/api/v1/me") return key ? send(200, { plan: "free", tier: "free", usage: { contacts: { used: 7, limit: 1000 } } }) : send(401, { error: "Authentication required" });
  if (p === "/api/v1/search") return send(200, { query: u.searchParams.get("q"), results: [{ domain: "notion.so", company_name: "Notion" }], total: 1, lookups_consumed: 0 }, h);
  if (p === "/api/v1/companies") return send(200, { companies: [{ domain: "a.com" }], total: 1, page: 1, filters: Object.fromEntries(u.searchParams) }, h);
  if (p === "/api/v1/tech") return send(200, { technologies: [{ name: "Intercom", slug: "intercom", company_count: 5500000 }], total: 1 }, h);
  if (p === "/api/v1/tech/intercom") return send(200, { technology: "Intercom", companies: [{ domain: "b.com" }], total: 6076, page: Number(u.searchParams.get("page") || 1) }, h);
  if (p === "/api/v1/signals") return send(200, { signals: [], total: 0, filters: Object.fromEntries(u.searchParams) }, h);
  if (p === "/api/v1/career-moves") return key ? send(200, { career_moves: [], total: 0, lookups_consumed: 0 }, h) : send(401, { error: "Authentication required", message: "Emails and people need a free API key" });
  if (p === "/api/v1/lookup") {
    if (!key) return send(401, { error: "Authentication required" });
    const d = u.searchParams.get("domain");
    if (d === "newdomain.io") return send(404, { error: "Domain not profiled yet", domain: d, status: "queued", retry_after_seconds: 120 }, { "Retry-After": "120" });
    if (d === "limit.com") return send(429, { error: "rate_limited", reason: "contacts_day", message: "Daily contact reveal limit reached (1,000).", reset_in_seconds: 30000, upgrade: "Pro is 10,000 a day for $99 a year: https://agentdata.run/pricing" }, { "Retry-After": "30000", "X-Lookups-Remaining": "0" });
    if (d === "burst.com") return send(429, { error: "rate_limited", reason: "rps", message: "Too many requests per second" }, { "Retry-After": "1", ...h });
    return send(200, { domain: d, company: { name: "Stripe" }, emails: [], people: [{ id: "p1" }], filters: Object.fromEntries(u.searchParams) }, { ...h, "X-Lookups-Consumed": "1", "X-Lookups-Remaining": "992" });
  }
  if (p === "/api/v1/people") return key ? send(200, { people: [{ id: "p1", full_name: "A" }], total: 1, lookups_consumed: 1, filters: Object.fromEntries(u.searchParams) }, h) : send(401, { error: "Authentication required" });
  if (p.startsWith("/api/v1/people/")) return key ? send(200, { person: { id: p.split("/").pop(), email: "a@b.com" }, lookup: { consumed: true } }, h) : send(401, { error: "Authentication required" });
  send(404, { error: "no route " + p });
}).listen(4545, () => console.error("mock on 4545"));
