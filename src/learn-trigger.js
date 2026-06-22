/**
 * Stack Perfeita MCP — Learn Trigger
 * Periodic and on-demand triggers for the headroom_learn cycle.
 * Scans .claude/ sessions, analyzes patterns, writes recommendations.
 */

import { analyzeSessions } from "./learn/analyzer.js";
import { writeRecommendations, formatRecommendationSummary } from "./learn/writer.js";
import { PROJECT_ROOT, MEMORY_FILE } from "./config.js";
import { join } from "path";

export class LearnTrigger {
  #interval = null;
  #running = false;
  #lastRun = null;
  #runCount = 0;
  #lastResult = null;

  constructor({ claudeDir, memoryFile, intervalMs } = {}) {
    this.claudeDir = claudeDir ?? join(PROJECT_ROOT, ".claude");
    this.memoryFile = memoryFile ?? MEMORY_FILE;
    this.intervalMs = intervalMs ?? 300_000;
  }

  start() {
    if (this.#interval !== null) return this;
    this.#interval = setInterval(() => { this.runCycle().catch(() => {}); }, this.intervalMs);
    this.#interval.unref();
    return this;
  }

  stop() {
    if (this.#interval === null) return this;
    clearInterval(this.#interval);
    this.#interval = null;
    return this;
  }

  async runCycle() {
    if (this.#running) return { skipped: true, reason: "already running" };

    this.#running = true;
    try {
      const result = analyzeSessions(this.claudeDir);

      if (result.totalSessions === 0) {
        this.#running = false;
        return { skipped: true, reason: "no sessions" };
      }

      const recommendations = result.recommendations;
      const written = writeRecommendations(this.memoryFile, recommendations);

      this.#lastRun = new Date().toISOString();
      this.#runCount++;
      this.#lastResult = {
        success: true,
        sessions: result.totalSessions,
        errors: result.totalErrors,
        recommendationsWritten: written,
      };
      this.#running = false;

      return {
        success: true,
        sessions: result.totalSessions,
        errors: result.totalErrors,
        recommendationsWritten: written,
        summary: formatRecommendationSummary(recommendations),
      };
    } catch (error) {
      this.#running = false;
      return { success: false, error: error.message };
    }
  }

  getStatus() {
    return {
      active: this.#interval !== null,
      running: this.#running,
      lastRun: this.#lastRun,
      runCount: this.#runCount,
      lastResult: this.#lastResult,
    };
  }
}

export const learnTrigger = new LearnTrigger({});

export function registerLearnTools(server) {
  // ── headroom_learn_run ────────────────────────────────────────────────
  server.tool(
    "headroom_learn_run",
    "Manually triggers the headroom_learn cycle. Scans .claude/ sessions, analyzes patterns, and writes learned recommendations to session memory. Returns the cycle result.",
    {},
    async () => {
      try {
        const result = await learnTrigger.runCycle();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `HALT — Error running learn cycle: ${error.message}` }] };
      }
    }
  );

  // ── headroom_learn_status ─────────────────────────────────────────────
  server.tool(
    "headroom_learn_status",
    "Returns learn trigger status: whether the periodic cycle is active, if a cycle is currently running, last run timestamp, total run count, and last result.",
    {},
    async () => {
      try {
        const status = learnTrigger.getStatus();
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `HALT — Error getting learn status: ${error.message}` }] };
      }
    }
  );
}
