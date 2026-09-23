# AgentData MCP Server

Free company data for AI agents, as MCP tools. [AgentData](https://agentdata.run) profiles companies from the public web: tech stacks, web signals (pricing page, free trial, API docs, careers), email addresses with their verification status, people with titles, and switch signals (who just dropped or adopted a tool).

Works with Claude, Claude Code, ChatGPT, Codex, Gemini, Cursor, Windsurf, VS Code, GitHub Copilot, Zed, Cline and any other MCP client.

## Quick start

No key is needed to search companies, browse technologies or read switch signals. Emails and people need a free API key (1,000 contact reveals a day, no card): sign up at [agentdata.run/signup](https://agentdata.run/signup) and copy the key from [agentdata.run/settings](https://agentdata.run/settings).

### Claude Code

```bash
claude mcp add agentdata -- npx -y agentdata-mcp-server --api-key YOUR_API_KEY
```

### Claude Desktop, Cursor, Windsurf, VS Code, Cline

Add to the client's MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, `mcp.json`):

```json
{
  "mcpServers": {
    "agentdata": {
      "command": "npx",
      "args": ["-y", "agentdata-mcp-server", "--api-key", "YOUR_API_KEY"]
    }
  }
}
```

Leave out `--api-key` to run anonymously (company, technology and signal tools only).

### Hosted (no install)

```
https://mcp.agentdata.run/mcp
```

Streamable HTTP. Send `Authorization: Bearer YOUR_API_KEY` for emails and people; without a header it serves the anonymous tools. In Claude Code:

```bash
claude mcp add agentdata --transport http https://mcp.agentdata.run/mcp --header "Authorization: Bearer YOUR_API_KEY"
```

## Tools

| Tool | What it returns | Cost | Key |
|------|-----------------|------|-----|
| `search_companies` | Companies by name or by sector, size, b2b/b2c, model, technology, country | none | no |
| `get_technologies` | The technology index, or companies using one technology | none | no |
| `get_signals` | Companies that added, removed or switched a tool; growth and hiring changes | none | no |
| `lookup_company` | One domain's full record: company, tech stack, signals, email pattern, email addresses, people | 1 reveal per domain per 30 days | yes |
| `find_people` | People by title, seniority, department, company filters | 1 reveal per company in the response | yes |
| `get_person` | One person by id, with email | 1 reveal (free if the company was revealed in the last 30 days) | yes |
| `check_usage` | Plan and what is left today | none | no |

Every response ends with a usage line (reveals, requests and companies left), so an agent can pace itself. A domain that has not been profiled yet is queued at the front of the crawl and answers "retry in about two minutes" without charging.

## Limits

| | Anonymous | Free key | Pro ($99 a year) |
|---|---|---|---|
| Contact reveals a day | none | 1,000 | 10,000 |
| Requests per 5 hours | 300 | 5,000 | 25,000 |
| Requests a second | 2 | 5 | 20 |
| Distinct companies a day | 200 | 5,000 | 25,000 |

Nothing else is metered. Details at [agentdata.run/pricing](https://agentdata.run/pricing).

## Example prompts

- "Which SaaS companies use Intercom? Give me small ones with a pricing page."
- "Look up linear.app: tech stack, and who runs engineering."
- "Who dropped Zendesk in the last 30 days?"
- "Find heads of sales at fintech companies that use HubSpot, with email addresses."
- "How many contact reveals do I have left today?"

## Run from source

```bash
npm install
npm run build
node dist/index.js --api-key YOUR_API_KEY      # stdio
node dist/index.js --http --port 3001          # Streamable HTTP on POST /mcp, 127.0.0.1 only
node dist/index.js --help
```

`AGENTDATA_API_KEY`, `PORT` and `HOST` work as environment variables. `npm run inspect` opens the MCP Inspector.

The HTTP server binds to 127.0.0.1 by default and only answers local pages, so a key you start it with cannot be used by other sites or other machines. `--host 0.0.0.0` makes it public; in that mode the startup key is ignored and every caller must send its own `Authorization: Bearer` key.

## Links

- Website: [agentdata.run](https://agentdata.run)
- How it works: [agentdata.run/how-it-works](https://agentdata.run/how-it-works)
- API docs: [agentdata.run/docs](https://agentdata.run/docs)
- The data, as it is: [agentdata.run/data](https://agentdata.run/data)

MIT licence.
