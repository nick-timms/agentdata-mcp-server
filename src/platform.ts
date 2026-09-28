import { isIP } from "node:net";

/**
 * AI platforms that call the hosted server on their users' behalf.
 *
 * Claude reaches a directory connector from Anthropic's servers, so all Claude
 * users arrive from a handful of addresses, and rate limiting them per IP would
 * make every user share one small allowance. The server recognises Anthropic's
 * published range (a TCP source address cannot be forged, and Railway's edge
 * sets X-Real-IP to it) and tells the API, in its signed headers, to count
 * keyless calls in a pool instead.
 *
 *   claude        User-Agent "Claude-User": claude.ai, Desktop, mobile
 *   claude-other  anything else from the range (for example API customers using
 *                 the MCP connector), which gets a smaller pool so it cannot use
 *                 up the one people chat through
 *
 *   chatgpt       any caller in OpenAI's published range for plugins,
 *                 connectors and GPT Actions (openai.com/chatgpt-connectors.json).
 *                 The range is recognised, not the user: OpenAI's per-user id
 *                 (_meta openai/subject) is in the request body and can be
 *                 forged, so ChatGPT gets one pool with platform-wide caps.
 *                 The list changes without notice, so it is downloaded at
 *                 start and every 12 hours; until the first download succeeds,
 *                 ChatGPT callers count per IP as ordinary callers.
 */
export type Platform = "claude" | "claude-other" | "chatgpt";

// https://claude.com/docs/connectors/building/authentication (Network reference)
const ANTHROPIC_V4 = { base: ipv4ToInt("160.79.104.0")!, bits: 21 };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n >>> 0;
}

function inRange(ip: string, range: { base: number; bits: number }): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const mask = (0xffffffff << (32 - range.bits)) >>> 0;
  return ((n & mask) >>> 0) === ((range.base & mask) >>> 0);
}

const OPENAI_RANGES_URL = "https://openai.com/chatgpt-connectors.json";
let openAiRanges: Array<{ base: number; bits: number }> = [];

/** Parse "a.b.c.d/n" into a range, or null if it is not a valid IPv4 prefix. */
function parsePrefix(prefix: unknown): { base: number; bits: number } | null {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(prefix || "").trim());
  if (!m) return null;
  const base = ipv4ToInt(m[1]);
  const bits = Number(m[2]);
  if (base === null || bits < 8 || bits > 32) return null;
  return { base, bits };
}

/**
 * Download OpenAI's range list. Keeps the previous list if the download or
 * the file's shape fails, so a bad fetch never widens or empties recognition.
 */
export async function refreshOpenAiRanges(fetchImpl: typeof fetch = fetch): Promise<number> {
  try {
    const res = await fetchImpl(OPENAI_RANGES_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { prefixes?: Array<{ ipv4Prefix?: string }> };
    const ranges = (body.prefixes || []).map((p) => parsePrefix(p.ipv4Prefix)).filter((r): r is { base: number; bits: number } => r !== null);
    if (ranges.length < 10) throw new Error(`only ${ranges.length} usable prefixes`);
    openAiRanges = ranges;
    console.log(JSON.stringify({ evt: "openai_ranges", count: ranges.length }));
    return ranges.length;
  } catch (err) {
    console.log(JSON.stringify({ evt: "openai_ranges_failed", kept: openAiRanges.length, error: String(err instanceof Error ? err.message : err).slice(0, 120) }));
    return openAiRanges.length;
  }
}

/** For tests: set the OpenAI ranges directly. */
export function setOpenAiRangesForTest(prefixes: string[]): void {
  openAiRanges = prefixes.map(parsePrefix).filter((r): r is { base: number; bits: number } => r !== null);
}

/** The platform behind a caller, or null for an ordinary caller. IPv4 only. */
export function platformFor(ip: string | undefined, userAgent: string | undefined): Platform | null {
  if (!ip || isIP(ip) !== 4) return null;
  if (inRange(ip, ANTHROPIC_V4)) return /^Claude-User\b/.test(String(userAgent || "")) ? "claude" : "claude-other";
  if (openAiRanges.some((r) => inRange(ip, r))) return "chatgpt";
  return null;
}
