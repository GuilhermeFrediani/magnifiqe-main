/**
 * Stack Perfeita MCP — Session Analytics
 * Tracks, aggregates, and reports on session performance events.
 * GAP-15: session-level telemetry for task throughput, tool usage, and health.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Constants & State ──────────────────────────────────────────────────────

const MAX_EVENTS = 1000;
const sessionEvents = [];
const sessionStart = Date.now();

const VALID_EVENT_TYPES = [
  "task_start",
  "task_complete",
  "task_fail",
  "tool_use",
  "error",
  "compaction",
  "checkpoint",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function now() {
  return Date.now();
}

function elapsed() {
  return now() - sessionStart;
}

/** Sliding-window idle detection: gap ≥ threshold between consecutive events. */
function findIdlePeriods(gapThresholdMs = 120_000) {
  const idles = [];
  for (let i = 1; i < sessionEvents.length; i++) {
    const gap = sessionEvents[i].ts - sessionEvents[i - 1].ts;
    if (gap >= gapThresholdMs) {
      idles.push({
        type: "idle",
        description: `Idle period of ${Math.round(gap / 1000)}s between events`,
        frequency: 1,
      });
    }
  }
  return idles;
}

/** Detect repeated error messages (same details ≥ 3 times). */
function findRepeatedErrors() {
  const counts = {};
  for (const ev of sessionEvents) {
    if (ev.type === "error" && ev.details) {
      counts[ev.details] = (counts[ev.details] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, c]) => c >= 3)
    .map(([msg, c]) => ({
      type: "repeated_error",
      description: `Same error repeated ${c}×: "${msg.slice(0, 120)}"`,
      frequency: c,
    }));
}

/** Detect rapid tool-use bursts (≥5 tool_use events within 10 s). */
function findToolBursts(windowMs = 10_000, threshold = 5) {
  const bursts = [];
  const toolEvents = sessionEvents.filter((e) => e.type === "tool_use");
  for (let i = 0; i < toolEvents.length; i++) {
    const windowEnd = toolEvents[i].ts + windowMs;
    let count = 0;
    for (let j = i; j < toolEvents.length && toolEvents[j].ts <= windowEnd; j++) {
      count++;
    }
    if (count >= threshold) {
      bursts.push({
        type: "tool_burst",
        description: `${count} tool calls within ${windowMs / 1000}s window`,
        frequency: count,
      });
    }
  }
  return bursts;
}

/** Detect task_fail immediately after task_start (no task_complete between). */
function findQuickFailures() {
  const fails = [];
  for (let i = 1; i < sessionEvents.length; i++) {
    const prev = sessionEvents[i - 1];
    const cur = sessionEvents[i];
    if (prev.type === "task_start" && cur.type === "task_fail") {
      const gap = cur.ts - prev.ts;
      if (gap < 5000) {
        fails.push({
          type: "quick_failure",
          description: `Task failed within ${Math.round(gap / 1000)}s of starting`,
          frequency: 1,
        });
      }
    }
  }
  return fails;
}

/** Identify productive periods: clusters of task_complete events. */
function findProductivePeriods(gapThresholdMs = 60_000) {
  const completes = sessionEvents.filter((e) => e.type === "task_complete");
  if (completes.length < 2) return [];

  const periods = [];
  let start = completes[0].ts;
  let end = completes[0].ts;
  let count = 1;

  for (let i = 1; i < completes.length; i++) {
    if (completes[i].ts - end <= gapThresholdMs) {
      end = completes[i].ts;
      count++;
    } else {
      if (count >= 3) {
        periods.push({
          type: "productive_period",
          description: `${count} tasks completed within ${Math.round((end - start) / 1000)}s`,
          frequency: count,
        });
      }
      start = completes[i].ts;
      end = completes[i].ts;
      count = 1;
    }
  }
  if (count >= 3) {
    periods.push({
      type: "productive_period",
      description: `${count} tasks completed within ${Math.round((end - start) / 1000)}s`,
      frequency: count,
    });
  }
  return periods;
}

