import { createHash } from "node:crypto";
import { secret } from "./api-client.js";

/**
 * Who a request belongs to (claude/MCP_V3_SPEC_2026-10-29.md, sections 3.1 and 3.6). Every request
 * must carry a credential: an OAuth access token issued by useagentdata.com for this server, or an
 * agd_live_ API key. Both are checked by introspection on the website; results are cached for 60
 * seconds (10 seconds for a "no"), keyed by the credential's SHA-256, so a regenerated key or a
 * disconnected app stops working within a minute.
 */
export const ISSUER = (process.env.AGENTDATA_ISSUER || "https://useagentdata.com").replace(/\/+$/, "");
export const RESOURCE = (process.env.MCP_RESOURCE || "https://mcp.useagentdata.com/mcp").replace(/\/+$/, "");
const INTROSPECT_URL = `${ISSUER}/api/oauth/introspect`;

export type Who = { userId: string; via: "oauth" | "key"; client?: string | null };

const cache = new Map<string, { who: Who | null; until: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.until < now) cache.delete(k);
}, 60_000).unref();

/** The credential from an Authorization: Bearer header (any case). */
export function bearerOf(header: string | string[] | undefined): string | undefined {
  const m = /^bearer\s+(.+)$/i.exec(String(header || "").trim());
  return m ? m[1].trim() : undefined;
}

export async function introspect(credential: string): Promise<Who | null> {
  const key = createHash("sha256").update(credential).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.who;
  let who: Who | null = null;
  try {
    const res = await fetch(INTROSPECT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ token: credential }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`introspection HTTP ${res.status}`);
    const r = (await res.json()) as { active?: boolean; via?: string; user_id?: string; resource?: string; client_name?: string | null };
    if (r.active && r.user_id) {
      // Tokens must have been issued for this server (MCP spec: audience validation). API keys are
      // our own first-party credential and carry no audience.
      if (r.via === "key") who = { userId: r.user_id, via: "key" };
      else if (r.via === "oauth" && (r.resource || "").replace(/\/+$/, "") === RESOURCE) who = { userId: r.user_id, via: "oauth", client: r.client_name ?? null };
    }
  } catch (err) {
    // A failed check is not a "no": don't cache it, and let the caller answer 503.
    console.error("introspection failed:", err instanceof Error ? err.message : err);
    throw err;
  }
  cache.set(key, { who, until: Date.now() + (who ? 60_000 : 10_000) });
  return who;
}

/** The RFC 9728 document this server publishes. */
export function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: ["agentdata"],
    bearer_methods_supported: ["header"],
    resource_name: "AgentData",
    resource_documentation: `${ISSUER}/docs/mcp`,
  };
}

export const PRM_URL = (() => {
  const u = new URL(RESOURCE);
  return `${u.origin}/.well-known/oauth-protected-resource${u.pathname === "/" ? "" : u.pathname}`;
})();

/** The challenge on every 401, so Claude and ChatGPT start the connect flow. */
export const WWW_AUTHENTICATE = `Bearer resource_metadata="${PRM_URL}", scope="agentdata"`;
