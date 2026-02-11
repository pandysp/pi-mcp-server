# Changelog

## [0.1.0] - 2026-02-11

### Added
- Initial release
- `pi` tool: start a new Pi coding agent session
- `pi-reply` tool: continue an existing session by thread ID
- Per-session mutex for safe concurrent access
- Session store with idle expiry and max session limits
- Optional sandbox mode via `@anthropic-ai/sandbox-runtime`
- Event streaming as MCP logging messages
- Multi-provider support (Anthropic, OpenAI, Google, Mistral, Groq, Cerebras, xAI, OpenRouter)
- Configurable tool set (read, bash, edit, write, grep, find, ls)
