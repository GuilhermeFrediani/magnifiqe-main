/**
 * Stack Perfeita MCP — Tool Result Interceptor Protocol
 * Defines the interface for compressing specific tool outputs before general compression.
 * Port of Headroom's ToolResultInterceptor pattern.
 */

/**
 * @typedef {object} ToolResultInterceptor
 * @property {string} name - Unique identifier
 * @property {(toolName: string, toolInput: object, content: string) => boolean} matches
 * @property {(toolName: string, toolInput: object, content: string) => string} transform
 */

/**
 * Registry of tool result interceptors.
 */
class InterceptorRegistry {
  /** @type {ToolResultInterceptor[]} */
  #interceptors = [];

  /**
   * Register an interceptor.
   * @param {ToolResultInterceptor} interceptor
   */
  register(interceptor) {
    if (interceptor?.name && typeof interceptor.matches === "function" && typeof interceptor.transform === "function") {
      this.#interceptors.push(interceptor);
    }
  }

  /**
   * Find the first matching interceptor for a tool result.
   * @param {string} toolName
   * @param {object} toolInput
   * @param {string} content
   * @returns {{ interceptor: ToolResultInterceptor, transformed: string } | null}
   */
  process(toolName, toolInput, content) {
    for (const interceptor of this.#interceptors) {
      if (interceptor.matches(toolName, toolInput, content)) {
        return {
          interceptor,
          transformed: interceptor.transform(toolName, toolInput, content),
        };
      }
    }
    return null;
  }

  /** @returns {string[]} List of registered interceptor names */
  get names() { return this.#interceptors.map(i => i.name); }

  /** @returns {number} */
  get count() { return this.#interceptors.length; }
}

/** Singleton registry */
export const interceptorRegistry = new InterceptorRegistry();

// ─── Built-in Interceptors ─────────────────────────────────────────────────

/**
 * Code outline interceptor — compresses full file reads to signatures only.
 */
export const codeOutlineInterceptor = {
  name: "code-outline",
  matches(toolName, _input, content) {
    return toolName === "smart_read" && content && content.split("\n").length > 50;
  },
  transform(_toolName, _input, content) {
    const lines = content.split("\n");
    const signatures = lines.filter(l =>
      /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var|interface|type|def|pub\s+fn|pub\s+struct)\s+\w+/.test(l) ||
      l.trim() === "}" || l.trim() === "});"
    );
    if (signatures.length === 0) return content.slice(0, 2000);
    return `[Outline: ${lines.length} → ${signatures.length} lines]\n${signatures.join("\n")}`;
  },
};

/**
 * Log filter interceptor — extracts errors from test/build output.
 */
export const logFilterInterceptor = {
  name: "log-filter",
  matches(toolName, _input, content) {
    return (toolName === "run_test_and_report" || toolName === "execute_bash") &&
      content && content.length > 5000;
  },
  transform(_toolName, _input, content) {
    const lines = content.split("\n");
    const errors = lines.filter(l =>
      /\b(ERROR|FAIL|WARN|Exception|Traceback|HALT)\b/i.test(l)
    );
    const tail = lines.slice(-10);
    const kept = [...new Set([...errors, ...tail])];
    return `[Filtered: ${lines.length} → ${kept.length} lines]\n${kept.join("\n")}`;
  },
};

// Auto-register built-in interceptors
interceptorRegistry.register(codeOutlineInterceptor);
interceptorRegistry.register(logFilterInterceptor);
