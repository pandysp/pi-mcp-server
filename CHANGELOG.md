# Changelog

## [0.1.1] - 2026-02-11

### Fixed
- Race condition: session evicted during active pi-reply prompt
- Unhandled promise from `session.abort()` in sync disposal paths
- Empty catch blocks now log errors in `disposeSession`
- Bare catch on `store.set()` no longer swallows non-capacity errors
- Individual disposal failures in idle expiry no longer break the sweep
- Sandbox stderr annotation errors no longer hang the close handler
- Per-call `cwd` override now validated before use
- Version string read from package.json instead of hardcoded
- `buildTools` logs warning when valid tool name has no TOOL_MAP entry
- Event streamer now logs transport/disconnect errors

### Added
- README with badges, install guide, Claude Desktop and Cursor config examples
- MIT license, changelog, GitHub Actions CI and trusted publishing
- npm package metadata (exports, files, engines, keywords)
- TypeScript declaration maps for IDE "Go to Definition"

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
