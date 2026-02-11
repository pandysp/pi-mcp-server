/**
 * "pi" tool — start a new Pi coding agent session.
 */

import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createAgentSession,
  SessionManager,
  createBashTool,
  createReadTool,
  createEditTool,
  createWriteTool,
  createGrepTool,
  createFindTool,
  createLsTool,
  readTool,
  bashTool,
  editTool,
  writeTool,
  grepTool,
  findTool,
  lsTool,
} from "@mariozechner/pi-coding-agent";
import type { BashOperations } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import crypto from "node:crypto";
import type { Config } from "../config.js";
import type { SessionStore } from "../session-store.js";
import { subscribeEvents } from "../event-streamer.js";

// Map tool name → { default instance, custom-cwd creator }
// Only bash needs BashOperations; others just need cwd.
const TOOL_MAP: Record<string, { default: unknown; create: (cwd: string) => unknown }> = {
  read: { default: readTool, create: (cwd) => createReadTool(cwd) },
  edit: { default: editTool, create: (cwd) => createEditTool(cwd) },
  write: { default: writeTool, create: (cwd) => createWriteTool(cwd) },
  grep: { default: grepTool, create: (cwd) => createGrepTool(cwd) },
  find: { default: findTool, create: (cwd) => createFindTool(cwd) },
  ls: { default: lsTool, create: (cwd) => createLsTool(cwd) },
};

function buildTools(
  toolNames: string[],
  cwd: string,
  bashOps: BashOperations | undefined,
) {
  const needsCustomCwd = cwd !== process.cwd();
  const result: unknown[] = [];

  for (const name of toolNames) {
    if (name === "bash") {
      if (bashOps) {
        result.push(createBashTool(cwd, { operations: bashOps }));
      } else if (needsCustomCwd) {
        result.push(createBashTool(cwd));
      } else {
        result.push(bashTool);
      }
      continue;
    }

    const entry = TOOL_MAP[name];
    if (!entry) {
      console.error(`buildTools: tool "${name}" is valid but has no TOOL_MAP entry — skipping`);
      continue;
    }

    result.push(needsCustomCwd ? entry.create(cwd) : entry.default);
  }

  return result as any[];
}

type ModelResult =
  | { model: ReturnType<typeof getModel>; error?: undefined }
  | { model?: undefined; error: string };

function resolveModel(provider: string, modelId: string): ModelResult {
  try {
    const model = getModel(provider as any, modelId as any);
    if (!model) {
      return { error: `Model not found: ${provider}/${modelId}. Check provider and model ID.` };
    }
    return { model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to resolve model ${provider}/${modelId}: ${message}` };
  }
}

function disposeSession(
  session: { abort(): Promise<void>; dispose(): void },
  unsubscribe: () => void,
): void {
  try { unsubscribe(); } catch (err) {
    console.error("disposeSession: unsubscribe failed:", err);
  }
  try {
    session.abort().catch((err) => console.error("disposeSession: abort failed:", err));
  } catch (err) {
    console.error("disposeSession: abort threw synchronously:", err);
  }
  try { session.dispose(); } catch (err) {
    console.error("disposeSession: dispose failed:", err);
  }
}

export function registerPiTool(
  server: McpServer,
  config: Config,
  store: SessionStore,
  bashOps: BashOperations | undefined,
): void {
  server.registerTool(
    "pi",
    {
      description:
        "Start a new Pi coding agent session. Returns a thread_id for follow-up with pi-reply.",
      inputSchema: {
        prompt: z.string().describe("The task or question for the coding agent"),
        provider: z
          .string()
          .optional()
          .describe("LLM provider override (e.g., anthropic, openai, google)"),
        model: z
          .string()
          .optional()
          .describe("Model ID override (e.g., claude-sonnet-4-20250514)"),
        thinkingLevel: z
          .enum(["off", "minimal", "low", "medium", "high", "xhigh"])
          .optional()
          .describe("Thinking/reasoning level"),
        cwd: z.string().optional().describe("Working directory override"),
      },
    },
    async (args) => {
      try {
        const provider = args.provider ?? config.provider;
        const modelId = args.model ?? config.model;
        const thinkingLevel = args.thinkingLevel ?? config.thinkingLevel;
        const cwd = args.cwd ?? config.cwd;

        if (args.cwd) {
          const { existsSync, statSync } = await import("node:fs");
          if (!existsSync(args.cwd) || !statSync(args.cwd).isDirectory()) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `Invalid cwd: "${args.cwd}" does not exist or is not a directory.`,
                },
              ],
            };
          }
        }

        const result = resolveModel(provider, modelId);
        if (result.error) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: result.error }],
          };
        }

        const tools = buildTools(config.tools, cwd, bashOps);

        const { session, modelFallbackMessage } = await createAgentSession({
          model: result.model,
          thinkingLevel,
          tools,
          cwd,
          sessionManager: SessionManager.inMemory(),
        });

        const threadId = crypto.randomUUID();

        // Subscribe BEFORE prompting — cleanup on any failure below
        const unsubscribe = subscribeEvents(server, session, threadId);

        let responseText: string | undefined;
        try {
          await session.prompt(args.prompt);
          responseText = session.getLastAssistantText();
        } catch (err) {
          // Clean up session on prompt failure to prevent resource leak
          disposeSession(session, unsubscribe);
          throw err;
        }

        // Try to store session; if at capacity, still return the response
        try {
          store.set(threadId, {
            session,
            unsubscribe,
            lastAccessed: Date.now(),
            mutex: Promise.resolve(),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("Maximum sessions")) {
            throw err;
          }
          // Capacity reached — dispose session but don't lose the response
          disposeSession(session, unsubscribe);
          if (responseText) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `[warning: session not stored — max sessions reached, no follow-up possible]\n\n${responseText}`,
                },
              ],
            };
          }
        }

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

        let text = `[thread_id: ${threadId}]\n\n${responseText}`;
        if (modelFallbackMessage) {
          text = `[warning: ${modelFallbackMessage}]\n${text}`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            { type: "text" as const, text: `Pi agent error: ${message}` },
          ],
        };
      }
    },
  );
}
