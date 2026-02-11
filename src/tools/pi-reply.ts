/**
 * "pi-reply" tool — continue an existing Pi coding agent session.
 */

import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionStore } from "../session-store.js";

export function registerPiReplyTool(
  server: McpServer,
  store: SessionStore,
): void {
  server.registerTool(
    "pi-reply",
    {
      description:
        "Continue an existing Pi coding agent session by thread_id.",
      inputSchema: {
        threadId: z
          .string()
          .describe("The thread_id returned by the pi tool"),
        prompt: z.string().describe("The follow-up message"),
      },
    },
    async (args) => {
      const entry = store.get(args.threadId);
      if (!entry) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Session not found: ${args.threadId}. It may have expired or been cleaned up. Start a new session with the "pi" tool.`,
            },
          ],
        };
      }

      // Per-session mutex: serialize prompts to prevent concurrent access.
      // The mutex is set up and the finally block guarantees release,
      // so no code path can deadlock the session.
      const previousMutex = entry.mutex;
      let releaseMutex!: () => void;
      entry.mutex = new Promise<void>((resolve) => {
        releaseMutex = resolve;
      });

      await previousMutex;

      try {
        // Re-check: session may have been evicted while we waited for mutex
        if (!store.has(args.threadId)) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Session not found: ${args.threadId}. It was evicted while waiting. Start a new session with the "pi" tool.`,
              },
            ],
          };
        }

        await entry.session.prompt(args.prompt);

        // Refresh timestamp so active sessions don't appear idle to the expiry sweep
        entry.lastAccessed = Date.now();

        const responseText = entry.session.getLastAssistantText();

        if (!responseText) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Agent completed but produced no text response.",
              },
            ],
          };
        }

        return { content: [{ type: "text" as const, text: responseText }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            { type: "text" as const, text: `Pi agent error: ${message}` },
          ],
        };
      } finally {
        releaseMutex();
      }
    },
  );
}
