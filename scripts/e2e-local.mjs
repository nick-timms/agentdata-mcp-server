// End-to-end test of the 3.0.0 HTTP server against the mock (scripts/mock-api.mjs).
// Starts both, then checks: 401 + WWW-Authenticate with no credential, the resource metadata,
// a key and a token accepted, a wrong-audience token refused, the seven tools listed with filled
// descriptions, every tool callable, plan messages, the stdio bridge, and banned words.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const env = { ...process.env, MCP_V3_SECRET: SECRET, AGENTDATA_API_URL: "http://127.0.0.1:4010/api/mcp/v3", AGENTDATA_ISSUER: "http://127.0.0.1:4010", MCP_RESOURCE: "http://127.0.0.1:3001/mcp", PORT: "3001" };
const kids = [spawn("node", ["scripts/mock-api.mjs"], { env, stdio: "inherit" }), spawn("node", ["dist/index.js", "--http"], { env, stdio: "inherit" })];
const done = (code) => { for (const k of kids) k.kill(); process.exit(code); };
await new Promise((r) => setTimeout(r, 1500));
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`); };
const BASE = "http://127.0.0.1:3001";
const KEY = "agd_live_trialkey000000000000000000";
const NOPLAN = "agd_live_noplankey00000000000000000";

async function connect(cred) {
  const client = new Client({ name: "e2e", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${cred}` } } }));
  return client;
}
const text = (r) => r.content.map((c) => c.text).join("\n");

try {
  await t("401 without a credential, with WWW-Authenticate", async () => {
    const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } }) });
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate") || "", /resource_metadata="http:\/\/127\.0\.0\.1:3001\/\.well-known\/oauth-protected-resource\/mcp", scope="agentdata"/);
  });
  await t("401 for an unknown key", async () => {
    const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: "Bearer agd_live_nope", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" });
    assert.equal(r.status, 401);
  });
  await t("401 for a token issued for another resource", async () => {
    const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: "Bearer agd_at_wrongaudience", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" });
    assert.equal(r.status, 401);
  });
  await t("protected resource metadata at both paths", async () => {
    for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const j = await (await fetch(`${BASE}${p}`)).json();
      assert.equal(j.resource, "http://127.0.0.1:3001/mcp");
      assert.deepEqual(j.authorization_servers, ["http://127.0.0.1:4010"]);
    }
  });
  const c = await connect(KEY);
  await t("seven tools, filled descriptions, hints and security schemes", async () => {
    const { tools } = await c.listTools();
    assert.deepEqual(tools.map((x) => x.name).sort(), ["add_to_lists", "check_usage", "download_list", "find_technologies", "get_customer_list", "get_new_customers", "lookup_company"]);
    for (const x of tools) {
      assert.ok(!/\{\w+\}/.test(x.description), `${x.name} has an unfilled placeholder`);
      for (const h of ["readOnlyHint", "destructiveHint", "openWorldHint"]) assert.equal(typeof x.annotations[h], "boolean", `${x.name} ${h}`);
      assert.ok(x._meta?.securitySchemes, `${x.name} securitySchemes`);
    }
    assert.match(tools.find((x) => x.name === "get_customer_list").description, /Returns 50 companies a page/);
  });
  await t("banned words never appear in tool text or instructions", async () => {
    const { tools } = await c.listTools();
    const all = [c.getInstructions() || "", ...tools.map((x) => `${x.title} ${x.description} ${JSON.stringify(x.inputSchema)}`)].join("\n").toLowerCase();
    for (const w of ["switched", "stopped", "wappalyzer", "upgrade", "verified email", "\u2014"]) assert.ok(!all.includes(w), `found "${w}"`);
    // "free" only as the companies' own "free trial" website signal, never about AgentData.
    assert.ok(!/\bfree\b(?![ _]trial)/.test(all), "found free outside free trial");
  });
  await t("every tool answers", async () => {
    const calls = [["check_usage", {}], ["find_technologies", { query: "hubspot" }], ["get_customer_list", { technology: "HubSpot", country: "GB" }], ["add_to_lists", { technology: "Front" }], ["get_new_customers", { technology: "HubSpot", days: "7" }], ["lookup_company", { domain: "https://www.acme.com/about" }], ["download_list", { technology: "HubSpot" }], ["download_list", { technology: "HubSpot", confirm: true }]];
    for (const [name, a] of calls) {
      const r = await c.callTool({ name, arguments: a });
      assert.ok(!r.isError, `${name}: ${text(r)}`);
      assert.match(text(r), /usage: plan trial/);
    }
  });
  await t("preview note, queued domain", async () => {
    assert.match(text(await c.callTool({ name: "get_customer_list", arguments: { technology: "Zendesk" } })), /public preview/);
    const q = await c.callTool({ name: "lookup_company", arguments: { domain: "new.example" } });
    assert.ok(!q.isError); assert.match(text(q), /queued/);
  });
  await c.close();
  await t("an OAuth token for this server works", async () => {
    const o = await connect("agd_at_validtoken");
    assert.ok(!(await o.callTool({ name: "check_usage", arguments: {} })).isError);
    await o.close();
  });
  await t("no-plan account: plan message, /pricing, no trial offer", async () => {
    const p = await connect(NOPLAN);
    const r = await p.callTool({ name: "add_to_lists", arguments: { technology: "HubSpot" } });
    assert.ok(r.isError);
    assert.match(text(r), /trial ended on 20 Oct 2026/);
    assert.match(text(r), /useagentdata\.com\/pricing/);
    assert.ok(!/upgrade|start a/i.test(text(r)));
    await p.close();
  });
  await t("stdio bridge", async () => {
    const kid = spawn("node", ["dist/index.js", "--api-key", KEY], { env: { ...env, AGENTDATA_MCP_URL: `${BASE}/mcp` } });
    const lines = [];
    kid.stdout.on("data", (d) => lines.push(...d.toString().split("\n").filter(Boolean)));
    kid.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } }) + "\n");
    kid.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    await new Promise((r) => setTimeout(r, 1500));
    kid.kill();
    const byId = Object.fromEntries(lines.map((l) => JSON.parse(l)).map((m) => [m.id, m]));
    assert.equal(byId[1].result.serverInfo.name, "agentdata");
    assert.equal(byId[2].result.tools.length, 7);
  });
  await t("stdio bridge without a key exits with a message", async () => {
    const kid = spawn("node", ["dist/index.js"], { env: { ...env, AGENTDATA_API_KEY: "" } });
    let err = ""; kid.stderr.on("data", (d) => (err += d));
    const code = await new Promise((r) => kid.on("exit", r));
    assert.equal(code, 1); assert.match(err, /needs an API key/);
  });
  console.log(`\n${n} checks passed`);
  done(0);
} catch (e) {
  console.error(e);
  done(1);
}
