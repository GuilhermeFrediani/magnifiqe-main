/**
 * Stack Perfeita MCP — Karpathy Compliance Dashboard
 * Real-time compliance monitoring and reporting.
 *
 * Provides:
 * - Overall compliance score
 * - Per-pillar breakdown
 * - Trend analysis
 * - Recommendations for improvement
 */

import { z } from "zod";
import { withRateLimit } from "./rate-limiter.js";
import { getKarpathyState, validateSessionKarpathy } from "./karpathy-hooks.js";
import { getComplianceStats } from "./karpathy-testing.js";

// ─── Dashboard Data ─────────────────────────────────────────────────────────

const dashboardData = {
  sessionStart: Date.now(),
  totalChecks: 0,
  passedChecks: 0,
  failedChecks: 0,
  pillarScores: {
    think_before_coding: { total: 0, passed: 0 },
    simplicity_first: { total: 0, passed: 0 },
    surgical_changes: { total: 0, passed: 0 },
    goal_driven: { total: 0, passed: 0 },
  },
  recentViolations: [],
  maxRecentViolations: 10,
};

/**
 * Record a compliance check result.
 */
export function recordComplianceCheck(pillar, passed) {
  dashboardData.totalChecks++;
  if (passed) {
    dashboardData.passedChecks++;
  } else {
    dashboardData.failedChecks++;
  }

  if (dashboardData.pillarScores[pillar]) {
    dashboardData.pillarScores[pillar].total++;
    if (passed) {
      dashboardData.pillarScores[pillar].passed++;
    }
  }
}

/**
 * Record a violation.
 */
export function recordViolation(pillar, message) {
  dashboardData.recentViolations.push({
    timestamp: Date.now(),
    pillar,
    message,
  });
  if (dashboardData.recentViolations.length > dashboardData.maxRecentViolations) {
    dashboardData.recentViolations.shift();
  }
}

/**
 * Get dashboard data.
 */
function getDashboardData() {
  const sessionDuration = Math.round((Date.now() - dashboardData.sessionStart) / 1000 / 60);
  const complianceRate = dashboardData.totalChecks > 0
    ? Math.round((dashboardData.passedChecks / dashboardData.totalChecks) * 100)
    : 0;

  const pillarBreakdown = {};
  for (const [pillar, data] of Object.entries(dashboardData.pillarScores)) {
    pillarBreakdown[pillar] = {
      score: data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0,
      checks: data.total,
      passed: data.passed,
      failed: data.total - data.passed,
    };
  }

  return {
    session_duration_minutes: sessionDuration,
    total_checks: dashboardData.totalChecks,
    passed_checks: dashboardData.passedChecks,
    failed_checks: dashboardData.failedChecks,
    compliance_rate: complianceRate,
    pillar_breakdown: pillarBreakdown,
    recent_violations: dashboardData.recentViolations,
    status: complianceRate >= 80 ? "EXCELLENT" : complianceRate >= 60 ? "GOOD" : complianceRate >= 40 ? "NEEDS_WORK" : "CRITICAL",
  };
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

/**
 * Get Karpathy compliance dashboard.
 */
function handleGetKarpathyDashboard() {
  try {
    const data = getDashboardData();
    const sessionValidation = validateSessionKarpathy();
    const complianceStats = getComplianceStats();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ...data,
            session_validation: sessionValidation,
            historical_stats: complianceStats,
            recommendations: generateRecommendations(data),
          }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error getting Karpathy dashboard: ${e.message}` }],
    };
  }
}

/**
 * Generate recommendations based on compliance data.
 */
function generateRecommendations(data) {
  const recommendations = [];

  if (data.compliance_rate < 60) {
    recommendations.push("Focus on stating assumptions before implementing (Pillar 1).");
  }

  if (data.pillar_breakdown.simplicity_first?.score < 60) {
    recommendations.push("Review code for overcomplication patterns (Pillar 2).");
  }

  if (data.pillar_breakdown.surgical_changes?.score < 60) {
    recommendations.push("Ensure only requested changes are made (Pillar 3).");
  }

  if (data.pillar_breakdown.goal_driven?.score < 60) {
    recommendations.push("Define clear success criteria before starting tasks (Pillar 4).");
  }

  if (data.recent_violations.length > 5) {
    recommendations.push("High violation rate detected. Review Karpathy guidelines.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Excellent compliance! Keep up the good work.");
  }

  return recommendations;
}

/**
 * Reset dashboard data (for new session).
 */
function handleResetKarpathyDashboard() {
  try {
    dashboardData.sessionStart = Date.now();
    dashboardData.totalChecks = 0;
    dashboardData.passedChecks = 0;
    dashboardData.failedChecks = 0;
    dashboardData.pillarScores = {
      think_before_coding: { total: 0, passed: 0 },
      simplicity_first: { total: 0, passed: 0 },
      surgical_changes: { total: 0, passed: 0 },
      goal_driven: { total: 0, passed: 0 },
    };
    dashboardData.recentViolations = [];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, message: "Dashboard data reset for new session." }),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: `HALT — Error resetting dashboard: ${e.message}` }],
    };
  }
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerKarpathyDashboardTools(server) {
  // 1. get_karpathy_dashboard
  server.tool(
    "get_karpathy_dashboard",
    "Real-time Karpathy compliance dashboard. Shows overall score, per-pillar breakdown, recent violations, and improvement recommendations. Use to monitor guideline adherence during development.",
    {},
    withRateLimit("get_karpathy_dashboard", handleGetKarpathyDashboard),
  );

  // 2. reset_karpathy_dashboard
  server.tool(
    "reset_karpathy_dashboard",
    "Reset Karpathy compliance dashboard for a new session. Clears all counters and starts fresh.",
    {},
    withRateLimit("reset_karpathy_dashboard", handleResetKarpathyDashboard),
  );
}
