#!/usr/bin/env node
/**
 * Manual smoke test — spawns the server, connects as MCP client, runs a few calls.
 * Usage: node test/smoke.mjs
 * Set ANTHROPIC_API_KEY to also test a real pi call.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectDir = new URL("..", import.meta.url).pathname;
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env },
  stderr: "pipe",
  cwd: projectDir,
});

// Collect stderr for diagnostics
let stderrBuf = "";
transport.stderr?.on("data", (chunk) => {
  stderrBuf += chunk.toString();
});

const client = new Client({ name: "smoke-test", version: "0.1.0" });

try {
  console.log("--- Connecting to pi-mcp-server...");
  await client.connect(transport);
  console.log("--- Connected\n");

  // 1. List tools
  console.log("=== Test 1: listTools ===");
  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);
  console.log(`Count: ${tools.length}`);
  if (!tools.find((t) => t.name === "pi")) throw new Error("Missing pi tool");
  if (!tools.find((t) => t.name === "pi-reply")) throw new Error("Missing pi-reply tool");
  console.log("PASS\n");

  // 2. pi-reply with bogus thread ID
  console.log("=== Test 2: pi-reply with bad threadId ===");
  const badReply = await client.callTool({
    name: "pi-reply",
    arguments: { threadId: "nonexistent-id", prompt: "hello" },
  });
  console.log(`isError: ${badReply.isError}`);
  console.log(`text: ${badReply.content[0]?.text?.slice(0, 80)}`);
  if (!badReply.isError) throw new Error("Expected isError=true");
  if (!badReply.content[0]?.text?.includes("Session not found"))
    throw new Error("Expected 'Session not found' message");
  console.log("PASS\n");

  // 3. pi with invalid model (unknown model ID)
  console.log("=== Test 3: pi with bad model ===");
  const badModel = await client.callTool({
    name: "pi",
    arguments: { prompt: "hello", provider: "anthropic", model: "nonexistent-model-xyz" },
  });
  console.log(`isError: ${badModel.isError}`);
  console.log(`text: ${badModel.content[0]?.text?.slice(0, 120)}`);
  if (!badModel.isError) throw new Error("Expected isError=true");
  console.log("PASS\n");

  // 3b. pi with empty prompt
  console.log("=== Test 3b: pi with empty prompt ===");
  const emptyPrompt = await client.callTool({
    name: "pi",
    arguments: { prompt: "" },
  });
  console.log(`isError: ${emptyPrompt.isError}`);
  console.log(`text: ${emptyPrompt.content[0]?.text?.slice(0, 80)}`);
  if (!emptyPrompt.isError) throw new Error("Expected isError=true for empty prompt");
  console.log("PASS\n");

  // 3c. pi with invalid provider
  console.log("=== Test 3c: pi with bad provider ===");
  const badProvider = await client.callTool({
    name: "pi",
    arguments: { prompt: "hello", provider: "doesnotexist", model: "fake" },
  });
  console.log(`isError: ${badProvider.isError}`);
  console.log(`text: ${badProvider.content[0]?.text?.slice(0, 120)}`);
  if (!badProvider.isError) throw new Error("Expected isError=true");
  console.log("PASS\n");

  // 4. Real pi call (only if API key available)
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("=== Test 5: pi with real prompt ===");
    const real = await client.callTool({
      name: "pi",
      arguments: { prompt: "What is 2+2? Reply with just the number." },
    });
    console.log(`isError: ${real.isError ?? false}`);
    const text = real.content[0]?.text ?? "";
    console.log(`response (first 200 chars): ${text.slice(0, 200)}`);
    if (real.isError) throw new Error("Unexpected error: " + text);
    if (!text.includes("thread_id:")) throw new Error("Missing thread_id in response");

    // Extract thread_id for pi-reply test
    const match = text.match(/\[thread_id: ([^\]]+)\]/);
    if (!match) throw new Error("Could not extract thread_id");
    const threadId = match[1];
    console.log(`threadId: ${threadId}`);
    console.log("PASS\n");

    // 6. pi-reply with real thread
    console.log("=== Test 6: pi-reply with real threadId ===");
    const reply = await client.callTool({
      name: "pi-reply",
      arguments: { threadId, prompt: "Now multiply that by 3. Reply with just the number." },
    });
    console.log(`isError: ${reply.isError ?? false}`);
    const replyText = reply.content[0]?.text ?? "";
    console.log(`response (first 200 chars): ${replyText.slice(0, 200)}`);
    if (reply.isError) throw new Error("Unexpected error: " + replyText);
    console.log("PASS\n");
  } else {
    console.log("=== Tests 4-6: SKIPPED (no ANTHROPIC_API_KEY) ===\n");
  }

  console.log("--- All tests passed ---");
} catch (err) {
  console.error("\nFAILED:", err.message);
  if (stderrBuf) console.error("\nServer stderr:\n" + stderrBuf);
  process.exitCode = 1;
} finally {
  await client.close();
}
