# AgentData MCP server

Customer lists of B2B software for AI agents. Ask who uses a technology (HubSpot, Zendesk, Stripe, Shopify and thousands more) and get the companies, each with how we found it, in the website's code or its public DNS records, and when we first and last saw it. Also: the companies that just started using a technology, one company's technologies grouped by category, and CSV downloads of the lists on your plan.

Website: [useagentdata.com](https://useagentdata.com) · Docs: [useagentdata.com/docs/mcp](https://useagentdata.com/docs/mcp)

## Connect

The server is hosted at `https://mcp.useagentdata.com/mcp` and needs an AgentData account.

- **Claude** (claude.ai, Desktop, mobile): Settings, Connectors, Add custom connector, paste the URL, then Connect. A page on useagentdata.com opens: sign in, or paste your API key.
- **ChatGPT:** add AgentData from the plugin directory, then Connect.
- **Claude Code:**
  ```bash
  claude mcp add --transport http agentdata https://mcp.useagentdata.com/mcp
  ```
  or, with your key and no sign-in step:
  ```bash
  claude mcp add --transport http agentdata https://mcp.useagentdata.com/mcp --header "Authorization: Bearer YOUR_API_KEY"
  ```
- **Cursor and other clients:** the URL with an `Authorization: Bearer YOUR_API_KEY` header.
- **Local (stdio) clients:**
  ```bash
  npx agentdata-mcp-server --api-key YOUR_API_KEY
  ```
  The package is a small bridge: each message goes to the hosted server with your key.

Your API key is in your account settings at useagentdata.com/app/settings#api. Generating a new key disconnects anything that uses the old one. Apps you connected by signing in are listed under Connected apps on the same page.

## Tools

| Tool | What it does |
|---|---|
| `find_technologies` | Find a technology by name or category: its exact name, category, how many companies use it, whether it is on your lists |
| `get_customer_list` | The companies using a technology, newest first, with how and when it was found and company details. Every company for the technologies on your lists, with filters; the first companies for any other |
| `get_new_customers` | Companies that recently started using a technology (7, 30 or 90 days), or across your lists |
| `lookup_company` | One company by domain: what it does and every technology found on it, grouped by category; with a plan, company contacts |
| `add_to_lists` | Add a technology to your lists, which unlocks its full customer list |
| `download_list` | Start a CSV download of a list on your lists (previews the size first) |
| `check_usage` | Your plan, lists, download records left and daily limits |

Plans, lists and limits are the same as on the website: see [useagentdata.com/pricing](https://useagentdata.com/pricing). Only downloads use records; browsing a list counts against the daily browsing limit.

## Development

```bash
npm install
npm run build
npm run e2e        # the HTTP server and the stdio bridge against a local mock of the website
```

The hosted server needs `MCP_V3_SECRET` (the same value as on the website's hosting) and reads the website at `https://useagentdata.com`; `AGENTDATA_API_URL`, `AGENTDATA_ISSUER` and `MCP_RESOURCE` override the addresses for tests.

## Licence

MIT
