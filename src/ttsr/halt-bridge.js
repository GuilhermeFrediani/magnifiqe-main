/**
 * Stack Perfeita MCP — TTSR-HALT Integration Bridge
 * Connects TTSR engine with existing HALT patterns from config.js BAD_PATTERNS.
 * Converts BAD_PATTERNS regex entries into TTSR rules for lazy-loaded monitoring.
 */

import { TtsrEngine, buildInjectionPayload } from "./ttsr-engine.js";
import { HALT_TTSR_RULES } from "./settings.js";
import { BAD_PATTERNS } from "../config.js";

/**
 * Create a TTSR engine pre-loaded with HALT patterns from config.
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true]
 * @param {boolean} [opts.includeHaltPatterns=true] - Include BAD_PATTERNS as TTSR rules
 * @returns {TtsrEngine}
 */
export function createHaltTtsrEngine(opts = {}) {
  const { enabled = true, includeHaltPatterns = true } = opts;
  const engine = new TtsrEngine({ enabled });

  // Load built-in HALT TTSR rules
  for (const rule of HALT_TTSR_RULES) {
    engine.addRule(rule);
  }

  // Convert BAD_PATTERNS from config to TTSR rules
  if (includeHaltPatterns) {
    for (const pattern of BAD_PATTERNS) {
      if (pattern.regex && pattern.severity === "blocker") {
        engine.addRule({
          name: `halt-${pattern.label || "unknown"}`,
          content: `HALT: ${pattern.message || "Bad pattern detected"}`,
          condition: pattern.regex,
          interrupting: true,
          repeatMode: "once",
        });
      }
    }
  }

  return engine;
}

/**
 * Process a TTSR trigger and format the appropriate response.
 * @param {import("./ttsr-engine.js").TtsrTrigger} trigger
 * @returns {{ haltResponse: string, injected: boolean }}
 */
export function processHaltTrigger(trigger) {
  if (!trigger) return { haltResponse: "", injected: false };

  const payload = trigger.source === "tool"
    ? buildInjectionPayload(trigger, "reminder")
    : buildInjectionPayload(trigger, "interrupt");

  return {
    haltResponse: `HALT — TTSR rule "${trigger.ruleName}" triggered.\n\n${payload}`,
    injected: true,
  };
}

/**
 * Middleware: wrap a tool handler with TTSR monitoring.
 * @param {TtsrEngine} engine
 * @param {string} toolName
 * @param {Function} handler
 * @returns {Function} Wrapped handler
 */
export function withTtsrMonitoring(engine, toolName, handler) {
  return async (params) => {
    const result = await handler(params);

    // Check tool result content against TTSR rules
    if (result?.content?.[0]?.text && engine.hasRules()) {
      const text = result.content[0].text;
      const trigger = engine.checkDelta(text, { source: "tool", toolName });

      if (trigger) {
        const { haltResponse, injected } = processHaltTrigger(trigger);
        if (injected) {
          engine.markTriggered(trigger.ruleName);
          return { content: [{ type: "text", text: haltResponse }] };
        }
      }
    }

    return result;
  };
}
