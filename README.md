# pi-mcp-server

[![npm version](https://img.shields.io/npm/v/pi-mcp-server.svg)](https://www.npmjs.com/package/pi-mcp-server)
[![CI](https://github.com/pandysp/pi-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/pandysp/pi-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server that wraps the [Pi coding agent](https://github.com/mariozechner/pi-coding-agent) as tools. Use Pi as a sub-agent from Claude Desktop, Cursor, or any MCP client.

## Why use this?

Pi is a fast, lightweight coding agent. This server exposes it via [MCP](https://modelcontextprotocol.io) so your primary AI can delegate coding tasks to Pi — getting a second opinion, running in parallel, or using a different model.

## Installation

```bash
npm install -g pi-mcp-server
```

Or run directly with npx:

```bash
npx pi-mcp-server
```

## Quick Start

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pi": {
      "command": "npx",
      "args": ["-y", "pi-mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "pi": {
      "command": "npx",
      "args": ["-y", "pi-mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_MCP_API_KEY` | — | API key (auto-mapped to provider-specific env var) |
| `PI_MCP_PROVIDER` | `anthropic` | LLM provider (`anthropic`, `openai`, `google`, `mistral`, `groq`, `cerebras`, `xai`, `openrouter`) |
| `PI_MCP_MODEL` | `claude-sonnet-4-20250514` | Model ID |
| `PI_MCP_THINKING` | `medium` | Thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) |
| `PI_MCP_CWD` | `process.cwd()` | Default working directory |
| `PI_MCP_TOOLS` | `read,bash,edit,write` | Comma-separated tool list (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) |
| `PI_MCP_MAX_SESSIONS` | `20` | Maximum concurrent sessions |
| `PI_MCP_SESSION_IDLE_TIMEOUT` | `3600` | Session idle timeout in seconds (0 = no expiry) |
| `PI_MCP_SANDBOX` | `false` | Enable sandbox mode (requires `@anthropic-ai/sandbox-runtime`) |
| `PI_MCP_SANDBOX_ALLOWED_DOMAINS` | — | Comma-separated allowed domains for sandbox |
| `PI_MCP_SANDBOX_DENY_READ` | — | Comma-separated paths to deny reading in sandbox |
| `PI_MCP_SANDBOX_ALLOW_WRITE` | — | Comma-separated paths to allow writing in sandbox |
| `PI_MCP_SANDBOX_DENY_WRITE` | — | Comma-separated paths to deny writing in sandbox |

## Tools

### `pi`

Start a new Pi coding agent session.

**Input:**
- `prompt` (string, required) — The task or question
- `provider` (string, optional) — LLM provider override
- `model` (string, optional) — Model ID override
- `thinkingLevel` (string, optional) — Thinking level override
- `cwd` (string, optional) — Working directory override

**Output:** Response text prefixed with `[thread_id: <uuid>]` for follow-up.

### `pi-reply`

Continue an existing session.

**Input:**
- `threadId` (string, required) — Thread ID from a previous `pi` call
- `prompt` (string, required) — Follow-up message

**Output:** Response text from the agent.

## Sandbox Mode

Enable sandbox mode for isolated command execution:

```bash
PI_MCP_SANDBOX=true npx pi-mcp-server
```

Requires the optional dependency `@anthropic-ai/sandbox-runtime`:

```bash
npm install @anthropic-ai/sandbox-runtime
```

## Development

```bash
git clone https://github.com/pandysp/pi-mcp-server.git
cd pi-mcp-server
npm install
npm run build
npm test

# Smoke test (requires API key)
ANTHROPIC_API_KEY=sk-ant-... node test/smoke.mjs
```

## License

MIT
