/**
 * Stack Perfeita MCP — TTSR Engine (Time-Traveling Streamed Rules)
 * Monitors LLM output against registered regex/AST conditions.
 * When a rule fires: abort → inject corrective reminder → retry.
 * Port of OMP's TtsrManager pattern adapted for MCP server context.
 */

import { classifyRule } from "./rule-types.js";

/**
 * @typedef {object} TtsrTrigger
 * @property {string} ruleName
 * @property {string} content
 * @property {string} source - "text" | "tool" | "thinking"
 * @property {number} timestamp
 */

/**
 * TTSR Engine — manages rules, monitors output, triggers injections.
 */
export class TtsrEngine {
  /** @type {Map<string, object>} rule name → rule */
  #rules = new Map();
  /** @type {string[]} regex patterns compiled */
  #compiledPatterns = [];
  /** @type {Set<string>} rules already triggered this session */
  #triggered = new Set();
  /** @type {Map<string, number>} rule name → last trigger turn */
  #lastTriggerTurn = new Map();
  /** @type {number} current turn counter */
  #currentTurn = 0;
  /** @type {string[]} pending injection contents */
  #pendingInjections = [];
  /** @type {boolean} engine enabled */
  #enabled;

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.enabled=true]
   */
  constructor({ enabled = true } = {}) {
    this.#enabled = enabled;
  }

  /** @returns {boolean} */
  get enabled() { return this.#enabled; }
  set enabled(v) { this.#enabled = v; }

  /** @returns {number} */
  get pendingCount() { return this.#pendingInjections.length; }

  /** @returns {string[]} */
  get pendingInjections() { return [...this.#pendingInjections]; }

  /**
   * Register a rule for monitoring.
   * @param {object} rule - Must have name, content, and condition or astCondition
   * @returns {boolean} true if registered
   */
  addRule(rule) {
    if (!this.#enabled) return false;
    if (!rule?.name || (!rule.condition && !rule.astCondition)) return false;

    if (this.#rules.has(rule.name)) return false; // first-wins dedup

    this.#rules.set(rule.name, {
      ...rule,
      bucket: classifyRule(rule),
    });

    if (rule.condition) {
      try {
        this.#compiledPatterns.push({
          ruleName: rule.name,
          regex: new RegExp(rule.condition, "im"),
          pattern: rule.condition,
        });
      } catch { /* invalid regex, skip */ }
    }

    return true;
  }

  /**
   * Reset buffers on new turn.
   * @param {number} [turnNumber]
   */
  resetBuffer(turnNumber) {
    this.#currentTurn = turnNumber ?? this.#currentTurn + 1;
    this.#pendingInjections = [];
  }

  /**
   * Check a text delta against all registered patterns.
   * Synchronous scan — designed for streaming.
   *
   * @param {string} delta - Text chunk from stream
   * @param {object} [ctx={}] - Context (toolName, source type)
   * @returns {TtsrTrigger|null} First matching trigger, or null
   */
  checkDelta(delta, ctx = {}) {
    if (!this.#enabled || !delta) return null;

    for (const { ruleName, regex } of this.#compiledPatterns) {
      const rule = this.#rules.get(ruleName);
      if (!rule) continue;
      if (this.#shouldSkip(rule)) continue;

      if (regex.test(delta)) {
        return this.#fire(rule, ctx.source || "text");
      }
    }
    return null;
  }

  /**
   * Check a full source snapshot (for edit/write tools).
   * @param {string} snapshot - Full reconstructed source
   * @param {object} [ctx={}]
   * @returns {TtsrTrigger|null}
   */
  checkSnapshot(snapshot, ctx = {}) {
    if (!this.#enabled || !snapshot) return null;

    for (const { ruleName, regex } of this.#compiledPatterns) {
      const rule = this.#rules.get(ruleName);
      if (!rule) continue;
      if (this.#shouldSkip(rule)) continue;

      regex.lastIndex = 0;
      if (regex.test(snapshot)) {
        return this.#fire(rule, ctx.source || "tool");
      }
    }
    return null;
  }

  /**
   * Manually inject a rule's content (for proactive injection).
   * @param {string} ruleName
   */
  inject(ruleName) {
    const rule = this.#rules.get(ruleName);
    if (rule && !this.#shouldSkip(rule)) {
      this.#fire(rule, "text");
    }
  }

  /**
   * Mark a rule as triggered (called after successful injection).
   * @param {string} ruleName
   */
  markTriggered(ruleName) {
    this.#triggered.add(ruleName);
    this.#lastTriggerTurn.set(ruleName, this.#currentTurn);
  }

  /**
   * Get all rules that have fired this session.
   * @returns {string[]}
   */
  getInjectedRules() {
    return [...this.#triggered];
  }

  /**
   * Get count of registered rules.
   * @returns {number}
   */
  get ruleCount() { return this.#rules.size; }

  /**
   * Check if any rules are registered.
   * @returns {boolean}
   */
  hasRules() { return this.#rules.size > 0; }

  /** Reset all state */
  reset() {
    this.#rules.clear();
    this.#compiledPatterns = [];
    this.#triggered.clear();
    this.#lastTriggerTurn.clear();
    this.#currentTurn = 0;
    this.#pendingInjections = [];
  }

  // ─── Private ────────────────────────────────────────────────────────────

  #shouldSkip(rule) {
    if (this.#triggered.has(rule.name)) {
      if (rule.repeatMode === "once") return true;
      if (rule.repeatMode === "after-gap") {
        const lastTurn = this.#lastTriggerTurn.get(rule.name) ?? 0;
        if (this.#currentTurn - lastTurn < (rule.repeatGap || 3)) return true;
      }
    }
    return false;
  }

  #fire(rule, source) {
    const trigger = {
      ruleName: rule.name,
      content: rule.content,
      source,
      timestamp: Date.now(),
    };

    if (rule.interrupting && source !== "tool") {
      this.#pendingInjections.push(rule.content);
    }

    return trigger;
  }
}

/**
 * Build the XML injection payload for a triggered rule.
 * @param {object} rule
 * @param {"interrupt"|"reminder"} [mode="reminder"]
 * @returns {string}
 */
export function buildInjectionPayload(rule, mode = "reminder") {
  if (mode === "interrupt") {
    return `<system-interrupt reason="rule_violation" rule="${rule.name}">
${rule.content}
</system-interrupt>`;
  }
  return `<system-reminder source="ttsr" rule="${rule.name}">
${rule.content}
</system-reminder>`;
}
