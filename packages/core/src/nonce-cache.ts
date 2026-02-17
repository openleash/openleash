/**
 * In-memory TTL nonce cache for replay protection.
 */
export class NonceCache {
  private cache = new Map<string, number>(); // nonce -> expiry timestamp
  private ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ttlSeconds: number = 600) {
    this.ttlMs = ttlSeconds * 1000;
    // Periodic cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    // Allow Node to exit even if interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if nonce has been seen. Returns true if nonce is fresh (not seen before).
   * Returns false if nonce is a replay.
   */
  check(agentId: string, nonce: string): boolean {
    const key = `${agentId}:${nonce}`;
    const now = Date.now();

    // Check if nonce exists and hasn't expired
    const expiry = this.cache.get(key);
    if (expiry !== undefined && expiry > now) {
      return false; // replay
    }

    // Store nonce
    this.cache.set(key, now + this.ttlMs);
    return true; // fresh
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, expiry] of this.cache) {
      if (expiry <= now) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}
