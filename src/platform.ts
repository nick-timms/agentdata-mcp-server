import { isIP } from "node:net";

/**
 * Which AI platform called (for usage logs only since 3.0.0: every call carries its own
 * credential, so platforms no longer affect limits). Claude reaches connectors from Anthropic's
 * published range; ChatGPT identifies itself in the User-Agent.
 */
export type Platform = "claude" | "chatgpt" | "direct";

// https://claude.com/docs/connectors/building/authentication (Network reference)
const ANTHROPIC = { base: ipv4ToInt("160.79.104.0")!, bits: 21 };

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

function inAnthropic(ip: string | undefined): boolean {
  if (!ip || isIP(ip) !== 4) return false;
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const mask = (0xffffffff << (32 - ANTHROPIC.bits)) >>> 0;
  return ((n & mask) >>> 0) === ((ANTHROPIC.base & mask) >>> 0);
}

export function platformFor(ip: string | undefined, userAgent: string): Platform {
  if (/claude-user/i.test(userAgent) || inAnthropic(ip)) return "claude";
  if (/openai|chatgpt/i.test(userAgent)) return "chatgpt";
  return "direct";
}
