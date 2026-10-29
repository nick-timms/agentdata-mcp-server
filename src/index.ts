#!/usr/bin/env node
/**
 * AgentData MCP server 3.0.0 (claude/MCP_V3_SPEC_2026-10-29.md).
 *
 *   --http   the hosted server (mcp.useagentdata.com): every request needs a credential, an OAuth
 *            access token from useagentdata.com or an agd_live_ API key, checked by introspection.
 *   (stdio)  a bridge for local MCP clients: each message goes to the hosted server with your key.
 */
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { createServer } from "./server.js";
import { AgentDataClient, VERSION } from "./api-client.js";
import { bearerOf, introspect, protectedResourceMetadata, RESOURCE, WWW_AUTHENTICATE, type Who } from "./auth.js";
import { loadFacts } from "./facts.js";
import { platformFor } from "./platform.js";
import { DOCS_URL, SETTINGS_URL } from "./format.js";

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

const httpMode = args.includes("--http");
const port = Number(getArg("--port") || process.env.PORT || "3001");
const host = getArg("--host") || process.env.HOST || "127.0.0.1";
const apiKey = (getArg("--api-key") || process.env.AGENTDATA_API_KEY || "").trim();
const remote = (getArg("--url") || process.env.AGENTDATA_MCP_URL || RESOURCE).replace(/\/+$/, "");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`AgentData MCP server ${VERSION}

Usage:
  agentdata-mcp-server --api-key YOUR_KEY     stdio, for local MCP clients: a bridge to ${RESOURCE}
  agentdata-mcp-server --http [--port 3001]   the hosted server (needs MCP_V3_SECRET)

Remote clients don't need this package: add ${RESOURCE} as a connector and connect your
AgentData account, or send "Authorization: Bearer YOUR_KEY".

Environment:
  AGENTDATA_API_KEY    same as --api-key
  PORT, HOST           same as --port, --host (hosted: --host 0.0.0.0, see start.js)

Your key: ${SETTINGS_URL}
Docs: ${DOCS_URL}`);
  process.exit(0);
}

// ── stdio: a bridge to the hosted server ──────────────────────────────────────────────────

async function startStdioBridge() {
  if (!apiKey) {
    console.error(`AgentData needs an API key: find it at ${SETTINGS_URL}, then pass --api-key or set AGENTDATA_API_KEY.`);
    process.exit(1);
  }
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const write = (m: unknown) => process.stdout.write(`${JSON.stringify(m)}\n`);
  let protocol: string | undefined;

  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) return;
    let msg: { id?: unknown; method?: string; params?: { protocolVersion?: string } };
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.method === "initialize" && msg.params?.protocolVersion) protocol = msg.params.protocolVersion;
    try {
      const res = await fetch(remote, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": `agentdata-mcp-server/${VERSION} (stdio bridge)`,
          ...(protocol ? { "MCP-Protocol-Version": protocol } : {}),
        },
        body: text,
      });
      if (res.status === 202) return;
      const body = await res.text();
      if (res.status === 401) {
        if (msg.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: `The AgentData API key was not accepted. Check it at ${SETTINGS_URL}.` } });
        return;
      }
      const type = res.headers.get("content-type") || "";
      if (type.includes("text/event-stream")) {
        for (const l of body.split(/\r?\n/)) if (l.startsWith("data:")) { const d = l.slice(5).trim(); if (d) process.stdout.write(`${d}\n`); }
      } else if (body.trim()) {
        process.stdout.write(`${body.trim()}\n`);
      }
    } catch (err) {
      if (msg.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `Could not reach ${remote} (${err instanceof Error ? err.message : String(err)}).` } });
    }
  });
}

// ── HTTP: the hosted server ───────────────────────────────────────────────────────────────

function normaliseIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const ip = raw.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
  return isIP(ip) ? ip : undefined;
}

// Per-account token bucket and a global in-flight cap, applied before anything goes upstream.
const BUCKET = { capacity: 30, refillPerSec: 10 };
const ANON_BUCKET = { capacity: 20, refillPerSec: 5 };
const MAX_IN_FLIGHT = 100;
const buckets = new Map<string, { tokens: number; at: number }>();
let inFlight = 0;

function takeToken(key: string, dial = BUCKET): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: dial.capacity, at: now };
  b.tokens = Math.min(dial.capacity, b.tokens + ((now - b.at) / 1000) * dial.refillPerSec);
  b.at = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(key, b);
  return ok;
}
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
}, 60_000).unref();

