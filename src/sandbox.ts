/**
 * Optional sandbox adapter using @anthropic-ai/sandbox-runtime.
 * Fail-hard: if sandbox is requested but unavailable, exit process.
 */

import type { BashOperations } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import type { Config } from "./config.js";

const MAX_STDERR_BYTES = 64 * 1024; // 64KB cap for sandbox annotation

interface SandboxManagerModule {
  SandboxManager: {
    checkDependencies(): Promise<void>;
    initialize(config?: {
      allowedDomains?: string[];
      denyRead?: string[];
      allowWrite?: string[];
      denyWrite?: string[];
    }): Promise<void>;
    wrapWithSandbox(command: string): Promise<string>;
    annotateStderrWithSandboxFailures(
      command: string,
      stderr: string,
    ): string;
    reset(): Promise<void>;
  };
}

let sandboxModule: SandboxManagerModule | undefined;

export async function initSandbox(
  config: Config,
): Promise<BashOperations | undefined> {
  if (!config.sandbox) {
    return undefined;
  }

  try {
    sandboxModule = (await import(
      // @ts-ignore — optional dependency, types may not be installed
      "@anthropic-ai/sandbox-runtime"
    )) as unknown as SandboxManagerModule;
  } catch (err) {
    console.error(
      "PI_MCP_SANDBOX=true but @anthropic-ai/sandbox-runtime could not be loaded:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  const { SandboxManager } = sandboxModule;

  try {
    await SandboxManager.checkDependencies();
  } catch (err) {
    console.error(
      "Sandbox dependency check failed:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  try {
    // Empty array → undefined: sandbox treats [] as "allow none", undefined as "no restriction"
    await SandboxManager.initialize({
      allowedDomains:
        config.sandboxAllowedDomains.length > 0
          ? config.sandboxAllowedDomains
          : undefined,
      denyRead:
        config.sandboxDenyRead.length > 0 ? config.sandboxDenyRead : undefined,
      allowWrite:
        config.sandboxAllowWrite.length > 0
          ? config.sandboxAllowWrite
          : undefined,
      denyWrite:
        config.sandboxDenyWrite.length > 0
          ? config.sandboxDenyWrite
          : undefined,
    });
  } catch (err) {
    console.error(
      "Sandbox initialization failed:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  return createSandboxedBashOps(SandboxManager);
}

export async function resetSandbox(): Promise<void> {
  if (sandboxModule) {
    try {
      await sandboxModule.SandboxManager.reset();
    } catch (err) {
      console.error("Sandbox reset failed:", err);
    }
  }
}

function createSandboxedBashOps(
  SandboxManager: SandboxManagerModule["SandboxManager"],
): BashOperations {
  return {
    async exec(
      command: string,
      cwd: string,
      options: {
        onData: (data: Buffer) => void;
        signal?: AbortSignal;
        timeout?: number;
        env?: NodeJS.ProcessEnv;
      },
    ): Promise<{ exitCode: number | null }> {
      let wrapped: string;
      try {
        wrapped = await SandboxManager.wrapWithSandbox(command);
      } catch (err) {
        const msg = `Sandbox wrapWithSandbox failed: ${err instanceof Error ? err.message : String(err)}`;
        options.onData(Buffer.from(msg + "\n"));
        return { exitCode: 1 };
      }

      // spawn with shell: true is intentional — the sandbox wrapper (bwrap)
      // produces a compound shell command that must be interpreted by a shell.
      // The sandbox itself is the security boundary.
      const child = spawn(wrapped, {
        shell: true,
        cwd,
        env: { ...process.env, ...options.env },
        signal: options.signal,
      });

      let stderr = "";
      let stderrBytes = 0;

      child.stdout?.on("data", (chunk: Buffer) => options.onData(chunk));
      child.stderr?.on("data", (chunk: Buffer) => {
        // Cap stderr accumulation to prevent OOM from verbose commands
        if (stderrBytes < MAX_STDERR_BYTES) {
          const remaining = MAX_STDERR_BYTES - stderrBytes;
          stderr += chunk.toString("utf-8", 0, Math.min(chunk.length, remaining));
          stderrBytes += chunk.length;
        }
        options.onData(chunk);
      });

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let killHandle: ReturnType<typeof setTimeout> | undefined;
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          child.kill("SIGTERM");
          // Escalate to SIGKILL after 5s grace period
          killHandle = setTimeout(() => {
            child.kill("SIGKILL");
          }, 5_000);
        }, options.timeout);
      }

      return new Promise((resolve) => {
        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (killHandle) clearTimeout(killHandle);

          if (stderr) {
            try {
              const annotated = SandboxManager.annotateStderrWithSandboxFailures(
                command,
                stderr,
              );
              if (annotated !== stderr) {
                options.onData(Buffer.from(annotated));
              }
            } catch (err) {
              console.error("Sandbox stderr annotation failed:", err);
            }
          }

          resolve({ exitCode: code });
        });

        child.on("error", (err: Error) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (killHandle) clearTimeout(killHandle);
          const msg = `Sandbox spawn failed: ${err.message}`;
          console.error(msg);
          options.onData(Buffer.from(msg + "\n"));
          resolve({ exitCode: 1 });
        });
      });
    },
  };
}
