# Changelog

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
