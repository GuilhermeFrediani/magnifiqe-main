/**
 * Stack Perfeita MCP — Rate Limiter
 * Prevents tool call loops by enforcing a max-calls-per-window policy.
 * Includes a global rate limit across all tools.
 */

const rateLimiter = {
  counters: {},
  globalCounter: { start: 0, count: 0 },
  windowMs: 60000,
  maxCalls: 20,
  globalMaxCalls: 100,

  check(toolName) {
    const now = Date.now();

    // Global rate limit check
    if (now - this.globalCounter.start > this.windowMs) {
      this.globalCounter = { start: now, count: 1 };
    } else {
      this.globalCounter.count += 1;
      if (this.globalCounter.count > this.globalMaxCalls) {
        return `HALT: global rate limit — ${this.globalCounter.count} calls across all tools in 60s. Possible loop.`;
      }
    }

    // Per-tool rate limit check
    if (!this.counters[toolName] || now - this.counters[toolName].start > this.windowMs) {
      this.counters[toolName] = { start: now, count: 1 };
      return null;
    }
    this.counters[toolName].count += 1;
    if (this.counters[toolName].count > this.maxCalls) {
      return `HALT: rate limit — tool "${toolName}" called ${this.counters[toolName].count}x in 60s. Possible loop.`;
    }
    return null;
  },
};

export { rateLimiter };

/**
 * Higher-order function that wraps a tool handler with rate limiting.
 * @param {string} toolName - Name of the tool for rate limit tracking
 * @param {Function} handler - The original tool handler
 * @returns {Function} Wrapped handler with rate limit check
 */
export function withRateLimit(toolName, handler) {
  return async (...args) => {
    const rateLimitHit = rateLimiter.check(toolName);
    if (rateLimitHit) {
      return { content: [{ type: "text", text: rateLimitHit }] };
    }
    try {
      return await handler(...args);
    } catch (e) {
      return { content: [{ type: "text", text: `HALT — ${toolName} failed: ${e.message}` }] };
    }
  };
}
