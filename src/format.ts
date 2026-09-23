import { ApiError, type ApiResponse, type Usage } from "./api-client.js";

export const SETTINGS_URL = "https://agentdata.run/settings";
export const SIGNUP_URL = "https://agentdata.run/signup";
export const PRICING_URL = "https://agentdata.run/pricing";
export const DOCS_URL = "https://agentdata.run/docs";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function n(v: number | undefined): string {
  return v === undefined ? "?" : v.toLocaleString("en-US");
}

/** One line the agent can read to stay inside its limits. */
export function usageLine(u: Usage, hasKey: boolean): string {
  const parts: string[] = [];
  const any = u.plan || u.lookupsRemaining !== undefined || u.requestsRemaining !== undefined || u.companiesRemaining !== undefined;
  if (!any) return hasKey ? "" : "usage: no key (anonymous)";
  if (u.plan) parts.push(`plan ${u.plan}`);
  // Anonymous callers have no reveals at all; "0 of 0 left" is noise.
  if (u.lookupsRemaining !== undefined && u.lookupsLimit !== undefined && u.lookupsLimit > 0) {
    parts.push(`contact reveals ${n(u.lookupsRemaining)} of ${n(u.lookupsLimit)} left today${u.lookupsConsumed ? ` (this call used ${u.lookupsConsumed})` : ""}`);
  }
  if (u.requestsRemaining !== undefined && u.requestsLimit !== undefined) {
    parts.push(`requests ${n(u.requestsRemaining)} of ${n(u.requestsLimit)} left this ${u.requestsWindow || "5h"} window`);
  }
  if (u.companiesRemaining !== undefined && u.companiesLimit !== undefined) {
    parts.push(`companies ${n(u.companiesRemaining)} of ${n(u.companiesLimit)} left today`);
  }
  // A sparse response (a 429 that carries only Retry-After, say) can leave
  // nothing worth printing; say nothing rather than a bare "usage:".
  if (parts.length === 0) return hasKey ? "" : "usage: no key (anonymous)";
  return `usage: ${parts.join(" · ")}`;
}

/** A successful call: the JSON body, then the usage line. */
export function ok(res: ApiResponse, hasKey: boolean, note?: string): ToolResult {
  // Compact JSON: pretty-printing costs about 40% more tokens on a full lookup.
  const text = [JSON.stringify(res.body), note, usageLine(res.usage, hasKey)].filter(Boolean).join("\n\n");
  return { content: [{ type: "text", text }] };
}

/** A failed call, explained so the agent (or the person) knows what to do next. */
export function fail(err: unknown, what: string, hasKey: boolean): ToolResult {
  if (err instanceof ApiError) {
    const b = err.body;
    const reason = String(b.reason || "");
    let text: string;
    if (err.status === 401) {
      text = hasKey
        ? `${what}: the API key was rejected. Check it at ${SETTINGS_URL} (Settings, API key) and pass it as --api-key, AGENTDATA_API_KEY or an Authorization: Bearer header.`
        : `${what}: this tool needs an API key because it returns emails or people. Keys are free (1,000 contact reveals a day, no card): sign up at ${SIGNUP_URL}, copy the key from ${SETTINGS_URL}, then restart this server with --api-key or AGENTDATA_API_KEY. Company, technology, search and signal tools work without a key.`;
    } else if (err.status === 404 && b.status === "excluded") {
      // A category we never crawl (adult, piracy, gambling). Retrying cannot help.
      text = `${what}: ${String(b.hint || "this site is in a category we do not crawl. Nothing was charged.")} Do not retry this domain.`;
    } else if (err.status === 404 && b.status && b.retry_after_seconds !== undefined) {
      // Unknown domain, now queued (front or normal priority). Not charged, not an error.
      const secs = Number(b.retry_after_seconds) || 0;
      const when = secs >= 3600 ? `about ${Math.round(secs / 3600)} hour${secs >= 5400 ? "s" : ""}` : secs >= 120 ? `about ${Math.round(secs / 60)} minutes` : `about ${secs} seconds`;
      // The API's hint already says when to retry; add our own timing only without one.
      text = b.hint
        ? `${what}: not profiled yet. ${String(b.hint)}`
        : `${what}: not profiled yet. Queued for crawling (${b.priority === "normal" ? "normal priority" : "front of the queue"}). Nothing was charged. Retry in ${when}.`;
      return { content: [{ type: "text", text }] };
    } else if (err.status === 404) {
      text = `${what}: not found. ${String(b.error || "")}`.trim();
    } else if (err.status === 429) {
      const wait = err.usage.retryAfter ?? (typeof b.reset_in_seconds === "number" ? b.reset_in_seconds : undefined);
      const when = wait === undefined
        ? ""
        : wait < 120 ? ` Retry in ${wait} second${wait === 1 ? "" : "s"}.`
        : wait < 7200 ? ` Resets in about ${Math.round(wait / 60)} minutes.`
        : ` Resets in about ${Math.round(wait / 3600)} hours.`;
      const why: Record<string, string> = {
        rps: "too many requests per second",
        req5h: "the 5-hour request window is used up",
        companies_day: "today's distinct-companies allowance is used up",
        contacts_day: "today's contact reveals are used up",
      };
      const upgrade = b.upgrade ? ` ${String(b.upgrade)}` : (err.usage.plan === "pro" ? "" : ` Higher limits: ${PRICING_URL}`);
      text = `${what}: rate limited (${why[reason] || reason || "limit reached"}).${when}${upgrade}`;
    } else {
      text = `${what}: HTTP ${err.status}. ${String(b.message || b.error || "")}`.trim();
    }
    const line = usageLine(err.usage, hasKey);
    return { isError: true, content: [{ type: "text", text: line ? `${text}\n\n${line}` : text }] };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: `${what}: ${msg}` }] };
}
