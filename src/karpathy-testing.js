/**
 * Stack Perfeita MCP — Karpathy Guidelines Testing
 * Measures impact of Karpathy anti-slop guidelines on code quality.
 *
 * Integrates with prompt-testing framework to:
 * - Evaluate prompts against Karpathy 4 pillars
 * - Track compliance over time
 * - Measure reduction in overcomplication
 */

import { z } from "zod";
import { withRateLimit } from "./rate-limiter.js";
import { getKarpathyState, validateSimplicity, validateGoalDriven } from "./karpathy-hooks.js";

// ─── Karpathy Evaluation Criteria ───────────────────────────────────────────

const KARPATHY_CRITERIA = {
  think_before_coding: {
    weight: 0.25,
    checks: [
      { name: "states_assumptions", pattern: /\b(assumption|assume|understanding|believe|think)\b/i, desc: "States assumptions explicitly" },
      { name: "asks_when_uncertain", pattern: /\b(clarify|confirm|verify|check|ask|uncertain)\b/i, desc: "Asks when uncertain" },
      { name: "presents_alternatives", pattern: /\b(alternative|option|approach|interpret|could|might)\b/i, desc: "Presents alternatives" },
      { name: "no_silent_picking", pattern: null, desc: "Doesn't pick silently", negative: true, custom: (p) => !/\b(i'?ll|let me|going to|will)\b.*(implement|create|build|code)/i.test(p) || /\b(assumption|alternative|option)\b/i.test(p) },
      { name: "pushes_back_when_needed", pattern: /\b(simpler|easier|overcomplicated|unnecessary|overkill)\b/i, desc: "Pushes back when warranted" },
    ],
  },
  simplicity_first: {
    weight: 0.25,
    checks: [
      { name: "no_extra_features", pattern: null, desc: "No extra features", custom: (p) => !/\b(add|also|include|support|handle|implement)\b.*(feature|function|method|class)/i.test(p) || /\b(only|just|specifically|exactly)\b/i.test(p) },
      { name: "no_speculative_abstractions", pattern: null, desc: "No speculative abstractions", custom: (p) => !/\b(strategy|factory|builder|adapter|decorator)\b/i.test(p) || /\b(need|required|necessary)\b/i.test(p) },
      { name: "minimum_code", pattern: /\b(simple|minimal|concise|brief|short)\b/i, desc: "Minimum code" },
      { name: "no_unnecessary_complexity", pattern: null, desc: "No unnecessary complexity", custom: (p) => !/\b(configurable|flexible|extensible|generic|reusable)\b/i.test(p) || /\b(need|required|necessary)\b/i.test(p) },
      { name: "function_length_ok", pattern: null, desc: "Functions under 50 lines", custom: (p) => true }, // Checked in code validation
    ],
  },
  surgical_changes: {
    weight: 0.25,
    checks: [
      { name: "only_changed_what_asked", pattern: null, desc: "Only changed what was asked", custom: (p) => !/\b(refactor|improve|clean|optimize|enhance)\b.*(code|function|class|module)/i.test(p) || /\b(specifically|only|just|exactly)\b/i.test(p) },
      { name: "no_adjacent_improvements", pattern: null, desc: "No adjacent improvements", custom: (p) => !/\b(also|while|i'?m at it|also updated|also fixed)\b/i.test(p) },
      { name: "matches_existing_style", pattern: /\b(match|follow|consistent|same|existing)\b/i, desc: "Matches existing style" },
      { name: "mentions_dead_code_not_deletes", pattern: /\b(notice|found|spotted|mentioned|see)\b.*\b(dead code|unused|orphan)\b/i, desc: "Mentions dead code but doesn't delete" },
      { name: "every_line_traces_to_request", pattern: null, desc: "Every line traces to request", custom: (p) => true }, // Manual verification
    ],
  },
  goal_driven: {
    weight: 0.25,
    checks: [
      { name: "defines_success_criteria", pattern: /\b(test|verify|assert|check|validate|success|pass|fail)\b/i, desc: "Defines success criteria" },
      { name: "write_test_first", pattern: /\b(test|spec|assert|expect|should)\b/i, desc: "Write test first" },
      { name: "loops_until_verified", pattern: /\b(loop|repeat|until|iterate|retry)\b/i, desc: "Loops until verified" },
      { name: "plan_with_verification", pattern: /\b(\d+\.\s|\bstep\b|\bthen\b|\bnext\b|\bverify\b)/i, desc: "Plan with verification steps" },
      { name: "strong_not_weak_criteria", pattern: null, desc: "Strong criteria (not 'make it work')", custom: (p) => !/\b(make it work|fix it|just do it|make it better)\b/i.test(p) },
    ],
  },
};

// ─── Compliance Tracking ────────────────────────────────────────────────────

const complianceHistory = [];
const MAX_HISTORY = 100;

/**
 * Record a compliance check.
 */
function recordCompliance(result) {
  complianceHistory.push({
    timestamp: Date.now(),
    ...result,
  });
  if (complianceHistory.length > MAX_HISTORY) {
    complianceHistory.shift();
  }
}

/**
 * Get compliance statistics.
 */
export function getComplianceStats() {
  if (complianceHistory.length === 0) {
    return { total: 0, averageScore: 0, trend: "no_data" };
  }

  const scores = complianceHistory.map((c) => c.score);
  const recent = scores.slice(-10);
  const older = scores.slice(0, -10);

  const avgRecent = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;

  let trend = "stable";
  if (avgRecent > avgOlder + 5) trend = "improving";
  else if (avgRecent < avgOlder - 5) trend = "declining";

  return {
    total: complianceHistory.length,
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    recentAverage: Math.round(avgRecent),
    trend,
    lastScore: scores[scores.length - 1],
  };
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

/**
 * Evaluate prompt against Karpathy criteria.
 */
function handleEvaluateKarpathyCompliance({ prompt, include_suggestions }) {
  try {
    const categoryResults = {};
    for (const [category, config] of Object.entries(KARPATHY_CRITERIA)) {
      const passed = [];
      const failed = [];

      for (const check of config.checks) {
        let met = false;

        if (check.custom) {
          met = check.custom(prompt);
        } else if (check.pattern) {
          const found = check.pattern.test(prompt);
          met = check.negative ? !found : found;
        }

        if (met) {
          passed.push(check.name);
        } else {
          failed.push(check.name);
        }
      }

      const score = config.checks.length > 0 ? Math.round((passed.length / config.checks.length) * 100) : 0;
      categoryResults[category] = { passed, failed, score };
    }

    // Compute overall score
    let weightedSum = 0;
    const criteriaMet = [];
    const criteriaFailed = [];

    for (const [category, result] of Object.entries(categoryResults)) {
      const weight = KARPATHY_CRITERIA[category]?.weight || 0.25;
      weightedSum += result.score * weight;
      criteriaMet.push(...result.passed.map((p) => `${category}.${p}`));
      criteriaFailed.push(...result.failed.map((f) => `${category}.${f}`));
    }

    const overallScore = Math.round(weightedSum);

    // Generate suggestions
    const suggestions = [];
    if (include_suggestions) {
      const suggestionMap = {
        think_before_coding: {
          states_assumptions: "State your assumptions explicitly before implementing.",
          asks_when_uncertain: "If uncertain, ask for clarification.",
          presents_alternatives: "Present alternative approaches if they exist.",
          no_silent_picking: "Don't pick an approach silently - explain your choice.",
          pushes_back_when_needed: "Push back if you think a simpler approach exists.",
        },
        simplicity_first: {
          no_extra_features: "Implement only what was asked - no extra features.",
          no_speculative_abstractions: "Don't add abstractions unless truly needed.",
          minimum_code: "Write the minimum code that solves the problem.",
          no_unnecessary_complexity: "Avoid configurable/flexible code unless requested.",
          function_length_ok: "Keep functions under 50 lines.",
        },
        surgical_changes: {
          only_changed_what_asked: "Only modify what was specifically requested.",
          no_adjacent_improvements: "Don't improve adjacent code while you're at it.",
          matches_existing_style: "Match the existing code style.",
          mentions_dead_code_not_deletes: "Mention dead code but don't delete it unless asked.",
          every_line_traces_to_request: "Every changed line should trace to the user's request.",
        },
        goal_driven: {
          defines_success_criteria: "Define clear success criteria before starting.",
          write_test_first: "Write tests first to verify the implementation.",
          loops_until_verified: "Loop until the implementation is verified.",
          plan_with_verification: "Create a plan with verification steps.",
          strong_not_weak_criteria: "Use strong criteria, not 'make it work'.",
        },
      };

      for (const criterion of criteriaFailed) {
        const [category, checkName] = criterion.split(".");
        if (suggestionMap[category]?.[checkName]) {
          suggestions.push(`${criterion}: ${suggestionMap[category][checkName]}`);
        }
      }
    }

    // Record compliance
    recordCompliance({
      score: overallScore,
      criteria_met: criteriaMet.length,
      criteria_failed: criteriaFailed.length,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            overall_score: overallScore,
            grade: overallScore >= 80 ? "A" : overallScore >= 60 ? "B" : overallScore >= 40 ? "C" : "D",
            categories: categoryResults,
            criteria_met: criteriaMet,
            criteria_failed: criteriaFailed,
            suggestions: include_suggestions ? suggestions : undefined,
            karpathy_pillars: {
              think_before_coding: categoryResults.think_before_coding?.score || 0,
              simplicity_first: categoryResults.simplicity_first?.score || 0,
              surgical_changes: categoryResults.surgical_changes?.score || 0,
              goal_driven: categoryResults.goal_driven?.score || 0,
            },
          }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error evaluating Karpathy compliance: ${e.message}` }],
    };
  }
}

/**
 * Get compliance statistics over time.
 */
function handleGetKarpathyStats() {
  try {
    const stats = getComplianceStats();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ...stats,
            message: stats.total === 0
              ? "No compliance data yet. Run evaluate_karpathy_compliance first."
              : `Average score: ${stats.averageScore}/100. Trend: ${stats.trend}.`,
          }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error getting Karpathy stats: ${e.message}` }],
    };
  }
}

/**
 * Test code against Karpathy simplicity criteria.
 */
function handleTestCodeSimplicity({ code }) {
  try {
    const result = validateSimplicity(code);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            passed: result.passed,
            issues: result.issues,
            score: result.passed ? 100 : Math.max(0, 100 - result.issues.length * 20),
            message: result.passed
              ? "Code follows Karpathy simplicity guidelines."
              : `Code has ${result.issues.length} simplicity issue(s).`,
          }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error testing code simplicity: ${e.message}` }],
    };
  }
}

/**
 * Test goal-driven execution criteria.
 */
function handleTestGoalDriven({ task_description }) {
  try {
    const result = validateGoalDriven(task_description);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            passed: result.passed,
            message: result.passed
              ? "Task has clear success criteria."
              : "Task lacks clear success criteria. Define what 'done' means.",
          }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error testing goal-driven execution: ${e.message}` }],
    };
  }
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerKarpathyTestingTools(server) {
  // 1. evaluate_karpathy_compliance
  server.tool(
    "evaluate_karpathy_compliance",
    "Evaluate a prompt or code snippet against Karpathy's 4 anti-slop pillars. Returns compliance score (0-100), grade, and improvement suggestions. Use before implementing to ensure guidelines are followed.",
    {
      prompt: z.string().min(1).describe("Prompt, code snippet, or task description to evaluate."),
      include_suggestions: z.boolean().default(true).describe("Include improvement suggestions in response."),
    },
    withRateLimit("evaluate_karpathy_compliance", handleEvaluateKarpathyCompliance),
  );

  // 2. get_karpathy_stats
  server.tool(
    "get_karpathy_stats",
    "Returns Karpathy compliance statistics: average score, trend (improving/stable/declining), and recent performance. Use to track guideline adherence over time.",
    {},
    withRateLimit("get_karpathy_stats", handleGetKarpathyStats),
  );

  // 3. test_code_simplicity
  server.tool(
    "test_code_simplicity",
    "Test code against Karpathy's Simplicity First pillar. Detects overcomplication patterns, unnecessary abstractions, and long functions. Returns score and specific issues.",
    {
      code: z.string().min(1).describe("Code snippet to test for simplicity."),
    },
    withRateLimit("test_code_simplicity", handleTestCodeSimplicity),
  );

  // 4. test_goal_driven
  server.tool(
    "test_goal_driven",
    "Test if a task description has clear, verifiable success criteria. Detects vague goals like 'make it work' and suggests stronger criteria.",
    {
      task_description: z.string().min(1).describe("Task description to test for goal clarity."),
    },
    withRateLimit("test_goal_driven", handleTestGoalDriven),
  );
}
