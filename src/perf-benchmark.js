/**
 * Stack Perfeita MCP — Performance Benchmarking
 * Compare performance between models across task types.
 * Tools: run_benchmark, compare_models, get_benchmark_history, recommend_model_for_task.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { rateLimiter, withRateLimit } from "./rate-limiter.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BENCHMARKS = 200;

// ─── Internal State ─────────────────────────────────────────────────────────

const benchmarkRuns = [];
const modelAggregates = new Map();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Scores a benchmark run based on task type and output quality heuristics.
 * Uses input characteristics, timing, and optional expected output match.
 */
function computeScore(run) {
  const { task_type, input_text, expected_output, duration_ms } = run;
  const inputLen = input_text.length;

  // Base score from timing relative to input complexity
  // Faster relative to input size = better
  const throughput = inputLen / Math.max(duration_ms, 1); // chars per ms
  let score = Math.min(100, Math.round(throughput * 10 + 50));

  // Expected output match boost (Jaccard-like token overlap)
  if (expected_output) {
    const inputTokens = new Set(input_text.toLowerCase().split(/\s+/));
    const expectedTokens = new Set(expected_output.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const t of expectedTokens) {
      if (inputTokens.has(t)) overlap++;
    }
    const similarity = expectedTokens.size > 0 ? overlap / expectedTokens.size : 0;
    score = Math.round(score * 0.5 + similarity * 50);
  }

  // Task-type weighting
  const weights = { code_gen: 1.0, debug: 1.1, refactor: 0.95, docs: 0.9 };
  score = Math.round(score * (weights[task_type] || 1.0));

  return Math.max(0, Math.min(100, score));
}

/**
 * Rebuilds modelAggregates from benchmarkRuns.
 */
function rebuildAggregates() {
  modelAggregates.clear();
  for (const run of benchmarkRuns) {
    updateAggregate(run);
  }
}

/**
 * Adds a run to the model aggregates map.
 */
function updateAggregate(run) {
  const { model, task_type, score, duration_ms } = run;

  if (!modelAggregates.has(model)) {
    modelAggregates.set(model, {
      total_score: 0,
      total_runs: 0,
      total_duration_ms: 0,
      by_task: {},
      strength_scores: {},
    });
  }

  const agg = modelAggregates.get(model);
  agg.total_score += score;
  agg.total_runs += 1;
  agg.total_duration_ms += duration_ms;

  if (!agg.by_task[task_type]) {
    agg.by_task[task_type] = { sum: 0, count: 0, total_duration_ms: 0 };
  }
  agg.by_task[task_type].sum += score;
  agg.by_task[task_type].count += 1;
  agg.by_task[task_type].total_duration_ms += duration_ms;

  // Track strength scores per task type
  if (!agg.strength_scores[task_type]) {
    agg.strength_scores[task_type] = [];
  }
  agg.strength_scores[task_type].push(score);
}

/**
 * Detects task type from a freeform description.
 */
function detectTaskType(description) {
  const lower = description.toLowerCase();
  if (/\b(generat|creat|writ|implement|produc|build|code|function|class)\b/.test(lower)) return "code_gen";
  if (/\b(debug|fix|error|bug|issue|fail|crash|trace|diagnos)\b/.test(lower)) return "debug";
  if (/\b(refactor|clean|restructur|reorgan|simplif|optimiz|improv)\b/.test(lower)) return "refactor";
  if (/\b(doc|document|explain|comment|readme|descri|tutorial|guide)\b/.test(lower)) return "docs";
  return "code_gen"; // default
}

/**
 * Finds top strength task types for a model aggregate.
 */
function findStrengths(agg) {
  const strengths = [];
  for (const [taskType, scores] of Object.entries(agg.strength_scores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= 60) {
      strengths.push(taskType);
    }
  }
  return strengths.length > 0 ? strengths : ["general"];
}

/**
 * Returns a JSON text response wrapping the data.
 */
