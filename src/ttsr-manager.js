/**
 * Stack Perfeita MCP — TTSR Manager
 * Bridges the TTSR engine into the MCP server as managed tools.
 * Exposes ttsr_check_output and ttsr_stats for runtime rule monitoring.
 */

import { z } from "zod";
import { createHaltTtsrEngine, processHaltTrigger } from "./ttsr/halt-bridge.js";
import { DEFAULT_SETTINGS } from "./ttsr/settings.js";
import { rateLimiter } from "./rate-limiter.js";

/**
 * Singleton TTSR manager wrapping the halt-bridge engine.
 */
class TtsrManager {
  /** @type {import("./ttsr/ttsr-engine.js").TtsrEngine} */
  #engine;

  constructor() {
    this.#engine = createHaltTtsrEngine({ enabled: DEFAULT_SETTINGS.enabled });
  }

  /**
   * Check a text delta against all registered TTSR rules.
   * @param {string} text - Text to scan
   * @param {string} [toolName] - Tool that produced the output
   * @returns {import("./ttsr/ttsr-engine.js").TtsrTrigger|null}
   */
  checkOutput(text, toolName) {
    if (!this.#engine.hasRules()) return null;

    const trigger = this.#engine.checkDelta(text, {
      source: toolName ? "tool" : "text",
      toolName,
    });

    if (trigger) {
      this.#engine.markTriggered(trigger.ruleName);
    }

    return trigger;
  }

  /**
   * Return engine statistics.
   * @returns {{ ruleCount: number, triggerCount: number, triggeredRules: string[] }}
   */
  getStats() {
    const triggeredRules = this.#engine.getInjectedRules();
    return {
      ruleCount: this.#engine.ruleCount,
      triggerCount: triggeredRules.length,
      triggeredRules,
    };
  }

  /** @returns {import("./ttsr/ttsr-engine.js").TtsrEngine} */
  get engine() {
    return this.#engine;
  }
}

/** Singleton instance */
export const ttsrManager = new TtsrManager();

/**
 * Register TTSR tools on the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerTtsrTools(server) {
  server.tool(
    "ttsr_check_output",
    "Checks tool output text against registered TTSR (Time-Traveling Streamed Rules) patterns. Returns the first matching trigger with its rule name and corrective content, or confirms no rules fired. Use after tool execution to validate output against project-specific guardrails.",
    {
      text: z.string().describe("The output text to check against TTSR rules."),
      tool_name: z.string().optional().describe("Name of the tool that produced this output."),
    },
    async ({ text, tool_name }) => {
      const rateLimitHit = rateLimiter.check("ttsr_check_output");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const trigger = ttsrManager.checkOutput(text, tool_name);

      if (trigger) {
        const { haltResponse } = processHaltTrigger(trigger);
        return { content: [{ type: "text", text: haltResponse }] };
      }

      return {
        content: [{ type: "text", text: "No rules triggered." }],
      };
    }
  );

  server.tool(
    "ttsr_stats",
    "Returns current TTSR engine statistics: number of registered rules, how many have fired this session, and which rules were triggered. No parameters required.",
    {},
    async () => {
      const rateLimitHit = rateLimiter.check("ttsr_stats");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const stats = ttsrManager.getStats();
      return {
        content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      };
    }
  );
}

export { TtsrManager };
