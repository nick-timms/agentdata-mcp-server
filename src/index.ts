#!/usr/bin/env node

import { isIP } from "node:net";
import { createServer } from "./server.js";
import { VERSION } from "./api-client.js";

// Command line
const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

const httpMode = args.includes("--http");
const port = Number(getArg("--port") || process.env.PORT || "3001");
// Loopback unless told otherwise. A local HTTP server may hold its owner's key,
// so it must not be reachable from the network. The hosted server passes
// --host 0.0.0.0 (see start.js).
const host = getArg("--host") || process.env.HOST || "127.0.0.1";
const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
const apiKeyArg = getArg("--api-key") || process.env.AGENTDATA_API_KEY;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`AgentData MCP server ${VERSION}

Usage:
  agentdata-mcp-server                          stdio, anonymous (companies, technologies, signals)
  agentdata-mcp-server --api-key YOUR_KEY       stdio with a key (adds emails and people)
  agentdata-mcp-server --http [--port 3001]     Streamable HTTP on POST /mcp, bound to 127.0.0.1
                       [--host 0.0.0.0]         bind all interfaces (public mode: every caller
                                                must send its own Authorization: Bearer key)

Environment:
  AGENTDATA_API_KEY    same as --api-key (stdio, or a loopback-only HTTP server)
  PORT, HOST           same as --port, --host

A key is free: https://agentdata.run/signup, then https://agentdata.run/settings
Docs: https://agentdata.run/docs`);
  process.exit(0);
}

if (!httpMode && !apiKeyArg) {
  // Not an error: anonymous mode serves the keyless tools. Say so once, on stderr,
  // so it never corrupts the stdio transport.
  console.error(`agentdata-mcp-server ${VERSION}: no API key, running anonymously (no emails or people). Get a free key at https://agentdata.run/settings and pass --api-key or AGENTDATA_API_KEY.`);
}

async function startStdio() {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createServer(apiKeyArg);
  await server.connect(new StdioServerTransport());
}

/** "::ffff:1.2.3.4" -> "1.2.3.4"; anything that is not an IP address -> undefined. */
function normaliseIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const ip = raw.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
  return isIP(ip) ? ip : undefined;
}

// Per-caller token bucket and a global in-flight cap, applied before anything
// is proxied upstream, so a flood costs this process and not the API.
const BUCKET_CAPACITY = 20; // burst
const BUCKET_REFILL_PER_SEC = 10; // sustained
const MAX_IN_FLIGHT = 100;
const buckets = new Map<string, { tokens: number; at: number }>();
let inFlight = 0;

function takeToken(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: BUCKET_CAPACITY, at: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.at) / 1000) * BUCKET_REFILL_PER_SEC);
  b.at = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(key, b);
  return ok;
}

// Buckets idle for a minute are full again; drop them so the map cannot grow without bound.
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
}, 60_000).unref();

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

let loggedAddressSource = false;

/**
 * The caller's address, or undefined when it cannot be known for certain.
 * Loopback: the socket. Public (behind Railway): X-Real-IP, which Railway's edge
 * documents as the client's address. X-Forwarded-For is not documented by
 * Railway and its last hop is Railway's own proxy, so it is never used. With no
 * trustworthy address the server signs nothing and the API counts the call
 * against this server's own address: stricter, never forgeable.
 */
function callerIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string | undefined {
  if (isLoopback) return normaliseIp(req.socket.remoteAddress);
  const real = normaliseIp(String(req.headers["x-real-ip"] || ""));
  if (!loggedAddressSource) {
    loggedAddressSource = true;
    const hops = String(req.headers["x-forwarded-for"] || "").split(",").filter((s) => s.trim()).length;
    console.log(`caller address: x-real-ip ${real ? "present" : "absent"}, x-forwarded-for hops ${hops}`);
  }
  return real;
}

async function startHttp() {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  if (!isLoopback && apiKeyArg) {
    console.error("agentdata-mcp-server: ignoring the startup API key in public mode; each caller must send its own Authorization: Bearer key.");
  }

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  // CORS. Public mode serves browser-based MCP clients from any site; the hosted
  // server holds no key of its own, so a page gains nothing it could not do
  // directly. A loopback server may hold its owner's key, so only local pages
  // may call it, and any other Origin is refused outright.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isLoopback) {
      if (origin && !LOCAL_ORIGIN.test(origin)) {
        res.status(403).json({ error: "Origin not allowed for a local server" });
        return;
      }
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    next();
  });
  app.options("/mcp", (_req, res) => { res.sendStatus(204); });

  app.post("/mcp", async (req, res) => {
    const clientIp = callerIp(req);

    if (!takeToken(clientIp || "unknown")) {
      res.setHeader("Retry-After", "1");
      res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests to this MCP server. Retry in a second." }, id: null });
      return;
    }
    if (inFlight >= MAX_IN_FLIGHT) {
      res.setHeader("Retry-After", "2");
      res.status(503).json({ jsonrpc: "2.0", error: { code: -32000, message: "Server busy. Retry in a few seconds." }, id: null });
      return;
    }

    inFlight++;
    let released = false;
    const upstream = new AbortController();
    try {
      // The key is per request (each client brings its own). Only a loopback
      // server may fall back to the key it was started with.
      const auth = req.headers.authorization;
      const key = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
      const server = createServer(key || (isLoopback ? apiKeyArg : undefined), clientIp, upstream.signal);
      // Stateless: one server and transport per request, nothing kept between calls.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        // DNS-rebinding protection for local servers: only these Host headers are served.
        ...(isLoopback ? { enableDnsRebindingProtection: true, allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`] } : {}),
      });
      res.on("close", () => {
        // Also fires after a normal response; aborting a finished fetch is a no-op.
        upstream.abort();
        void transport.close();
        void server.close();
        if (!released) { released = true; inFlight--; }
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err instanceof Error ? err.message : err);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
      if (!released) { released = true; inFlight--; }
    }
  });

  const methodNotAllowed = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(405).json({ error: "Use POST /mcp (Streamable HTTP, stateless). Server-sent event streams are not offered." });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "agentdata-mcp-server", version: VERSION });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "AgentData MCP server",
      version: VERSION,
      endpoint: "POST /mcp",
      auth: "Authorization: Bearer <api key>, optional (anonymous serves companies, technologies and signals)",
      key: "https://agentdata.run/settings",
      docs: "https://agentdata.run/docs",
      source: "https://github.com/nick-timms/agentdata-mcp-server",
    });
  });

  app.listen(port, host, () => {
    console.log(`agentdata-mcp-server ${VERSION} listening on ${host}:${port} (POST /mcp, ${isLoopback ? "loopback only" : "public"})`);
  });
}

(httpMode ? startHttp() : startStdio()).catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
