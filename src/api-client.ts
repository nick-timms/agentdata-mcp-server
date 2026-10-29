import { createRequire } from "node:module";
import { createHash, createHmac } from "node:crypto";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
/** The website's MCP data routes (useagentdata.com/api/mcp/v3). */
export const BASE_URL = (process.env.AGENTDATA_API_URL || "https://useagentdata.com/api/mcp/v3").replace(/\/+$/, "");
const TIMEOUT_MS = 30_000;

/** Usage headers the data routes return. */
export interface Usage {
  plan?: string;
  companiesLimit?: number;
  companiesRemaining?: number;
  requestsLimit?: number;
  requestsRemaining?: number;
  retryAfter?: number;
}

export interface ApiResponse {
  body: Record<string, unknown>;
  usage: Usage;
  status: number;
}

/** A non-2xx answer, with the parsed body so tools can explain it. */
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  usage: Usage;
  constructor(status: number, body: Record<string, unknown>, usage: Usage) {
    super(String(body.message || body.error || `HTTP ${status}`));
    this.status = status;
    this.body = body;
    this.usage = usage;
  }
}

function num(h: Headers, name: string): number | undefined {
  const v = h.get(name);
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function readUsage(h: Headers): Usage {
  return {
    plan: h.get("x-plan") || undefined,
    companiesLimit: num(h, "x-companies-limit"),
    companiesRemaining: num(h, "x-companies-remaining"),
    requestsLimit: num(h, "x-ratelimit-limit"),
    requestsRemaining: num(h, "x-ratelimit-remaining"),
    retryAfter: num(h, "retry-after"),
  };
}

export type Params = Record<string, string | number | boolean | undefined | null>;

export function secret(): string {
  const s = (process.env.MCP_V3_SECRET || "").trim();
  if (s.length < 32) throw new Error("MCP_V3_SECRET is not set (at least 32 characters, the same value as on Vercel).");
  return s;
}

/**
 * Signed calls to the data routes. The caller's own credential is never forwarded (the MCP
 * authorization spec forbids token passthrough): the server checks it once by introspection, then
 * names the user in a signed header (claude/MCP_V3_SPEC_2026-10-29.md, section 4).
 */
export class AgentDataClient {
  /** The user id, or "-" for calls that need none (/facts). */
  readonly user: string;
  private signal: AbortSignal | undefined;

  constructor(user: string, signal?: AbortSignal) {
    this.user = user;
    this.signal = signal;
  }

  private async call(method: "GET" | "POST", path: string, params?: Params, json?: unknown): Promise<ApiResponse> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    const body = json === undefined ? "" : JSON.stringify(json);
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = `${this.user}|${ts}|${method}|${url.pathname}${url.search}|${createHash("sha256").update(body).digest("hex")}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": `agentdata-mcp-server/${VERSION}`,
      "X-AgentData-User": this.user,
      "X-AgentData-Ts": ts,
      "X-AgentData-Sig": createHmac("sha256", secret()).update(signed).digest("hex"),
    };
    if (body) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      const signal = this.signal ? AbortSignal.any([controller.signal, this.signal]) : controller.signal;
      response = await fetch(url.toString(), { method, headers, body: body || undefined, signal });
    } catch (err) {
      clearTimeout(timer);
      const reason = this.signal?.aborted
        ? "the request was cancelled"
        : err instanceof Error && err.name === "AbortError" ? `timed out after ${TIMEOUT_MS / 1000}s` : (err instanceof Error ? err.message : String(err));
      throw new Error(`Could not reach AgentData (${reason}). Retry in a moment.`);
    }
    clearTimeout(timer);

    let parsed: Record<string, unknown> = {};
    const text = await response.text();
    if (text) {
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = { error: text.slice(0, 300) }; }
    }
    const usage = readUsage(response.headers);
    if (!response.ok) throw new ApiError(response.status, parsed, usage);
    return { body: parsed, usage, status: response.status };
  }

  facts() { return this.call("GET", "/facts"); }
  me() { return this.call("GET", "/me"); }
  technologies(params: Params) { return this.call("GET", "/technologies", params); }
  list(params: Params) { return this.call("GET", "/list", params); }
  addList(tool: string) { return this.call("POST", "/lists", undefined, { tool }); }
  newCustomers(params: Params) { return this.call("GET", "/new-customers", params); }
  company(domain: string) { return this.call("GET", "/company", { domain }); }
  download(tool: string, filters: Record<string, string>, confirm: boolean) { return this.call("POST", "/downloads", undefined, { tool, filters, confirm }); }
  downloads() { return this.call("GET", "/downloads"); }
}
