# src/rate-limiter.js

- kind: js
- lines: 41
- bytes: 1224

## Summary
Stack Perfeita MCP — Rate Limiter Prevents tool call loops by enforcing a max-calls-per-window policy. Includes a global rate limit across all tools.

## Imports
- none

## Exports
- `rateLimiter`

## Source
```js
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

```
