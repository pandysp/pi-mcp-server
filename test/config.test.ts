import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all PI_MCP_ vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("PI_MCP_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns defaults when no env vars set", () => {
    const config = loadConfig();
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-sonnet-4-20250514");
    expect(config.thinkingLevel).toBe("medium");
    expect(config.cwd).toBe(process.cwd());
    expect(config.tools).toEqual(["read", "bash", "edit", "write"]);
    expect(config.sandbox).toBe(false);
    expect(config.maxSessions).toBe(20);
    expect(config.sessionIdleTimeout).toBe(3600);
  });

  it("reads provider and model from env", () => {
    process.env.PI_MCP_PROVIDER = "openai";
    process.env.PI_MCP_MODEL = "gpt-4o";
    const config = loadConfig();
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
  });

  it("parses thinking level", () => {
    process.env.PI_MCP_THINKING = "high";
    const config = loadConfig();
    expect(config.thinkingLevel).toBe("high");
  });

  it("throws on invalid thinking level", () => {
    process.env.PI_MCP_THINKING = "ultra";
    expect(() => loadConfig()).toThrow('Invalid PI_MCP_THINKING: "ultra"');
  });

  it("parses comma-separated tools", () => {
    process.env.PI_MCP_TOOLS = "read,grep,ls";
    const config = loadConfig();
    expect(config.tools).toEqual(["read", "grep", "ls"]);
  });

  it("trims whitespace in comma-separated values", () => {
    process.env.PI_MCP_TOOLS = " read , bash , edit ";
    const config = loadConfig();
    expect(config.tools).toEqual(["read", "bash", "edit"]);
  });

  it("parses sandbox config", () => {
    process.env.PI_MCP_SANDBOX = "true";
    process.env.PI_MCP_SANDBOX_ALLOWED_DOMAINS = "github.com,npmjs.com";
    process.env.PI_MCP_SANDBOX_DENY_READ = "/etc/passwd,/etc/shadow";
    const config = loadConfig();
    expect(config.sandbox).toBe(true);
    expect(config.sandboxAllowedDomains).toEqual(["github.com", "npmjs.com"]);
    expect(config.sandboxDenyRead).toEqual(["/etc/passwd", "/etc/shadow"]);
  });

  it("throws on invalid maxSessions", () => {
    process.env.PI_MCP_MAX_SESSIONS = "abc";
    expect(() => loadConfig()).toThrow("Invalid PI_MCP_MAX_SESSIONS");
  });

  it("throws on zero maxSessions", () => {
    process.env.PI_MCP_MAX_SESSIONS = "0";
    expect(() => loadConfig()).toThrow("Invalid PI_MCP_MAX_SESSIONS");
  });

  it("throws on negative sessionIdleTimeout", () => {
    process.env.PI_MCP_SESSION_IDLE_TIMEOUT = "-1";
    expect(() => loadConfig()).toThrow("Invalid PI_MCP_SESSION_IDLE_TIMEOUT");
  });

  it("maps PI_MCP_API_KEY to provider env var", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.PI_MCP_API_KEY = "sk-test-key";
    process.env.PI_MCP_PROVIDER = "anthropic";
    loadConfig();
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-test-key");
  });

  it("does not overwrite existing provider env var", () => {
    process.env.ANTHROPIC_API_KEY = "existing-key";
    process.env.PI_MCP_API_KEY = "new-key";
    process.env.PI_MCP_PROVIDER = "anthropic";
    loadConfig();
    expect(process.env.ANTHROPIC_API_KEY).toBe("existing-key");
  });

  it("maps API key for openai provider", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.PI_MCP_API_KEY = "sk-openai-test";
    process.env.PI_MCP_PROVIDER = "openai";
    loadConfig();
    expect(process.env.OPENAI_API_KEY).toBe("sk-openai-test");
  });

  it("throws on unknown tool names", () => {
    process.env.PI_MCP_TOOLS = "read,typo,bash";
    expect(() => loadConfig()).toThrow('unknown tool(s) "typo"');
  });

  it("throws on non-existent cwd", () => {
    process.env.PI_MCP_CWD = "/nonexistent/path/12345";
    expect(() => loadConfig()).toThrow("does not exist or is not a directory");
  });

  it("warns on unknown provider with PI_MCP_API_KEY", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.PI_MCP_API_KEY = "sk-test";
    process.env.PI_MCP_PROVIDER = "custom-provider";
    loadConfig();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("custom-provider"),
    );
    errorSpy.mockRestore();
  });
});
