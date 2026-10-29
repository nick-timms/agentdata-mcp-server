import { ApiError, type ApiResponse, type Usage } from "./api-client.js";

export const SITE = "https://useagentdata.com";
export const PRICING_URL = "useagentdata.com/pricing";
export const SETTINGS_URL = "useagentdata.com/app/settings#api";
export const DOCS_URL = `${SITE}/docs/mcp`;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const n = (v: number) => v.toLocaleString("en-US");
const day = (iso: unknown) => {
  const d = typeof iso === "string" ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
};

const PLAN_NAMES: Record<string, string> = { trial: "trial", pro: "Pro", business: "Business", enterprise: "Enterprise", none: "no plan" };

/** One line the agent can read to stay inside its limits. */
export function usageLine(u: Usage): string {
  const parts: string[] = [];
  if (u.plan) parts.push(`plan ${PLAN_NAMES[u.plan] || u.plan}`);
  if (u.companiesRemaining !== undefined && u.companiesLimit !== undefined) parts.push(`companies ${n(u.companiesRemaining)} of ${n(u.companiesLimit)} left today`);
  if (u.requestsRemaining !== undefined && u.requestsLimit !== undefined) parts.push(`requests ${n(u.requestsRemaining)} of ${n(u.requestsLimit)} left in this window`);
  return parts.length ? `usage: ${parts.join(" · ")}` : "";
}

/** A successful call: compact JSON, an optional note, then the usage line. */
export function ok(res: ApiResponse, note?: string): ToolResult {
  const text = [JSON.stringify(res.body), note, usageLine(res.usage)].filter(Boolean).join("\n\n");
  return { content: [{ type: "text", text }] };
}

/** The plan messages (spec 5.3). Plain words, no prices, no "upgrade", no trial offer. */
function planMessage(b: Record<string, unknown>): string {
  const ended = day(b.trial_ended_at);
  const still = "The technology catalogue, list previews, the latest new customers and company look-ups still work.";
  if (ended) return `Your AgentData trial ended on ${ended}. Full customer lists, downloads and company contacts need a plan; plans are at ${PRICING_URL}. ${still}`;
  return `This AgentData account has no plan. Full customer lists, downloads and company contacts need a plan; plans are at ${PRICING_URL}. ${still}`;
}

const REASONS: Record<string, string> = {
  rps: "too many requests a second",
  req5h: "this window's requests are used up",
  companies_day: "today's companies are used up",
  blocked: "this account is paused",
};

/** A failed call, explained so the agent (or the person) knows what to do next. */
export function fail(err: unknown, what: string): ToolResult {
  if (err instanceof ApiError) {
    const b = err.body;
    const code = String(b.error || "");
    let text: string;
    if (code === "plan_required") {
      text = planMessage(b);
    } else if (code === "lists_full") {
      const held = Number(b.held || 0);
      text = `All ${b.limit ?? ""} lists on this plan are in use${held ? `, ${held} held for a few days after removal` : ""}. Remove one at useagentdata.com/app/lists.`.replace("All  lists", "All lists");
    } else if (code === "too_large" || code === "unknown_technology" || code === "empty" || code === "busy" || code === "locked" || code === "no_lists" || code === "invalid_domain") {
      text = String(b.message || code);
    } else if (code === "allowance_used") {
      text = "This period's download records are used up; companies you downloaded before never count again. Check check_usage for when they reset.";
    } else if (code === "not_profiled") {
      const secs = Number(b.retry_after_seconds) || 300;
      text = `${String(b.domain || "This domain")} hasn't been checked yet. It is queued; try again in about ${secs >= 3600 ? `${Math.round(secs / 3600)} hour` : `${Math.round(secs / 60)} minutes`}. Nothing was counted.`;
      return { content: [{ type: "text", text: `${what}: ${text}` }] };
    } else if (err.status === 429) {
      const wait = err.usage.retryAfter ?? (typeof b.reset_in_seconds === "number" ? b.reset_in_seconds : undefined);
      const when = wait === undefined ? "" : wait < 120 ? ` Retry in ${wait} second${wait === 1 ? "" : "s"}.` : wait < 7200 ? ` Resets in about ${Math.round(wait / 60)} minutes.` : ` Resets in about ${Math.round(wait / 3600)} hours.`;
      text = typeof b.notice === "string" ? String(b.notice) : `Limit reached (${REASONS[String(b.reason || "")] || "limit reached"}).${when}`;
    } else if (err.status === 401) {
      text = `This connection to AgentData is no longer valid. Reconnect AgentData (docs: ${DOCS_URL}).`;
    } else {
      text = `HTTP ${err.status}. ${String(b.message || b.error || "")}`.trim();
    }
    const line = usageLine(err.usage);
    return { isError: true, content: [{ type: "text", text: [`${what}: ${text}`, line].filter(Boolean).join("\n\n") }] };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: `${what}: ${msg}` }] };
}
