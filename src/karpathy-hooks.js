/**
 * Stack Perfeita MCP — Karpathy Anti-Slop Hooks
 * Pre-tool-call validation enforcing the 4 Karpathy pillars.
 *
 * This module wraps tool registration to add behavioral validation:
 * 1. Think Before Coding — validates assumptions are stated
 * 2. Simplicity First — checks for overcomplication patterns
 * 3. Surgical Changes — verifies changes are targeted
 * 4. Goal-Driven Execution — ensures success criteria are defined
 */

import { createHash } from "crypto";

// ─── Karpathy Validation State ──────────────────────────────────────────────

const karpathyState = {
  assumptionsStated: false,
  simplicityChecked: false,
  surgicalVerified: false,
  goalsDefined: false,
  lastValidation: null,
  validationCount: 0,
};

/**
 * Reset Karpathy state for a new task.
 */
export function resetKarpathyState() {
  karpathyState.assumptionsStated = false;
  karpathyState.simplicityChecked = false;
  karpathyState.surgicalVerified = false;
  karpathyState.goalsDefined = false;
  karpathyState.lastValidation = null;
  karpathyState.validationCount = 0;
}

/**
 * Get current Karpathy state.
 */
export function getKarpathyState() {
  return { ...karpathyState };
}

// ─── Validation Functions ───────────────────────────────────────────────────

/**
 * Check if assumptions are being stated (Pillar 1: Think Before Coding).
 * @param {string} input - User input or tool parameters
 * @returns {{ passed: boolean, message: string|null }}
 */
export function validateAssumptions(input) {
  const assumptionPatterns = [
    /assumption/i,
    /i assume/i,
    /i think/i,
    /i believe/i,
    /my understanding/i,
    /correct me if/i,
    /please clarify/i,
    /before i (start|implement|code)/i,
    /let me (confirm|verify|check)/i,
    /is it (correct|right|safe)/i,
  ];

  const hasAssumption = assumptionPatterns.some(p => p.test(input));
  karpathyState.assumptionsStated = hasAssumption;

  return {
    passed: hasAssumption,
    message: hasAssumption
      ? null
      : "HALT — Karpathy Pillar 1: State assumptions explicitly before implementing. If uncertain, ask.",
  };
}

/**
 * Check for overcomplication patterns (Pillar 2: Simplicity First).
 * @param {string} code - Code to validate
 * @returns {{ passed: boolean, issues: string[] }}
 */