const clientLabel = (ua: string | undefined) => (String(ua || "").trim().split(/[\s/;(]/)[0] || "unknown").slice(0, 40);

async function startHttp() {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  // The numbers tool descriptions quote come from the website; don't start without them.
  for (let attempt = 1; ; attempt++) {
    try { await loadFacts(); break; } catch (err) {
      if (attempt >= 5) { console.error("Could not load facts from the website:", err instanceof Error ? err.message : err); process.exit(1); }
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  setInterval(() => { loadFacts().catch((e) => console.error("facts refresh failed:", e instanceof Error ? e.message : e)); }, 3600_000).unref();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    next();
  });
  app.options(/.*/, (_req, res) => { res.sendStatus(204); });

  // RFC 9728 protected resource metadata, at the root and at the MCP path.
  const prm = (_req: unknown, res: { json: (b: unknown) => void; setHeader: (k: string, v: string) => void }) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(protectedResourceMetadata());
  };
  app.get("/.well-known/oauth-protected-resource", prm);
  app.get("/.well-known/oauth-protected-resource/mcp", prm);

  // ChatGPT's domain check for this host (the token comes from the OpenAI portal).
  app.get("/.well-known/openai-apps-challenge", (_req, res) => {
    const token = (process.env.OPENAI_APPS_CHALLENGE || "").trim();
    if (!token) { res.sendStatus(404); return; }
    res.type("text/plain").send(token);
  });

  const unauthorized = (res: { status: (n: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void }, why: string) => {
    res.setHeader("WWW-Authenticate", WWW_AUTHENTICATE);
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: `${why} Connect your AgentData account: ${DOCS_URL}` }, id: null });
  };

  app.post("/mcp", async (req, res) => {
    const ip = normaliseIp(String(req.headers["x-real-ip"] || "")) || normaliseIp(req.socket.remoteAddress);
    const ua = String(req.headers["user-agent"] || "");
    const credential = bearerOf(req.headers.authorization);
    if (!credential) {
      if (!takeToken(`ip:${ip || "unknown"}`, ANON_BUCKET)) { res.setHeader("Retry-After", "1"); res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests. Retry in a second." }, id: null }); return; }
      unauthorized(res, "AgentData needs an account.");
      return;
    }
    let who: Who | null;
    try {
      who = await introspect(credential);
    } catch {
      res.setHeader("Retry-After", "5");
      res.status(503).json({ jsonrpc: "2.0", error: { code: -32000, message: "AgentData couldn't check this connection just now. Retry in a few seconds." }, id: null });
      return;
    }
    if (!who) { unauthorized(res, "This AgentData connection is not valid (a new API key, or a disconnected app)."); return; }

    if (!takeToken(`u:${who.userId}`)) { res.setHeader("Retry-After", "1"); res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests to this MCP server. Retry in a second." }, id: null }); return; }
    if (inFlight >= MAX_IN_FLIGHT) { res.setHeader("Retry-After", "2"); res.status(503).json({ jsonrpc: "2.0", error: { code: -32000, message: "Server busy. Retry in a few seconds." }, id: null }); return; }

    inFlight++;
    let released = false;
    const upstream = new AbortController();
    try {
      const log = { platform: platformFor(ip, ua), client: clientLabel(ua), via: who.via };
      const messages = Array.isArray(req.body) ? req.body : [req.body];
      const init = messages.find((m: { method?: string }) => m?.method === "initialize");
      if (init) console.log(JSON.stringify({ evt: "initialize", ...log, client_name: String(init?.params?.clientInfo?.name || "").slice(0, 60), client_version: String(init?.params?.clientInfo?.version || "").slice(0, 30) }));
      const server = createServer(new AgentDataClient(who.userId, upstream.signal), log);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        upstream.abort();
        void transport.close();
        void server.close();
        if (!released) { released = true; inFlight--; }
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const id = randomUUID().slice(0, 8);
      console.error(`MCP request failed [${id}]:`, err instanceof Error ? err.message : err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: `The AgentData MCP server could not handle this request (reference ${id}). Retry once; if it happens again, email support@useagentdata.com with the reference.` }, id: null });
      if (!released) { released = true; inFlight--; }
    }
  });

  const methodNotAllowed = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(405).json({ error: "Use POST /mcp (Streamable HTTP, stateless)." });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.get("/favicon.ico", (_req, res) => { res.redirect(302, "https://useagentdata.com/agentdata-icon.png"); });
  app.get("/health", (_req, res) => { res.json({ status: "ok", server: "agentdata-mcp-server", version: VERSION }); });
  app.get("/", (_req, res) => {
    res.json({ name: "AgentData MCP server", version: VERSION, endpoint: "POST /mcp", auth: "OAuth (connect your AgentData account) or Authorization: Bearer <API key>", docs: DOCS_URL, source: "https://github.com/nick-timms/agentdata-mcp-server" });
  });

  app.listen(port, host, () => {
    console.log(`agentdata-mcp-server ${VERSION} listening on ${host}:${port} (POST /mcp)`);
  });
}

(httpMode ? startHttp() : startStdioBridge()).catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
