import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";

const SECRET = "test-secret";
const seen = [];
const mock = http.createServer((req, res) => {
  seen.push({ url: req.url, h: req.headers });
  res.setHeader("content-type", "application/json");
  res.setHeader("x-ratelimit-limit", "20000"); res.setHeader("x-ratelimit-remaining", "19999"); res.setHeader("x-ratelimit-window", "5h");
  if (req.url.startsWith("/lookup")) return res.end(JSON.stringify({ domain: "linear.app", access: "public", technologies: [{ name: "Intercom", first_seen: "2025-01-01", last_seen: "2026-09-20" }], contacts: { emails_found: 3, people_found: 2 } }));
  res.end(JSON.stringify({ ok: true, url: req.url }));
}).listen(4999);

const env = { ...process.env, AGENTDATA_API_URL: "http://127.0.0.1:4999", MCP_PROXY_SECRET: SECRET, PORT: "4998" };
const srv = spawn("node", ["dist/index.js", "--http", "--host", "0.0.0.0"], { env });
let logs = ""; srv.stdout.on("data", d => logs += d); srv.stderr.on("data", d => logs += d);
await new Promise(r => setTimeout(r, 1200));

async function rpc(body, headers = {}) {
  const r = await fetch("http://127.0.0.1:4998/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  const t = await r.text();
  const line = t.split("\n").find(l => l.startsWith("data:"));
  return { status: r.status, json: line ? JSON.parse(line.slice(5)) : (t ? JSON.parse(t) : null) };
}
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "0.1" } } };
const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };
const call = (name, args) => ({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });

const claude = { "x-real-ip": "160.79.106.180", "user-agent": "Claude-User" };
await rpc(init, claude);
const noKey = await rpc(list, claude);
const names = noKey.json.result.tools.map(t => t.name);
console.log("tools without key:", names.join(", "));
const withKey = await rpc(list, { ...claude, authorization: "Bearer agd_live_testkey123456" });
console.log("tools with key:", withKey.json.result.tools.map(t => t.name).join(", "));
const bad = noKey.json.result.tools.filter(t => !(t.title && t.annotations?.title && t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false && typeof t.annotations.openWorldHint === "boolean"));
console.log("tools missing annotations:", bad.map(t => t.name));
const sigEnum = noKey.json.result.tools.find(t => t.name === "get_signals").inputSchema.properties.type.enum;
console.log("signal types without key include career_move:", sigEnum.includes("career_move"));
const lk = noKey.json.result.tools.find(t => t.name === "lookup_company");
console.log("keyless lookup params:", Object.keys(lk.inputSchema.properties));

const r1 = await rpc(call("lookup_company", { domain: "https://www.Linear.app/pricing" }), claude);
console.log("lookup text:", r1.json.result.content[0].text.slice(0, 160));
const h = seen.at(-1).h;
console.log("upstream:", seen.at(-1).url, "platform:", h["x-agentdata-client-platform"]);
const expect = createHmac("sha256", SECRET).update(`${h["x-agentdata-client-ip"]}|${h["x-agentdata-client-ts"]}|claude|`).digest("hex");
console.log("claude signature valid (ip|ts|platform|subject):", expect === h["x-agentdata-client-sig"]);

// other traffic from Anthropic's range (API connector): its own smaller pool
await rpc(call("search_companies", { query: "x" }), { "x-real-ip": "160.79.106.9", "user-agent": "anthropic-api/1.0" });
console.log("api-connector platform:", seen.at(-1).h["x-agentdata-client-platform"]);
// lowercase bearer is a key
const lower = await rpc(list, { ...claude, authorization: "bearer agd_live_testkey123456" });
console.log("lowercase bearer lists people tools:", lower.json.result.tools.some(t => t.name === "find_people"));
// ordinary caller: v1 signature, no platform header
await rpc(call("search_companies", { query: "notion" }), { "x-real-ip": "203.0.113.9", "user-agent": "opencode/1.18.32" });
const h2 = seen.at(-1).h;
console.log("ordinary caller platform header:", h2["x-agentdata-client-platform"] ?? "(none)", "v1 sig valid:", createHmac("sha256", SECRET).update(`203.0.113.9|${h2["x-agentdata-client-ts"]}`).digest("hex") === h2["x-agentdata-client-sig"]);

const u = await rpc(call("check_usage", {}), claude);
console.log("check_usage (no key):", u.json.result.content[0].text.replace(/\n+/g, " | "));
console.log("mentions price/Pro:", /\$|pro\b|pricing/i.test(u.json.result.content[0].text));

// pool bucket: 60 quick calls from Claude should not trip the local limiter
let limited = 0;
await Promise.all(Array.from({ length: 60 }, () => rpc(list, claude).then(r => { if (r.status === 429) limited++; })));
console.log("429s in 60 parallel Claude pool calls:", limited);
let limitedOrdinary = 0;
await Promise.all(Array.from({ length: 60 }, () => rpc(list, { "x-real-ip": "203.0.113.10" }).then(r => { if (r.status === 429) limitedOrdinary++; })));
console.log("429s in 60 parallel calls from one ordinary IP:", limitedOrdinary);

console.log("--- log lines");
console.log(logs.split("\n").filter(l => /tool_call|initialize|platform_headers|platform ranges/.test(l)).slice(0, 8).join("\n"));
srv.kill(); mock.close(); process.exit(0);
