#!/usr/bin/env node

/**
 * Pi MCP Server entry point.
 */

async function main() {
  const { createRequire } = await import("node:module");
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const { loadConfig } = await import("./config.js");
  const { SessionStore } = await import("./session-store.js");
  const { initSandbox, resetSandbox } = await import("./sandbox.js");
  const { registerPiTool } = await import("./tools/pi.js");
  const { registerPiReplyTool } = await import("./tools/pi-reply.js");

  const require = createRequire(import.meta.url);
  const { version } = require("../package.json");

  const config = loadConfig();

  // Initialize sandbox (exits process on failure if sandbox=true)
  const bashOps = await initSandbox(config);

  const store = new SessionStore(config.maxSessions, config.sessionIdleTimeout);

  const server = new McpServer(
    { name: "pi-mcp", version },
    { capabilities: { logging: {} } },
  );

  registerPiTool(server, config, store, bashOps);
  registerPiReplyTool(server, store);

  const transport = new StdioServerTransport();

  // Handle transport close (client disconnect)
  transport.onclose = () => shutdown();

  await server.connect(transport);

  console.error("pi-mcp-server started");

  // Shutdown sequence
  let shutdownStarted = false;
  async function shutdown() {
    if (shutdownStarted) return;
    shutdownStarted = true;

    console.error("pi-mcp-server shutting down...");

    try {
      await store.clear();
    } catch (err) {
      console.error("Shutdown: store.clear() failed:", err);
    }

    try {
      await resetSandbox();
    } catch (err) {
      console.error("Shutdown: resetSandbox() failed:", err);
    }

    try {
      await server.close();
    } catch (err) {
      console.error("Shutdown: server.close() failed:", err);
    }

    process.exit(0);
  }

  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("Fatal error starting pi-mcp-server:", err);
  process.exit(1);
});
