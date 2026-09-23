import { createRequire } from "node:module";
import { createHmac } from "node:crypto";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
export const BASE_URL = process.env.AGENTDATA_API_URL || "https://agentdata.run/api/v1";
const TIMEOUT_MS = 30_000;

/** Usage headers the API returns on every data response. */
export interface Usage {
  plan?: string;
  lookupsLimit?: number;
  lookupsRemaining?: number;
  lookupsConsumed?: number;
  requestsLimit?: number;
  requestsRemaining?: number;
  requestsWindow?: string;
  companiesLimit?: number;
  companiesRemaining?: number;
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
    lookupsLimit: num(h, "x-lookups-limit"),
    lookupsRemaining: num(h, "x-lookups-remaining"),
    lookupsConsumed: num(h, "x-lookups-consumed"),
    requestsLimit: num(h, "x-ratelimit-limit"),
    requestsRemaining: num(h, "x-ratelimit-remaining"),
    requestsWindow: h.get("x-ratelimit-window") || undefined,
    companiesLimit: num(h, "x-companies-limit"),
    companiesRemaining: num(h, "x-companies-remaining"),
    retryAfter: num(h, "retry-after"),
  };
}

export type Params = Record<string, string | number | boolean | undefined | null>;

/**
 * Thin fetch wrapper for the AgentData REST API. The key is optional: company,
 * technology, search and signal endpoints work without one (per-IP limits);
 * emails and people need a free key.
 */
export class AgentDataClient {
  private apiKey: string | undefined;
  private clientIp: string | undefined;
  private signal: AbortSignal | undefined;

  /**
   * @param clientIp In HTTP mode, the caller's address. Forwarded to the API
   *   with a timestamp, signed with MCP_PROXY_SECRET, so anonymous callers of
   *   the hosted server are rate-limited individually instead of all sharing
   *   this server's IP. The API accepts a signature for two minutes only.
   * @param signal Aborted when the MCP client disconnects, so an abandoned
   *   request stops costing the API.
   */
  constructor(apiKey?: string, clientIp?: string, signal?: AbortSignal) {
    this.apiKey = apiKey?.trim() || undefined;
    this.clientIp = clientIp?.trim() || undefined;
    this.signal = signal;
  }

  get hasKey(): boolean {
    return !!this.apiKey;
  }

  async get(path: string, params?: Params): Promise<ApiResponse> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": `agentdata-mcp-server/${VERSION}`,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const secret = (process.env.MCP_PROXY_SECRET || "").trim();
    if (this.clientIp && secret) {
      const ts = String(Math.floor(Date.now() / 1000));
      headers["X-AgentData-Client-IP"] = this.clientIp;
      headers["X-AgentData-Client-Ts"] = ts;
      headers["X-AgentData-Client-Sig"] = createHmac("sha256", secret).update(`${this.clientIp}|${ts}`).digest("hex");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      const signal = this.signal ? AbortSignal.any([controller.signal, this.signal]) : controller.signal;
      response = await fetch(url.toString(), { headers, signal });
    } catch (err) {
      clearTimeout(timer);
      const reason = this.signal?.aborted
        ? "the request was cancelled"
        : err instanceof Error && err.name === "AbortError" ? `timed out after ${TIMEOUT_MS / 1000}s` : (err instanceof Error ? err.message : String(err));
      throw new Error(`Could not reach ${url.host} (${reason}). Check your network, then retry; status at https://agentdata.run/data`);
    }
    clearTimeout(timer);

    let body: Record<string, unknown> = {};
    const text = await response.text();
    if (text) {
      try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { error: text.slice(0, 300) }; }
    }
    const usage = readUsage(response.headers);
    if (!response.ok) throw new ApiError(response.status, body, usage);
    return { body, usage, status: response.status };
  }

  // Company record: 1 contact reveal per domain. Key required.
  lookup(domain: string, params: { min_confidence?: number; verification_status?: string } = {}) {
    return this.get("/lookup", { domain, ...params });
  }

  // Name or domain search. No key needed.
  search(q: string) {
    return this.get("/search", { q });
  }

  // Filtered company list. No key needed.
  companies(params: Params) {
    return this.get("/companies", params);
  }

  // People search: 1 reveal per company in the response. Key required.
  people(params: Params) {
    return this.get("/people", params);
  }

  // One person with their email: 1 reveal. Key required.
  person(id: string) {
    return this.get(`/people/${encodeURIComponent(id)}`);
  }

  // Technology index or companies using one technology. No key needed.
  technologies(limit?: number) {
    return this.get("/tech", { limit });
  }
  technology(slug: string, page?: number) {
    return this.get(`/tech/${encodeURIComponent(slug)}`, { page });
  }

  // Tool adoption and removal signals. No key needed.
  signals(params: Params) {
    return this.get("/signals", params);
  }

  // People changing jobs: 1 reveal per company. Key required.
  careerMoves(params: Params) {
    return this.get("/career-moves", params);
  }

  // Plan and usage. Free, not counted.
  me() {
    return this.get("/me");
  }
}
