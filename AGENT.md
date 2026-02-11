# AGENT.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is `pi-mcp-server` -- an MCP server that wraps the Pi coding agent as tools. It provides two tools: `pi` (start a new session) and `pi-reply` (continue by thread ID).

## Key Files

- `src/index.ts`: Entry point (server setup, shutdown, transport)
- `src/tools/pi.ts`: `pi` tool (session creation, model resolution, tool building)
- `src/tools/pi-reply.ts`: `pi-reply` tool (session continuation with mutex)
- `src/session-store.ts`: Session lifecycle (idle expiry, capacity eviction)
- `src/config.ts`: Environment variable parsing and validation
- `src/sandbox.ts`: Optional sandbox adapter (`@anthropic-ai/sandbox-runtime`)
- `src/event-streamer.ts`: Forward Pi events as MCP logging messages
- `start.sh`/`start.bat`: Scripts to start the server

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Build (tsc)
npm run start        # Start the server
npm run dev          # Dev mode with tsc --watch
npm test             # Run unit tests
npm run test:watch   # Watch mode
```

## Architecture Notes

- Two MCP tools: `pi` (one-shot) and `pi-reply` (resume via thread_id)
- Sessions stored in `SessionStore` with idle expiry and max capacity
- Per-session mutex in `pi-reply` prevents concurrent prompt access
- Version read from `package.json` at runtime (not hardcoded)
- Multi-provider support via `@mariozechner/pi-ai` (Anthropic, OpenAI, Google, etc.)
- Optional sandbox mode wraps bash commands via `@anthropic-ai/sandbox-runtime`

## Environment Variables

- `PI_MCP_API_KEY`: API key (auto-mapped to provider-specific env var)
- `PI_MCP_PROVIDER`: LLM provider (default: `anthropic`)
- `PI_MCP_MODEL`: Model ID (default: `claude-sonnet-4-20250514`)
- `PI_MCP_THINKING`: Thinking level (default: `medium`)
- `PI_MCP_CWD`: Working directory (default: `process.cwd()`)
- `PI_MCP_TOOLS`: Comma-separated tool list (default: `read,bash,edit,write`)
- `PI_MCP_SANDBOX`: Enable sandbox mode (default: `false`)

## Best Practices

- Always test changes locally before committing
- Maintain compatibility with the Model Context Protocol spec
- Keep error messages informative for troubleshooting
- Document any changes to the API or configuration options
- Use `./scripts/publish-release.sh` for releases (bumps version, tags, pushes — CI publishes to npm)
