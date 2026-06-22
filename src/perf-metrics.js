/**
 * Stack Perfeita MCP — Performance Metrics
 * Token counting, latency tracking, success rate per tool.
 * Circular buffer (max 500 records), per-tool aggregates, anomaly detection.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Internal State ─────────────────────────────────────────────────────────

const MAX_RECORDS = 500;
const callRecords = [];
const toolAggregates = new Map();
const sessionStart = Date.now();

/**
 * @typedef {Object} CallRecord
 * @property {string} tool
 * @property {number} durationMs
 * @property {boolean} success
 * @property {number} tokens
 * @property {number} timestamp
 */

/**
 * @typedef {Object} ToolAggregate
 * @property {number} calls
 * @property {number} totalDurationMs
 * @property {number} successCount
 * @property {number} totalTokens
 * @property {number[]} durations   // sorted on demand for percentile calc
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function createAggregate() {
  return { calls: 0, totalDurationMs: 0, successCount: 0, totalTokens: 0, durations: [] };
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil(p * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

function cutoffTimestamp(period) {
  const now = Date.now();
  if (period === "last_hour") return now - 3600_000;
  if (period === "last_day") return now - 86400_000;
  return 0; // "session" = everything
}

function filterRecords(period) {
  const cutoff = cutoffTimestamp(period);
  return callRecords.filter((r) => r.timestamp >= cutoff);
}

function buildToolMetrics(records) {
  const map = new Map();
  for (const rec of records) {
    let agg = map.get(rec.tool);
    if (!agg) {
      agg = createAggregate();
      map.set(rec.tool, agg);
    }
    agg.calls++;
    agg.totalDurationMs += rec.durationMs;
    if (rec.success) agg.successCount++;
    agg.totalTokens += rec.tokens;
    agg.durations.push(rec.durationMs);
  }

  const result = [];
  for (const [name, agg] of map) {
    agg.durations.sort((a, b) => a - b);
    result.push({
      name,
      calls: agg.calls,
      avg_duration_ms: Math.round(agg.totalDurationMs / agg.calls),
      p95_duration_ms: Math.round(percentile(agg.durations, 0.95)),
      success_rate: Number((agg.successCount / agg.calls).toFixed(4)),
      total_tokens: agg.totalTokens,
    });
  }
  return result;
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerPerfMetricsTools(server) {
  // 1. track_tool_call
  server.tool(
    "track_tool_call",
    "Records a tool call with metrics. Called after each significant tool use to maintain performance tracking.",
    {
      tool_name: z.string().describe("Name of the tool that was called."),
      duration_ms: z.number().min(0).describe("Duration of the tool call in milliseconds."),
      success: z.boolean().describe("Whether the tool call succeeded."),
      token_count: z.number().min(0).optional().default(0).describe("Number of tokens consumed (optional)."),
    },
    async ({ tool_name, duration_ms, success, token_count }) => {
      const rateLimitHit = rateLimiter.check("track_tool_call");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        // Append to circular buffer
        const record = {
          tool: tool_name,
          durationMs: duration_ms,
          success,
          tokens: token_count,
          timestamp: Date.now(),
        };

        callRecords.push(record);
        if (callRecords.length > MAX_RECORDS) {
          callRecords.shift();
        }

        // Update per-tool aggregates
        let agg = toolAggregates.get(tool_name);
        if (!agg) {
          agg = createAggregate();
          toolAggregates.set(tool_name, agg);
        }
        agg.calls++;
        agg.totalDurationMs += duration_ms;
        if (success) agg.successCount++;
        agg.totalTokens += token_count;
        agg.durations.push(duration_ms);

        const avgDuration = Math.round(agg.totalDurationMs / agg.calls);
        const successRate = Number((agg.successCount / agg.calls).toFixed(4));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                recorded: true,
                tool: tool_name,
                avg_duration_ms: avgDuration,
                success_rate: successRate,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT \u2014 track_tool_call error: ${e.message}` }],
        };
      }
    }
  );

  // 2. get_tool_metrics
  server.tool(
    "get_tool_metrics",
    "Returns performance metrics for a specific tool or all tools, filtered by time period.",
    {
      tool_name: z.string().optional().describe("Tool name to filter by. Omit to return all tools."),
      period: z.enum(["session", "last_hour", "last_day"]).default("session").describe("Time window to aggregate over."),
    },
    async ({ tool_name, period }) => {
      const rateLimitHit = rateLimiter.check("get_tool_metrics");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const records = filterRecords(period);
        const allMetrics = buildToolMetrics(records);

        let tools = allMetrics;
        if (tool_name) {
          tools = allMetrics.filter((m) => m.name === tool_name);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ tools }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT \u2014 get_tool_metrics error: ${e.message}` }],
        };
      }
    }
  );

  // 3. get_performance_summary
  server.tool(
    "get_performance_summary",
    "High-level performance dashboard: total calls, success rate, slowest/fastest tools, token usage, uptime.",
    {},
    async () => {
      const rateLimitHit = rateLimiter.check("get_performance_summary");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const metrics = buildToolMetrics(callRecords);
        const totalCalls = callRecords.length;
        const successCount = callRecords.filter((r) => r.success).length;
        const overallSuccessRate = totalCalls > 0 ? Number((successCount / totalCalls).toFixed(4)) : 0;
        const totalTokens = callRecords.reduce((sum, r) => sum + r.tokens, 0);
        const uptimeMs = Date.now() - sessionStart;

        // Sort by avg_duration_ms for slowest/fastest
        const sorted = [...metrics].sort((a, b) => b.avg_duration_ms - a.avg_duration_ms);
        const slowest = sorted.slice(0, 3).map((m) => m.name);
        const fastest = sorted.slice(-3).reverse().map((m) => m.name);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total_calls: totalCalls,
                overall_success_rate: overallSuccessRate,
                slowest_tools: slowest,
                fastest_tools: fastest,
                token_usage: totalTokens,
                uptime_ms: uptimeMs,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT \u2014 get_performance_summary error: ${e.message}` }],
        };
      }
    }
  );

  // 4. detect_performance_anomalies
  server.tool(
    "detect_performance_anomalies",
    "Detects tools with degraded performance (high latency, low success rate) and suggests fixes.",
    {
      threshold_ms: z.number().min(0).default(5000).describe("Latency threshold in ms. Tools above this are flagged."),
      success_rate_min: z.number().min(0).max(1).default(0.8).describe("Minimum acceptable success rate (0-1)."),
    },
    async ({ threshold_ms, success_rate_min }) => {
      const rateLimitHit = rateLimiter.check("detect_performance_anomalies");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const metrics = buildToolMetrics(callRecords);
        const anomalies = [];
        const recommendations = [];

        for (const m of metrics) {
          if (m.avg_duration_ms > threshold_ms) {
            anomalies.push({
              tool: m.name,
              issue: "high_latency",
              metric: `${m.avg_duration_ms}ms avg (threshold: ${threshold_ms}ms)`,
            });
            recommendations.push(`Tool "${m.name}" is slow (avg ${m.avg_duration_ms}ms). Consider caching or reducing input size.`);
          }

          if (m.calls >= 3 && m.success_rate < success_rate_min) {
            anomalies.push({
              tool: m.name,
              issue: "low_success_rate",
              metric: `${(m.success_rate * 100).toFixed(1)}% success (min: ${(success_rate_min * 100).toFixed(1)}%)`,
            });
            recommendations.push(`Tool "${m.name}" has ${(m.success_rate * 100).toFixed(1)}% success rate. Review error handling or input validation.`);
          }
        }

        if (anomalies.length === 0) {
          recommendations.push("No anomalies detected. All tools are performing within thresholds.");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ anomalies, recommendations }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT \u2014 detect_performance_anomalies error: ${e.message}` }],
        };
      }
    }
  );
}
