/**
 * Stack Perfeita MCP — Structured Logger
 * Replaces ad-hoc stderr writes with structured logging.
 * All output goes to stderr (stdout reserved for JSON-RPC).
 */

/** @enum {string} */
export const LogLevel = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
};

const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };

class MagnifiqeLogger {
  #minLevel = LogLevel.INFO;
  #prefix = "[magnifiqe]";

  /**
   * @param {object} [opts]
   * @param {string} [opts.level="info"]
   * @param {string} [opts.prefix="[magnifiqe]"]
   */
  constructor({ level = "info", prefix = "[magnifiqe]" } = {}) {
    this.#minLevel = level;
    this.#prefix = prefix;
  }

  /**
   * Log at INFO level.
   * @param {string} event - Event name
   * @param {object} [data] - Structured data
   */
  info(event, data) { this.#emit(LogLevel.INFO, event, data); }

  /**
   * Log at WARN level.
   * @param {string} event
   * @param {object} [data]
   */
  warn(event, data) { this.#emit(LogLevel.WARN, event, data); }

  /**
   * Log at ERROR level.
   * @param {string} event
   * @param {object} [data]
   * @param {Error} [error]
   */
  error(event, data, error) {
    const payload = { ...data };
    if (error) payload.error = { message: error.message, stack: error.stack };
    this.#emit(LogLevel.ERROR, event, payload);
  }

  /**
   * Log at DEBUG level.
   * @param {string} event
   * @param {object} [data]
   */
  debug(event, data) { this.#emit(LogLevel.DEBUG, event, data); }

  #emit(level, event, data) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.#minLevel]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      ...data,
    };
    process.stderr.write(`${this.#prefix} ${JSON.stringify(entry)}\n`);
  }
}

/** Singleton logger instance */
export const logger = new MagnifiqeLogger();
