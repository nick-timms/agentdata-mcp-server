# Changelog

## 2.2.0

Ready for ChatGPT.

- ChatGPT is recognised by OpenAI's published range for plugins, connectors and GPT Actions (`openai.com/chatgpt-connectors.json`), downloaded at start and every 12 hours. Keyless calls from there count in one `chatgpt` pool with platform-wide caps, like Claude's, instead of one per-IP allowance shared by every ChatGPT user. OpenAI's per-user id is in the request body and can be forged, so it is not used. Until the first download succeeds, ChatGPT callers count per IP. Requires the matching API release.
- `check_usage` without a key describes what an API key adds, with a link to the docs, and no sign-up offer (OpenAI's plugin rules).

## 2.1.1

Without a key, the server gives what agentdata.run shows to a visitor who is not signed in. Requires the matching API release.

- `lookup_company` returns everything on the public company page: company facts (employees, funding stage, sales motion, tech sophistication, sector rank, social profiles), the email format, general inboxes (info@, sales@ and so on), address and phone where listed, the top people's titles, seniority and LinkedIn URLs (not names), recent activity, recent tool changes and similar companies. Its email count uses the page's rule, so both show the same number.
- `find_people` is available without a key, as on the public people directory: the first 20 matches, the last 5 withheld, no email addresses, with the directory's filters (domain, name, title, seniority, department, email or LinkedIn found, sector, B2B or B2C).
- `GET /favicon.ico` redirects to the AgentData icon, so Claude shows it for the connector.
- On-request profiling is described as "usually within a few minutes".

## 2.1.0

Ready for the Claude directory.

- Claude is recognised by Anthropic's published address range (`160.79.104.0/21`). All Claude users reach a connector from there, so keyless calls are now counted in a pool for Claude instead of sharing one per-IP allowance: `claude` for claude.ai, Desktop and mobile (User-Agent `Claude-User`), and a smaller `claude-other` pool for anything else from that range (for example the API's MCP connector). The platform is covered by the same signature (`ip|ts|platform|`). Requires the matching API release, which also sets the pool limits and can switch pools off. ChatGPT callers still count per IP; they get the same treatment with the ChatGPT listing.
- Without a key, only tools that work without one are listed: `lookup_company` (the public profile: company, tech stack with first and last seen, signals, and how many addresses and people were found), `search_companies`, `get_technologies`, `get_signals` and `check_usage`. `find_people`, `get_person`, the email pattern and the `career_move` signal need a key.
- Tool descriptions say when to use each tool; no prices or plan offers in descriptions or responses. Rate-limit messages state the limit and the reset only.
- Every tool states `title`, `readOnlyHint`, `destructiveHint` and `openWorldHint`.
- The size filter is described as what it is: an estimate from the people and addresses found on a company's website, not headcount.
- Hosted mode logs one line per `initialize` and per tool call (tool, platform, client, keyed, duration, error), never arguments or results, so usage can be counted. For its first day it also logs the header names (not values) of a few Claude requests.
- `Authorization: bearer` is accepted in any case.
- A failed request returns a JSON-RPC error with a reference id instead of a bare "Internal server error".
- `scripts/e2e-local.mjs` exercises the HTTP server against a mock API.

## 2.0.0

The free model, end to end.

- No API key needed for `search_companies`, `get_technologies` and `get_signals`. The server starts without a key (anonymous, per-IP limits) and says so once on stderr.
- Free keys are accepted everywhere. 1.x refused any free-plan key in HTTP mode ("API access requires a paid plan"), which has been wrong since the free model shipped.
- Every response ends with a usage line built from the API's headers: plan, contact reveals left today, requests left in the 5-hour window, distinct companies left.
- 401, 404 (domain queued for crawling, not charged) and 429 (with the reason and reset time) come back as instructions the agent can act on instead of raw errors.
- Filter values match the API: seniority is founder / executive / senior / mid / junior; departments, sectors, sizes and business models are enums; company filters use `b2b` and `model`; signals accept every change type plus `career_move`.
- New `get_person` tool (one person by id, with their email). `find_people` rows now carry ids.
- Domains are normalised (`https://www.stripe.com/` becomes `stripe.com`); technology names are slugified.
- Server instructions tell agents which tools cost reveals and to wait for a reset rather than retry in a loop.
- HTTP mode: CORS for browser clients, `GET /` describes the server, `/health` reports the real version, one transport per request with cleanup on close.
- Hosted mode forwards each caller's IP to the API, signed with `MCP_PROXY_SECRET` (set the same value on Railway and Vercel), so anonymous users of mcp.agentdata.run are rate-limited individually rather than all sharing the server's address.
- Tool annotations (read-only, open world), `--help`, `AGENTDATA_API_URL` for testing against a mock, 30 s request timeout, User-Agent header.
- The forwarded caller address comes from `X-Real-IP`, which Railway's edge sets to the client's address; `X-Forwarded-For` is never trusted. With no valid `X-Real-IP` nothing is signed, so the API counts the call against the server's own address (stricter, never forgeable).
- The signature covers the address and a timestamp (`X-AgentData-Client-Ts`), and the API accepts it for two minutes, so a signature seen in a log cannot be replayed later. Requires the matching API release.
- The hosted server never falls back to a startup key: in public mode every caller brings its own. A loopback server may still use the key it was started with.
- The HTTP server binds to 127.0.0.1 by default, refuses non-local Origins and non-local Host headers (DNS-rebinding protection); `--host 0.0.0.0` for public mode.
- Per-caller rate limit (burst 20, 10 a second) and a cap of 100 requests in flight, applied before anything is sent upstream; a client that disconnects cancels its upstream request.
- A domain in a category we do not crawl says so and tells the agent not to retry; a normal-priority crawl is no longer described as front of the queue, and waits read in minutes or hours.
- `get_technologies` explains `listed_count` (how far the list pages) versus `company_count`.
- Responses are compact JSON (about 40% fewer tokens on a full lookup).
- Server instructions no longer quote a coverage total; they point at agentdata.run/data.
- Docker image installs with `--ignore-scripts` and runs as the unprivileged `node` user.

## 1.0.2

Email verification filters for lookup and people tools.
