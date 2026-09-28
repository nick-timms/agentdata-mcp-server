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
 * ChatGPT is not recognised yet: its callers count per IP, as before. It comes
 * with the ChatGPT listing, with the range file's shape verified and a
 * platform-wide cap.
 */
export type Platform = "claude" | "claude-other";

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

/** The platform behind a caller, or null for an ordinary caller. IPv4 only. */
export function platformFor(ip: string | undefined, userAgent: string | undefined): Platform | null {
  if (!ip || isIP(ip) !== 4 || !inRange(ip, ANTHROPIC_V4)) return null;
  return /^Claude-User\b/.test(String(userAgent || "")) ? "claude" : "claude-other";
}
