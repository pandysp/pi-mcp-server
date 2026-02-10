/**
 * Forward Pi agent events as MCP logging messages.
 * Every sendLoggingMessage call is wrapped in try-catch to survive client disconnects.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

function safeSendLog(
  server: McpServer,
  level: "info" | "debug" | "warning" | "error",
  data: Record<string, unknown>,
): void {
  try {
    server.server.sendLoggingMessage({ level, data });
  } catch (err) {
    // Transport/connection errors (client disconnected) are expected — swallow.
    // Programming errors (serialization, SDK bugs) should be logged.
    if (err instanceof TypeError || err instanceof RangeError) {
      console.error("Event streamer serialization error:", err);
    }
  }
}

/**
 * Subscribe to Pi session events and forward them as MCP logging messages.
 * Must be called BEFORE session.prompt() to not miss events.
 * Returns an unsubscribe function.
 */
export function subscribeEvents(
  server: McpServer,
  session: AgentSession,
  threadId: string,
): () => void {
  const listener = (event: AgentSessionEvent) => {
    switch (event.type) {
      case "agent_start":
        safeSendLog(server, "info", {
          type: "agent_start",
          threadId,
        });
        break;

      case "agent_end":
        safeSendLog(server, "info", {
          type: "agent_end",
          threadId,
        });
        break;

      case "tool_execution_start":
        safeSendLog(server, "debug", {
          type: "tool_start",
          threadId,
          tool: event.toolName,
        });
        break;

      case "tool_execution_end":
        safeSendLog(server, "debug", {
          type: "tool_end",
          threadId,
          tool: event.toolName,
          isError: event.isError,
        });
        break;

      case "auto_compaction_start":
        safeSendLog(server, "info", {
          type: "auto_compaction",
          threadId,
          reason: event.reason,
        });
        break;

      case "auto_retry_start":
        safeSendLog(server, "warning", {
          type: "auto_retry",
          threadId,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          error: event.errorMessage,
        });
        break;
    }
  };

  return session.subscribe(listener);
}
