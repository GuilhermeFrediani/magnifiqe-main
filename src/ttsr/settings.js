/**
 * Stack Perfeita MCP — TTSR Settings
 * Configuration schema for TTSR behavior.
 * Port of OMP's TtsrSettings pattern.
 */

/** @enum {string} */
export const ContextMode = {
  /** Inject into current context only */
  IMMEDIATE: "immediate",
  /** Queue for next turn */
  DEFERRED: "deferred",
};

/** @enum {string} */
export const InterruptMode = {
  /** Abort stream and inject immediately */
  ABORT: "abort",
  /** Append injection after current response completes */
  APPEND: "append",
};

/** @enum {string} */
export const RepeatMode = {
  /** Fire only once per session */
  ONCE: "once",
  /** Fire again after N completed turns */
  AFTER_GAP: "after-gap",
};

/** Default TTSR settings */
export const DEFAULT_SETTINGS = {
  enabled: true,
  contextMode: ContextMode.IMMEDIATE,
  interruptMode: InterruptMode.ABORT,
  repeatMode: RepeatMode.ONCE,
  repeatGap: 3,
  builtinRules: true,
  disabledRules: [],
};

/**
 * HALT patterns that should be registered as TTSR rules.
 * These are loaded from config.js BAD_PATTERNS and converted to TTSR format.
 */
export const HALT_TTSR_RULES = [
  {
    name: "eval-usage",
    condition: "\\beval\\s*\\(",
    content: "NEVER use eval(). Use Function constructor or refactoring instead.",
    interrupting: true,
    repeatMode: "once",
  },
  {
    name: "any-type",
    condition: ":\\s*any\\b(?!\\s*\\))",
    content: "Avoid 'any' type. Use specific types or 'unknown' with type guards.",
    interrupting: false,
    repeatMode: "after-gap",
    repeatGap: 5,
  },
  {
    name: "return-type-generic",
    condition: "ReturnType\\s*<",
    content: "Do not use ReturnType<>. Use the actual type name directly.",
    interrupting: false,
    repeatMode: "once",
  },
  {
    name: "console-log",
    condition: "console\\.log\\(",
    content: "Do not use console.log. Use structured logging or process.stderr.",
    interrupting: false,
    repeatMode: "once",
  },
  {
    name: "empty-catch",
    condition: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}",
    content: "Empty catch block detected. Handle the error or log it.",
    interrupting: true,
    repeatMode: "once",
  },
];
