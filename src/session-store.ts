/**
 * Session store with idle expiry and max session limits.
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";

export interface SessionEntry {
  session: AgentSession;
  unsubscribe: () => void;
  lastAccessed: number;
  mutex: Promise<void>;
}

export class SessionStore {
  private _sessions = new Map<string, SessionEntry>();
  private _maxSessions: number;
  private _idleTimeoutMs: number;
  private _expiryTimer: ReturnType<typeof setInterval> | undefined;

  constructor(maxSessions: number, idleTimeoutSeconds: number) {
    this._maxSessions = maxSessions;
    this._idleTimeoutMs = idleTimeoutSeconds * 1000;

    if (this._idleTimeoutMs > 0) {
      this._expiryTimer = setInterval(() => this._expireIdle(), 60_000);
      this._expiryTimer.unref();
    }
  }

  has(threadId: string): boolean {
    return this._sessions.has(threadId);
  }

  get(threadId: string): SessionEntry | undefined {
    const entry = this._sessions.get(threadId);
    if (entry) {
      entry.lastAccessed = Date.now();
    }
    return entry;
  }

  /**
   * Store a session. Evicts oldest idle session if at capacity.
   * Throws if all sessions are active and at capacity.
   */
  set(threadId: string, entry: SessionEntry): void {
    if (this._sessions.size >= this._maxSessions && !this._sessions.has(threadId)) {
      // Try to evict oldest idle session
      let oldestId: string | undefined;
      let oldestTime = Infinity;

      for (const [id, e] of this._sessions) {
        if (!e.session.isStreaming && e.lastAccessed < oldestTime) {
          oldestTime = e.lastAccessed;
          oldestId = id;
        }
      }

      if (!oldestId) {
        throw new Error(
          `Maximum sessions (${this._maxSessions}) reached and all are active. Try again later.`,
        );
      }

      this._disposeEntry(oldestId);
    }

    this._sessions.set(threadId, entry);
  }

  delete(threadId: string): void {
    this._disposeEntry(threadId);
  }

  async clear(): Promise<void> {
    // Stop expiry timer first to prevent concurrent disposal
    if (this._expiryTimer) {
      clearInterval(this._expiryTimer);
      this._expiryTimer = undefined;
    }

    const ids = [...this._sessions.keys()];
    for (const id of ids) {
      this._disposeEntry(id);
    }
  }

  get size(): number {
    return this._sessions.size;
  }

  private _disposeEntry(threadId: string): void {
    const entry = this._sessions.get(threadId);
    if (!entry) return;

    this._sessions.delete(threadId);

    try {
      entry.unsubscribe();
    } catch (err) {
      console.error(`Session ${threadId}: unsubscribe failed:`, err);
    }

    try {
      entry.session.abort().catch((err) =>
        console.error(`Session ${threadId}: abort failed:`, err),
      );
    } catch (err) {
      console.error(`Session ${threadId}: abort threw synchronously:`, err);
    }

    try {
      entry.session.dispose();
    } catch (err) {
      console.error(`Session ${threadId}: dispose failed:`, err);
    }
  }

  private _expireIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this._sessions) {
      if (now - entry.lastAccessed > this._idleTimeoutMs) {
        try {
          this._disposeEntry(id);
        } catch (err) {
          console.error(`Session ${id}: expiry disposal failed:`, err);
        }
      }
    }
  }
}
