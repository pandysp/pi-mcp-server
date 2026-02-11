import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionStore } from "../src/session-store.js";
import type { AgentSession } from "@mariozechner/pi-coding-agent";

function mockEntry(overrides?: Partial<{ isStreaming: boolean }>) {
  const unsubscribe = vi.fn();
  const abort = vi.fn().mockResolvedValue(undefined);
  const dispose = vi.fn();
  const session = {
    isStreaming: overrides?.isStreaming ?? false,
    abort,
    dispose,
    getLastAssistantText: vi.fn(),
  } as unknown as AgentSession;

  return {
    session,
    unsubscribe,
    lastAccessed: Date.now(),
    mutex: Promise.resolve(),
  };
}

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(5, 0); // No idle timeout for most tests
  });

  afterEach(async () => {
    await store.clear();
  });

  it("stores and retrieves sessions", () => {
    const entry = mockEntry();
    store.set("a", entry);
    expect(store.has("a")).toBe(true);
    expect(store.get("a")).toBe(entry);
    expect(store.size).toBe(1);
  });

  it("returns undefined for missing session", () => {
    expect(store.get("missing")).toBeUndefined();
    expect(store.has("missing")).toBe(false);
  });

  it("updates lastAccessed on get", () => {
    const entry = mockEntry();
    entry.lastAccessed = 1000;
    store.set("a", entry);

    const before = Date.now();
    store.get("a");
    expect(entry.lastAccessed).toBeGreaterThanOrEqual(before);
  });

  it("deletes a session and calls cleanup", () => {
    const entry = mockEntry();
    store.set("a", entry);
    store.delete("a");

    expect(store.has("a")).toBe(false);
    expect(entry.unsubscribe).toHaveBeenCalled();
    expect((entry.session as any).abort).toHaveBeenCalled();
    expect((entry.session as any).dispose).toHaveBeenCalled();
  });

  it("delete is a no-op for missing session", () => {
    store.delete("missing"); // Should not throw
  });

  it("evicts oldest idle session when at capacity", () => {
    for (let i = 0; i < 5; i++) {
      const e = mockEntry();
      e.lastAccessed = 1000 + i;
      store.set(`s${i}`, e);
    }
    expect(store.size).toBe(5);

    // Adding a 6th should evict s0 (oldest)
    store.set("s5", mockEntry());
    expect(store.size).toBe(5);
    expect(store.has("s0")).toBe(false);
    expect(store.has("s5")).toBe(true);
  });

  it("throws when all sessions are active and at capacity", () => {
    for (let i = 0; i < 5; i++) {
      store.set(`s${i}`, mockEntry({ isStreaming: true }));
    }

    expect(() => store.set("overflow", mockEntry())).toThrow(
      "Maximum sessions (5) reached",
    );
  });

  it("clear disposes all sessions", async () => {
    const entries = Array.from({ length: 3 }, () => mockEntry());
    entries.forEach((e, i) => store.set(`s${i}`, e));

    await store.clear();
    expect(store.size).toBe(0);

    for (const e of entries) {
      expect(e.unsubscribe).toHaveBeenCalled();
    }
  });

  it("does not evict when updating existing key", () => {
    for (let i = 0; i < 5; i++) {
      store.set(`s${i}`, mockEntry());
    }

    // Re-setting an existing key should not evict
    store.set("s0", mockEntry());
    expect(store.size).toBe(5);
  });

  it("continues cleanup when unsubscribe throws", () => {
    const entry = mockEntry();
    entry.unsubscribe = vi.fn(() => {
      throw new Error("unsubscribe failed");
    });
    store.set("a", entry);

    // Should not throw, and abort/dispose should still be called
    store.delete("a");
    expect(store.has("a")).toBe(false);
    expect(entry.unsubscribe).toHaveBeenCalled();
    expect((entry.session as any).abort).toHaveBeenCalled();
    expect((entry.session as any).dispose).toHaveBeenCalled();
  });
});

describe("SessionStore idle expiry", () => {
  it("expires idle sessions", async () => {
    vi.useFakeTimers();
    const store = new SessionStore(10, 1); // 1 second timeout

    const entry = mockEntry();
    entry.lastAccessed = Date.now() - 2000; // Already expired
    store.set("old", entry);

    // Advance timer to trigger expiry check (runs every 60s)
    vi.advanceTimersByTime(61_000);

    expect(store.has("old")).toBe(false);
    expect(entry.unsubscribe).toHaveBeenCalled();

    await store.clear();
    vi.useRealTimers();
  });
});
