/**
 * Stack Perfeita MCP — Karpathy Impact Metrics
 * Tracks the impact of Karpathy guidelines on code quality.
 *
 * Metrics tracked:
 * - Reduction in overcomplication patterns
 * - Decrease in unnecessary code changes
 * - Improvement in goal-driven execution
 * - Overall code quality trend
 */

import { z } from "zod";
import { withRateLimit } from "./rate-limiter.js";

// ─── Impact Tracking State ──────────────────────────────────────────────────

const impactMetrics = {
  sessionStart: Date.now(),
  beforeKarpathy: {
    overcomplicationPatterns: 0,
    unnecessaryChanges: 0,
    vagueGoals: 0,
    totalChecks: 0,
  },
  afterKarpathy: {
    overcomplicationPatterns: 0,
    unnecessaryChanges: 0,
    vagueGoals: 0,
    totalChecks: 0,
  },
  improvements: {
    codeReduction: 0,
    goalClarity: 0,
    surgicalPrecision: 0,
  },
};

/**
 * Record a before-Karpathy metric.
 */
export function recordBeforeMetric(metric, count = 1) {
  if (impactMetrics.beforeKarpathy[metric] !== undefined) {
    impactMetrics.beforeKarpathy[metric] += count;
    impactMetrics.beforeKarpathy.totalChecks++;
  }
}

/**
 * Record an after-Karpathy metric.
 */
export function recordAfterMetric(metric, count = 1) {
  if (impactMetrics.afterKarpathy[metric] !== undefined) {
    impactMetrics.afterKarpathy[metric] += count;
    impactMetrics.afterKarpathy.totalChecks++;
  }
}

/**
 * Calculate improvement percentages.
 */
function calculateImprovements() {
  const before = impactMetrics.beforeKarpathy;
  const after = impactMetrics.afterKarpathy;

  const calcImprovement = (beforeVal, afterVal) => {
    if (beforeVal === 0) return 0;
    return Math.round(((beforeVal - afterVal) / beforeVal) * 100);
  };

  impactMetrics.improvements = {
    codeReduction: calcImprovement(before.overcomplicationPatterns, after.overcomplicationPatterns),
    goalClarity: calcImprovement(before.vagueGoals, after.vagueGoals),
    surgicalPrecision: calcImprovement(before.unnecessaryChanges, after.unnecessaryChanges),
  };

  return impactMetrics.improvements;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

/**
 * Get impact metrics report.
 */
function handleGetKarpathyImpact() {
  try {
    const improvements = calculateImprovements();
    const sessionDuration = Math.round((Date.now() - impactMetrics.sessionStart) / 1000 / 60);

    const overallImprovement = Math.round(
      (improvements.codeReduction + improvements.goalClarity + improvements.surgicalPrecision) / 3
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            session_duration_minutes: sessionDuration,
            before_karpathy: impactMetrics.beforeKarpathy,
            after_karpathy: impactMetrics.afterKarpathy,
            improvements,
            overall_improvement: overallImprovement,
            status: overallImprovement >= 50 ? "EXCELLENT" : overallImprovement >= 25 ? "GOOD" : overallImprovement >= 0 ? "NEUTRAL" : "REGRESSION",
            summary: generateImpactSummary(improvements, overallImprovement),
          }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error getting Karpathy impact: ${e.message}` }],
    };
  }
}

/**
 * Generate impact summary.
 */
function generateImpactSummary(improvements, overall) {
  const summary = [];

  if (improvements.codeReduction > 0) {
    summary.push(`Code overcomplication reduced by ${improvements.codeReduction}%.`);
  } else if (improvements.codeReduction < 0) {
    summary.push(`Code overcomplication increased by ${Math.abs(improvements.codeReduction)}%. Review guidelines.`);
  }

  if (improvements.goalClarity > 0) {
    summary.push(`Goal clarity improved by ${improvements.goalClarity}%.`);
  } else if (improvements.goalClarity < 0) {
    summary.push(`Goal clarity decreased by ${Math.abs(improvements.goalClarity)}%. Define success criteria.`);
  }

  if (improvements.surgicalPrecision > 0) {
    summary.push(`Surgical precision improved by ${improvements.surgicalPrecision}%.`);
  } else if (improvements.surgicalPrecision < 0) {
    summary.push(`Unnecessary changes increased by ${Math.abs(improvements.surgicalPrecision)}%. Focus on requested changes.`);
  }

  if (summary.length === 0) {
    summary.push("No impact data yet. Use Karpathy tools to track improvements.");
  }

  return summary;
}

/**
 * Record a code quality check.
 */
function handleRecordCodeQualityCheck({ metric, count }) {
  try {
    recordAfterMetric(metric, count);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, message: `Recorded ${count} ${metric} metric(s).` }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error recording metric: ${e.message}` }],
    };
  }
}

/**
 * Reset impact metrics.
 */
function handleResetKarpathyImpact() {
  try {
    impactMetrics.sessionStart = Date.now();
    impactMetrics.beforeKarpathy = {
      overcomplicationPatterns: 0,
      unnecessaryChanges: 0,
      vagueGoals: 0,
      totalChecks: 0,
    };
    impactMetrics.afterKarpathy = {
      overcomplicationPatterns: 0,
      unnecessaryChanges: 0,
      vagueGoals: 0,
      totalChecks: 0,
    };
    impactMetrics.improvements = {
      codeReduction: 0,
      goalClarity: 0,
      surgicalPrecision: 0,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, message: "Impact metrics reset for new session." }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error resetting impact metrics: ${e.message}` }],
    };
  }
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerKarpathyImpactTools(server) {
  // 1. get_karpathy_impact
  server.tool(
    "get_karpathy_impact",
    "Get Karpathy impact metrics: before/after comparison, improvement percentages, and quality trend. Use to measure the effectiveness of Karpathy guidelines.",
    {},
    withRateLimit("get_karpathy_impact", handleGetKarpathyImpact),
  );

  // 2. record_code_quality_check
  server.tool(
    "record_code_quality_check",
    "Record a code quality metric (overcomplicationPatterns, unnecessaryChanges, vagueGoals). Use to track improvements over time.",
    {
      metric: z.enum(["overcomplicationPatterns", "unnecessaryChanges", "vagueGoals"]).describe("Metric to record."),
      count: z.number().int().min(1).default(1).describe("Count to add (default 1)."),
    },
    withRateLimit("record_code_quality_check", handleRecordCodeQualityCheck),
  );

  // 3. reset_karpathy_impact
  server.tool(
    "reset_karpathy_impact",
    "Reset impact metrics for a new session. Clears all before/after data.",
    {},
    withRateLimit("reset_karpathy_impact", handleResetKarpathyImpact),
  );
}