function buildRecommendations(patterns, efficiencyScore) {
  const recs = [];
  const types = new Set(patterns.map((p) => p.type));

  if (types.has("repeated_error")) {
    recs.push(
      "Repeated errors detected — investigate root cause or add circuit-breaker logic."
    );
  }
  if (types.has("tool_burst")) {
    recs.push(
      "Tool-use bursts detected — consider batching or reducing redundant calls."
    );
  }
  if (types.has("quick_failure")) {
    recs.push(
      "Tasks failing immediately after start — verify input validation and preconditions."
    );
  }
  if (types.has("idle")) {
    recs.push(
      "Long idle periods detected — check for blocked workflows or lost context."
    );
  }
  if (types.has("productive_period")) {
    recs.push(
      "Productive burst detected — this pattern indicates good task flow; aim to sustain it."
    );
  }
  if (efficiencyScore < 40) {
    recs.push(
      "Low efficiency score — review error rate and task completion ratio."
    );
  }
  if (recs.length === 0) {
    recs.push("Session looks healthy. Keep up the good work.");
  }
  return recs;
}

function formatMarkdownReport(summary, timeline, patterns, recommendations) {
  const lines = [];
  const startStr = new Date(sessionStart).toISOString();

  lines.push("# Session Analytics Report");
  lines.push(`**Started:** ${startStr}`);
  lines.push(`**Duration:** ${Math.round(summary.duration_ms / 1000)}s`);
  lines.push("");

  lines.push("## Summary");
  lines.push(`- Tasks completed: ${summary.tasks_completed}`);
  lines.push(`- Tasks failed: ${summary.tasks_failed}`);
  lines.push(`- Tools used: ${summary.tools_used}`);
  lines.push(`- Errors: ${summary.errors}`);
  lines.push(`- Efficiency score: ${summary.efficiency_score}/100`);
  lines.push(`- Health score: ${patterns.health_score}/100`);
  lines.push("");

  lines.push("## Timeline (last 50 events)");
  lines.push("| Timestamp | Type | Details | Duration (ms) |");
  lines.push("|---|---|---|---|");
  for (const ev of timeline.events.slice(0, 50)) {
    lines.push(
      `| ${new Date(ev.timestamp).toISOString()} | ${ev.type} | ${(ev.details || "").replace(/\|/g, "\\|")} | ${ev.duration_ms ?? ""} |`
    );
  }
  lines.push("");

  lines.push("## Patterns");
  if (patterns.patterns.length === 0) {
    lines.push("No notable patterns detected.");
  } else {
    lines.push("| Type | Description | Frequency |");
    lines.push("|---|---|---|");
    for (const p of patterns.patterns) {
      lines.push(`| ${p.type} | ${p.description} | ${p.frequency} |`);
    }
  }
  lines.push("");

  lines.push("## Recommendations");
  for (const r of recommendations) {
    lines.push(`- ${r}`);
  }

  return lines.join("\n");
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerSessionAnalyticsTools(server) {
  // ── track_session_event ──────────────────────────────────────────────────
  server.tool(
    "track_session_event",
    "Records a session event with timestamp. Supports task lifecycle, tool usage, errors, compaction, and checkpoint events.",
    {
      event_type: z
        .enum(VALID_EVENT_TYPES)
        .describe("Type of event to record"),
      details: z
        .string()
        .optional()
        .describe("Optional human-readable detail about the event"),
      duration_ms: z
        .number()
        .optional()
        .describe("Optional duration in milliseconds for the event"),
    },
    async ({ event_type, details, duration_ms }) => {
      const halt = rateLimiter.check("track_session_event");
      if (halt) {
        return { content: [{ type: "text", text: halt }] };
      }

      if (sessionEvents.length >= MAX_EVENTS) {
        sessionEvents.shift(); // FIFO eviction
      }

      sessionEvents.push({
        ts: now(),
        type: event_type,
        details: details ?? null,
        duration_ms: duration_ms ?? null,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              recorded: true,
              event_count: sessionEvents.length,
            }),
          },
        ],
      };
    }
  );

  // ── get_session_summary ──────────────────────────────────────────────────
  server.tool(
    "get_session_summary",
    "Returns aggregated summary statistics for the current session: duration, task counts, tool usage, errors, and efficiency score.",
    {},
    async () => {
      const halt = rateLimiter.check("get_session_summary");
      if (halt) {
        return { content: [{ type: "text", text: halt }] };
      }

      const duration = elapsed();
      let tasksCompleted = 0;
      let tasksFailed = 0;
      let toolsUsed = 0;
      let errors = 0;

      for (const ev of sessionEvents) {
        switch (ev.type) {
          case "task_complete":
            tasksCompleted++;
            break;
          case "task_fail":
            tasksFailed++;
            break;
          case "tool_use":
            toolsUsed++;
            break;
          case "error":
            errors++;
            break;
        }
      }

      const totalTasks = tasksCompleted + tasksFailed;
      // Efficiency: ratio of completed to total tasks (0–100), weighted by error penalty.
      // No tasks → 50 (neutral). Error penalty capped at 30 points.
      const completionRatio = totalTasks > 0 ? tasksCompleted / totalTasks : 0.5;
      const errorPenalty = Math.min(30, (errors / Math.max(1, totalTasks)) * 100);
      const efficiencyScore = Math.round(
        Math.max(0, Math.min(100, completionRatio * 100 - errorPenalty))
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              duration_ms: duration,
              tasks_completed: tasksCompleted,
              tasks_failed: tasksFailed,
              tools_used: toolsUsed,
              errors,
              efficiency_score: efficiencyScore,
            }),
          },
        ],
      };
    }
  );

  // ── get_session_timeline ─────────────────────────────────────────────────
  server.tool(
    "get_session_timeline",
    "Returns chronological timeline of session events, most recent last.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe("Maximum number of events to return (default 50)"),
    },
    async ({ limit }) => {
      const halt = rateLimiter.check("get_session_timeline");
      if (halt) {
        return { content: [{ type: "text", text: halt }] };
      }

      const slice = sessionEvents.slice(-limit);
      const events = slice.map((e) => ({
        timestamp: e.ts,
        type: e.type,
        details: e.details,
        duration_ms: e.duration_ms,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              events,
              total_events: sessionEvents.length,
            }),
          },
        ],
      };
    }
  );

  // ── analyze_session_patterns ─────────────────────────────────────────────
  server.tool(
    "analyze_session_patterns",
    "Analyzes session behavior for patterns: loops, repeated errors, tool bursts, idle periods, productive runs. Returns patterns, recommendations, and health score.",
    {},
    async () => {
      const halt = rateLimiter.check("analyze_session_patterns");
      if (halt) {
        return { content: [{ type: "text", text: halt }] };
      }

      const patterns = [
        ...findIdlePeriods(),
        ...findRepeatedErrors(),
        ...findToolBursts(),
        ...findQuickFailures(),
        ...findProductivePeriods(),
      ];

      // Health score: start at 100, deduct for negative patterns, add for positive.
      let healthScore = 100;
      for (const p of patterns) {
        switch (p.type) {
          case "repeated_error":
            healthScore -= p.frequency * 8;
            break;
          case "tool_burst":
            healthScore -= p.frequency * 3;
            break;
          case "quick_failure":
            healthScore -= 10;
            break;
          case "idle":
            healthScore -= 5;
            break;
          case "productive_period":
            healthScore += p.frequency * 2;
            break;
        }
      }
      healthScore = Math.max(0, Math.min(100, healthScore));

      // Compute efficiency for recommendation generation
      let tasksCompleted = 0;
      let tasksFailed = 0;
      let errors = 0;
      for (const ev of sessionEvents) {
        if (ev.type === "task_complete") tasksCompleted++;
        else if (ev.type === "task_fail") tasksFailed++;
        else if (ev.type === "error") errors++;
      }
      const totalTasks = tasksCompleted + tasksFailed;
      const completionRatio = totalTasks > 0 ? tasksCompleted / totalTasks : 0.5;
      const errorPenalty = Math.min(30, (errors / Math.max(1, totalTasks)) * 100);
      const efficiencyScore = Math.round(
        Math.max(0, Math.min(100, completionRatio * 100 - errorPenalty))
      );

      const recommendations = buildRecommendations(patterns, efficiencyScore);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ patterns, recommendations, health_score: healthScore }),
          },
        ],
      };
    }
  );

  // ── export_session_report ────────────────────────────────────────────────
  server.tool(
    "export_session_report",
    "Exports a complete session report as JSON or Markdown, including summary, timeline, patterns, and recommendations.",
    {
      format: z
        .enum(["json", "markdown"])
        .describe("Output format: 'json' or 'markdown'"),
    },
    async ({ format }) => {
      const halt = rateLimiter.check("export_session_report");
      if (halt) {
        return { content: [{ type: "text", text: halt }] };
      }

      // Build summary
      const duration = elapsed();
      let tasksCompleted = 0;
      let tasksFailed = 0;
      let toolsUsed = 0;
      let errors = 0;
      for (const ev of sessionEvents) {
        switch (ev.type) {
          case "task_complete":
            tasksCompleted++;
            break;
          case "task_fail":
            tasksFailed++;
            break;
          case "tool_use":
            toolsUsed++;
            break;
          case "error":
            errors++;
            break;
        }
      }
      const totalTasks = tasksCompleted + tasksFailed;
      const completionRatio = totalTasks > 0 ? tasksCompleted / totalTasks : 0.5;
      const errorPenalty = Math.min(30, (errors / Math.max(1, totalTasks)) * 100);
      const efficiencyScore = Math.round(
        Math.max(0, Math.min(100, completionRatio * 100 - errorPenalty))
      );

      const summary = {
        duration_ms: duration,
        tasks_completed: tasksCompleted,
        tasks_failed: tasksFailed,
        tools_used: toolsUsed,
        errors,
        efficiency_score: efficiencyScore,
      };

      // Build timeline (all events)
      const timeline = {
        events: sessionEvents.map((e) => ({
          timestamp: e.ts,
          type: e.type,
          details: e.details,
          duration_ms: e.duration_ms,
        })),
        total_events: sessionEvents.length,
      };

      // Build patterns
      const patterns = [
        ...findIdlePeriods(),
        ...findRepeatedErrors(),
        ...findToolBursts(),
        ...findQuickFailures(),
        ...findProductivePeriods(),
      ];
      let healthScore = 100;
      for (const p of patterns) {
        switch (p.type) {
          case "repeated_error":
            healthScore -= p.frequency * 8;
            break;
          case "tool_burst":
            healthScore -= p.frequency * 3;
            break;
          case "quick_failure":
            healthScore -= 10;
            break;
          case "idle":
            healthScore -= 5;
            break;
          case "productive_period":
            healthScore += p.frequency * 2;
            break;
        }
      }
      healthScore = Math.max(0, Math.min(100, healthScore));

      const recommendations = buildRecommendations(patterns, efficiencyScore);

      const patternsResult = { patterns, recommendations, health_score: healthScore };

      let text;
      if (format === "json") {
        text = JSON.stringify({
          session_started: new Date(sessionStart).toISOString(),
          summary,
          timeline,
          patterns: patternsResult,
        });
      } else {
        text = formatMarkdownReport(summary, timeline, patternsResult, recommendations);
      }

      return {
        content: [{ type: "text", text }],
      };
    }
  );
}