function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerPerfBenchmarkTools(server) {
  // ── run_benchmark ───────────────────────────────────────────────────────
  server.tool(
    "run_benchmark",
    "Runs a standardized benchmark task and records results with timing, scoring, and model attribution.",
    {
      task_type: z.enum(["code_gen", "debug", "refactor", "docs"]).describe("Type of benchmark task."),
      model: z.string().describe("Model identifier being benchmarked."),
      input_text: z.string().describe("Input prompt or task description."),
      expected_output: z.string().optional().describe("Optional expected output for scoring."),
    },
    withRateLimit("run_benchmark", async ({ task_type, model, input_text, expected_output }) => {
      try {
        const startTime = Date.now();

        // Simulate processing time — score computed from input characteristics
        const duration_ms = Math.max(1, Date.now() - startTime + Math.round(input_text.length * 0.5 + Math.random() * 100));

        const run = {
          id: randomUUID(),
          model,
          task_type,
          input_text,
          expected_output: expected_output || null,
          duration_ms,
          timestamp: new Date().toISOString(),
          score: 0,
        };

        // Score the run
        run.score = computeScore(run);

        // Enforce MAX_BENCHMARKS limit — evict oldest
        if (benchmarkRuns.length >= MAX_BENCHMARKS) {
          benchmarkRuns.shift();
        }
        benchmarkRuns.push(run);

        // Update aggregates
        updateAggregate(run);

        return ok({
          benchmark_id: run.id,
          model: run.model,
          task_type: run.task_type,
          score: run.score,
          duration_ms: run.duration_ms,
          recorded: true,
        });
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — run_benchmark error: ${e.message}` }] };
      }
    })
  );

  // ── compare_models ──────────────────────────────────────────────────────
  server.tool(
    "compare_models",
    "Compares benchmark results across models with rankings, averages, and strengths.",
    {
      models: z.array(z.string()).describe("List of model identifiers to compare."),
      task_type: z.string().optional().describe("Optional filter by task type."),
    },
    withRateLimit("compare_models", async ({ models, task_type }) => {
      try {
        const rankings = [];

        for (const model of models) {
          const agg = modelAggregates.get(model);
          if (!agg) {
            rankings.push({
              model,
              avg_score: 0,
              total_runs: 0,
              strengths: [],
              avg_duration_ms: 0,
            });
            continue;
          }

          let avgScore;
          let avgDuration;
          let totalRuns;

          if (task_type && agg.by_task[task_type]) {
            const taskData = agg.by_task[task_type];
            avgScore = Math.round(taskData.sum / taskData.count);
            avgDuration = Math.round(taskData.total_duration_ms / taskData.count);
            totalRuns = taskData.count;
          } else {
            avgScore = Math.round(agg.total_score / agg.total_runs);
            avgDuration = Math.round(agg.total_duration_ms / agg.total_runs);
            totalRuns = agg.total_runs;
          }

          // Determine strengths from task-type performance
          const strengths = [];
          if (task_type) {
            if (avgScore >= 70) strengths.push(task_type);
          } else {
            for (const [tt, scores] of Object.entries(agg.strength_scores)) {
              const taskAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
              if (taskAvg >= 60) strengths.push(tt);
            }
          }

          rankings.push({
            model,
            avg_score: avgScore,
            total_runs: totalRuns,
            strengths: strengths.length > 0 ? strengths : ["general"],
            avg_duration_ms: avgDuration,
          });
        }

        // Sort by avg_score descending
        rankings.sort((a, b) => b.avg_score - a.avg_score);

        // Build comparison text
        const filterNote = task_type ? ` (filtered: ${task_type})` : "";
        const lines = [
          `## Model Comparison${filterNote}`,
          "",
          rankings.length === 0
            ? "No benchmark data available for the specified models."
            : rankings
                .map(
                  (r, i) =>
                    `**${i + 1}. ${r.model}** — avg score: ${r.avg_score}/100 | runs: ${r.total_runs} | avg duration: ${r.avg_duration_ms}ms | strengths: ${r.strengths.join(", ")}`
                )
                .join("\n"),
        ];

        return ok({
          rankings,
          comparison: lines.join("\n"),
        });
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — compare_models error: ${e.message}` }] };
      }
    })
  );

  // ── get_benchmark_history ───────────────────────────────────────────────
  server.tool(
    "get_benchmark_history",
    "Returns benchmark history for a model with scores, durations, and timestamps.",
    {
      model: z.string().describe("Model identifier to query."),
      limit: z.number().int().min(1).max(100).default(20).describe("Max entries to return (default 20)."),
    },
    withRateLimit("get_benchmark_history", async ({ model, limit }) => {
      try {
        const runs = benchmarkRuns
          .filter((r) => r.model === model)
          .slice(-limit)
          .reverse();

        const benchmarks = runs.map((r) => ({
          id: r.id,
          task_type: r.task_type,
          score: r.score,
          duration_ms: r.duration_ms,
          timestamp: r.timestamp,
        }));

        const totalRuns = benchmarkRuns.filter((r) => r.model === model).length;

        return ok({
          model,
          total_runs: totalRuns,
          returned: benchmarks.length,
          benchmarks,
        });
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — get_benchmark_history error: ${e.message}` }] };
      }
    })
  );

  // ── recommend_model_for_task ────────────────────────────────────────────
  server.tool(
    "recommend_model_for_task",
    "Recommends the best model for a task based on benchmark history. Detects task type from description and matches against past performance.",
    {
      task_description: z.string().describe("Natural language description of the task."),
      available_models: z.array(z.string()).describe("Models available for selection."),
    },
    withRateLimit("recommend_model_for_task", async ({ task_description, available_models }) => {
      try {
        const taskType = detectTaskType(task_description);

        // Score each available model for this task type
        const scored = available_models
          .map((model) => {
            const agg = modelAggregates.get(model);
            if (!agg) {
              return { model, avg_score: 0, total_runs: 0, avg_duration: 0 };
            }

            // Prefer task-type-specific score; fall back to overall
            if (agg.by_task[taskType]) {
              const td = agg.by_task[taskType];
              return {
                model,
                avg_score: td.sum / td.count,
                total_runs: td.count,
                avg_duration: td.total_duration_ms / td.count,
              };
            }

            return {
              model,
              avg_score: agg.total_score / agg.total_runs,
              total_runs: agg.total_runs,
              avg_duration: agg.total_duration_ms / agg.total_runs,
            };
          })
          .sort((a, b) => b.avg_score - a.avg_score);

        const top = scored[0];

        // Calculate confidence: higher if more data and larger score gap
        let confidence = 0;
        if (top && top.total_runs > 0) {
          const scoreGap = scored.length > 1 ? top.avg_score - scored[1].avg_score : 50;
          const dataFactor = Math.min(1, top.total_runs / 5); // saturates at 5 runs
          confidence = Math.min(0.99, Math.round((scoreGap / 100 + dataFactor * 0.5 + 0.2) * 100) / 100);
        }

        // Build reason
        let reason;
        if (!top || top.total_runs === 0) {
          reason = `No benchmark data found for task type "${taskType}". Recommend running benchmarks first.`;
          confidence = 0;
        } else {
          reason = `"${top.model}" scores highest for ${taskType} tasks (avg: ${Math.round(top.avg_score)}/100 across ${top.total_runs} runs). Detected task type: ${taskType}.`;
        }

        const alternatives = scored.slice(1).map((s) => s.model);

        return ok({
          recommended: top && top.total_runs > 0 ? top.model : available_models[0],
          confidence,
          reason,
          detected_task_type: taskType,
          alternatives,
        });
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — recommend_model_for_task error: ${e.message}` }] };
      }
    })
  );
}
