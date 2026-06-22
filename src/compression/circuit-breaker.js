/**
 * Stack Perfeita MCP — Circuit Breaker
 * After N consecutive pipeline failures, pass through without compression.
 * Port of Headroom's pipeline.py circuit breaker pattern.
 */

/** @enum {string} */
export const CircuitState = {
  CLOSED: "closed",     // Normal operation — compress as usual
  OPEN: "open",         // Failures exceeded threshold — pass through
  HALF_OPEN: "half_open", // Cooldown elapsed — try one request
};

/**
 * Circuit breaker for compression pipeline.
 */
export class CircuitBreaker {
  #state = CircuitState.CLOSED;
  #failureCount = 0;
  #lastFailureTime = 0;
  #threshold;
  #cooldownMs;

  /**
   * @param {number} [threshold=3] - Consecutive failures before opening
   * @param {number} [cooldownMs=60000] - Ms to wait before half-open
   */
  constructor(threshold = 3, cooldownMs = 60000) {
    this.#threshold = threshold;
    this.#cooldownMs = cooldownMs;
  }

  /** @returns {string} CircuitState */
  get state() {
    if (this.#state === CircuitState.OPEN) {
      if (Date.now() - this.#lastFailureTime > this.#cooldownMs) {
        this.#state = CircuitState.HALF_OPEN;
      }
    }
    return this.#state;
  }

  /**
   * Should we skip compression?
   * @returns {boolean} true = pass through (circuit open)
   */
  shouldSkip() {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Record a successful compression.
   */
  recordSuccess() {
    this.#failureCount = 0;
    this.#state = CircuitState.CLOSED;
  }

  /**
   * Record a failed compression.
   */
  recordFailure() {
    this.#failureCount++;
    this.#lastFailureTime = Date.now();
    if (this.#failureCount >= this.#threshold) {
      this.#state = CircuitState.OPEN;
    }
  }

  /** Reset to closed state */
  reset() {
    this.#state = CircuitState.CLOSED;
    this.#failureCount = 0;
    this.#lastFailureTime = 0;
  }

  /** @returns {object} Status for observability */
  status() {
    return {
      state: this.state,
      failureCount: this.#failureCount,
      threshold: this.#threshold,
      cooldownMs: this.#cooldownMs,
      lastFailureTime: this.#lastFailureTime,
    };
  }
}

/** Singleton circuit breaker */
export const circuitBreaker = new CircuitBreaker();