export function validateSimplicity(code) {
  const issues = [];

  // Check for unnecessary abstractions
  if (/class\s+\w+\(.*Strategy.*\)/i.test(code)) {
    issues.push("Strategy pattern detected — is this necessary for a single use case?");
  }

  if (/interface\s+I\w+/i.test(code)) {
    issues.push("Interface detected — is polymorphism needed here?");
  }

  // Check for excessive configuration
  if (/\boptions\s*[:=]\s*\{[^}]{200,}/i.test(code)) {
    issues.push("Large options object — consider breaking into smaller configs");
  }

  // Check for speculative features
  if (/\b(future|later|when|if)\b.*\b(add|implement|support)/i.test(code)) {
    issues.push("Speculative feature detected — implement only what's needed now");
  }

  // Check function length
  const functionMatches = code.match(/function\s+\w+[^{]*\{[\s\S]*?\}/g) || [];
  for (const fn of functionMatches) {
    const lines = fn.split("\n").length;
    if (lines > 50) {
      issues.push(`Function exceeds 50 lines (${lines} lines) — consider splitting`);
    }
  }

  karpathyState.simplicityChecked = issues.length === 0;

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * Verify changes are surgical (Pillar 3: Surgical Changes).
 * @param {string} originalCode - Original code before changes
 * @param {string} newCode - New code after changes
 * @param {string} userRequest - What the user asked for
 * @returns {{ passed: boolean, unrelatedChanges: string[] }}
 */
export function verifySurgicalChanges(originalCode, newCode, userRequest) {
  const unrelatedChanges = [];

  // Simple diff detection - check for changes in unrelated areas
  const originalLines = originalCode.split("\n").filter(l => l.trim());
  const newLines = newCode.split("\n").filter(l => l.trim());

  // Check if new code has significantly more lines than original
  if (newLines.length > originalLines.length * 1.5) {
    unrelatedChanges.push(`Code expanded by ${Math.round((newLines.length / originalLines.length - 1) * 100)}% — verify all changes are requested`);
  }

  // Check for new functions not in original
  const originalFunctions = originalCode.match(/function\s+\w+/g) || [];
  const newFunctions = newCode.match(/function\s+\w+/g) || [];
  const addedFunctions = newFunctions.filter(f => !originalFunctions.includes(f));

  if (addedFunctions.length > 0) {
    unrelatedChanges.push(`Added ${addedFunctions.length} new function(s): ${addedFunctions.join(", ")}`);
  }

  karpathyState.surgicalVerified = unrelatedChanges.length === 0;

  return {
    passed: unrelatedChanges.length === 0,
    unrelatedChanges,
  };
}

/**
 * Check if success criteria are defined (Pillar 4: Goal-Driven Execution).
 * @param {string} taskDescription - Task being worked on
 * @returns {{ passed: boolean, message: string|null }}
 */
export function validateGoalDriven(taskDescription) {
  const goalPatterns = [
    /test/i,
    /verify/i,
    /assert/i,
    /check/i,
    /validate/i,
    /success criteria/i,
    /acceptance criteria/i,
    /done when/i,
    /pass when/i,
    /should (work|run|return|produce)/i,
  ];

  const hasGoals = goalPatterns.some(p => p.test(taskDescription));
  karpathyState.goalsDefined = hasGoals;

  return {
    passed: hasGoals,
    message: hasGoals
      ? null
      : "HALT — Karpathy Pillar 4: Define success criteria. 'Make it work' is not a goal.",
  };
}

// ─── Tool Registration Wrapper ──────────────────────────────────────────────

/**
 * Wrap a tool handler with Karpathy validation.
 * @param {string} toolName - Name of the tool
 * @param {Function} handler - Original tool handler
 * @param {Object} options - Validation options
 * @returns {Function} Wrapped handler with validation
 */
export function withKarpathyValidation(toolName, handler, options = {}) {
  const {
    validateAssumptions: enableAssumptionCheck = true,
    validateSimplicity: enableSimplicityCheck = true,
    validateSurgical: enableSurgicalCheck = false, // Only for code modification tools
    validateGoals: enableGoalCheck = true,
  } = options;

  return async (params, extra) => {
    // Reset state for new tool call
    if (karpathyState.validationCount === 0) {
      resetKarpathyState();
    }
    karpathyState.validationCount++;

    // Validate assumptions if enabled
    if (enableAssumptionCheck) {
      const input = JSON.stringify(params);
      const assumptionResult = validateAssumptions(input);
      if (!assumptionResult.passed) {
        // Don't block, but warn
        console.error(`[Karpathy] ${assumptionResult.message}`);
      }
    }

    // Validate goal-driven execution
    if (enableGoalCheck) {
      const goalResult = validateGoalDriven(toolName + " " + JSON.stringify(params));
      if (!goalResult.passed) {
        console.error(`[Karpathy] ${goalResult.message}`);
      }
    }

    // Execute original handler
    const result = await handler(params, extra);

    // Track validation
    karpathyState.lastValidation = {
      tool: toolName,
      timestamp: Date.now(),
      state: { ...karpathyState },
    };

    return result;
  };
}

/**
 * Create a Karpathy-validated tool registration.
 * @param {Object} server - MCP server instance
 * @param {string} toolName - Tool name
 * @param {string} description - Tool description
 * @param {Object} schema - Zod schema
 * @param {Function} handler - Tool handler
 * @param {Object} karpathyOptions - Karpathy validation options
 */
export function registerKarpathyTool(server, toolName, description, schema, handler, karpathyOptions = {}) {
  const wrappedHandler = withKarpathyValidation(toolName, handler, karpathyOptions);

  server.tool(
    toolName,
    description,
    schema,
    wrappedHandler,
  );
}

// ─── Session-Level Validation ───────────────────────────────────────────────

/**
 * Run session-level Karpathy validation.
 * Called at session start to ensure guidelines are loaded.
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateSessionKarpathy() {
  const missing = [];

  // Check if guidelines are loaded
  const state = getKarpathyState();
  if (!state.assumptionsStated) {
    missing.push("assumptions");
  }
  if (!state.goalsDefined) {
    missing.push("goals");
  }

  return {
    valid: missing.length === 0,
    missing,
    message: missing.length === 0
      ? null
      : `Karpathy guidelines partially loaded. Missing: ${missing.join(", ")}`,
  };
}
// ─── Karpathy-Aware Rate Limit Wrapper ──────────────────────────────────────

/**
 * Create a rate-limited handler with Karpathy validation.
 * Drop-in replacement for withRateLimit that adds Karpathy checks.
 * @param {string} toolName - Tool name for rate limiting
 * @param {Function} handler - Original handler
 * @param {Object} options - { rateLimit: true/false, karpathy: true/false }
 * @returns {Function} Wrapped handler
 */
export function withKarpathyRateLimit(toolName, handler, options = {}) {
  const { rateLimit: enableRateLimit = true, karpathy: enableKarpathy = true } = options;

  // Import rateLimiter dynamically to avoid circular deps
  const getRateLimiter = async () => {
    const mod = await import("./rate-limiter.js");
    return mod.rateLimiter;
  };

  return async (params, extra) => {
    // Rate limit check
    if (enableRateLimit) {
      try {
        const rateLimiter = await getRateLimiter();
        const halt = rateLimiter.check(toolName);
        if (halt) return { content: [{ type: "text", text: halt }] };
      } catch {
        // Rate limiter unavailable, continue
      }
    }

    // Karpathy validation
    if (enableKarpathy) {
      const input = JSON.stringify(params);
      const goalResult = validateGoalDriven(toolName + " " + input);
      if (!goalResult.passed) {
        console.error(`[Karpathy] ${goalResult.message}`);
      }
    }

    return handler(params, extra);
  };
}
