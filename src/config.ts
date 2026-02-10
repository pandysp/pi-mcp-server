/**
 * Configuration loaded from environment variables.
 */

import { existsSync, statSync } from "node:fs";

export interface Config {
  provider: string;
  model: string;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  cwd: string;
  tools: string[];
  sandbox: boolean;
  sandboxAllowedDomains: string[];
  sandboxDenyRead: string[];
  sandboxAllowWrite: string[];
  sandboxDenyWrite: string[];
  maxSessions: number;
  sessionIdleTimeout: number;
}

const VALID_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

const THINKING_LEVELS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

const PROVIDER_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): Config {
  const provider = process.env.PI_MCP_PROVIDER ?? "anthropic";
  const model =
    process.env.PI_MCP_MODEL ?? "claude-sonnet-4-20250514";

  const thinkingRaw = process.env.PI_MCP_THINKING ?? "medium";
  if (!THINKING_LEVELS.has(thinkingRaw)) {
    throw new Error(
      `Invalid PI_MCP_THINKING: "${thinkingRaw}". Must be one of: ${[...THINKING_LEVELS].join(", ")}`,
    );
  }
  const thinkingLevel = thinkingRaw as Config["thinkingLevel"];

  const cwd = process.env.PI_MCP_CWD ?? process.cwd();
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new Error(
      `Invalid PI_MCP_CWD: "${cwd}" does not exist or is not a directory.`,
    );
  }

  const tools = parseCommaSeparated(
    process.env.PI_MCP_TOOLS ?? "read,bash,edit,write",
  );
  const unknownTools = tools.filter((t) => !VALID_TOOLS.has(t));
  if (unknownTools.length > 0) {
    throw new Error(
      `Invalid PI_MCP_TOOLS: unknown tool(s) "${unknownTools.join('", "')}". Valid tools: ${[...VALID_TOOLS].join(", ")}`,
    );
  }

  const sandbox = process.env.PI_MCP_SANDBOX === "true";
  const sandboxAllowedDomains = parseCommaSeparated(
    process.env.PI_MCP_SANDBOX_ALLOWED_DOMAINS,
  );
  const sandboxDenyRead = parseCommaSeparated(
    process.env.PI_MCP_SANDBOX_DENY_READ,
  );
  const sandboxAllowWrite = parseCommaSeparated(
    process.env.PI_MCP_SANDBOX_ALLOW_WRITE,
  );
  const sandboxDenyWrite = parseCommaSeparated(
    process.env.PI_MCP_SANDBOX_DENY_WRITE,
  );

  const maxSessions = parseInt(process.env.PI_MCP_MAX_SESSIONS ?? "20", 10);
  if (isNaN(maxSessions) || maxSessions < 1) {
    throw new Error(
      `Invalid PI_MCP_MAX_SESSIONS: "${process.env.PI_MCP_MAX_SESSIONS}". Must be a positive integer.`,
    );
  }

  const sessionIdleTimeout = parseInt(
    process.env.PI_MCP_SESSION_IDLE_TIMEOUT ?? "3600",
    10,
  );
  if (isNaN(sessionIdleTimeout) || sessionIdleTimeout < 0) {
    throw new Error(
      `Invalid PI_MCP_SESSION_IDLE_TIMEOUT: "${process.env.PI_MCP_SESSION_IDLE_TIMEOUT}". Must be a non-negative integer.`,
    );
  }

  // Map PI_MCP_API_KEY to the correct provider env var
  const apiKey = process.env.PI_MCP_API_KEY;
  if (apiKey) {
    const envVar = PROVIDER_KEY_MAP[provider];
    if (envVar) {
      if (!process.env[envVar]) {
        process.env[envVar] = apiKey;
      }
    } else {
      console.error(
        `Warning: PI_MCP_API_KEY set but provider "${provider}" is not in the known provider map. ` +
          `The key will not be automatically mapped. Set the provider's API key env var directly.`,
      );
    }
  }

  return {
    provider,
    model,
    thinkingLevel,
    cwd,
    tools,
    sandbox,
    sandboxAllowedDomains,
    sandboxDenyRead,
    sandboxAllowWrite,
    sandboxDenyWrite,
    maxSessions,
    sessionIdleTimeout,
  };
}
