# src/observability/metrics.js

- kind: js
- lines: 166
- bytes: 6792

## Summary
Stack Perfeita MCP — Metrics (OpenTelemetry-inspired) Counters, histograms, and gauges for compression, council, and tool performance. Port of Headroom's headroom_otel_metrics.py pattern.

## Imports
- none

## Exports
- `metrics`

## Source
```js
/**
 * Stack Perfeita MCP — Metrics (OpenTelemetry-inspired)
 * Counters, histograms, and gauges for compression, council, and tool performance.
 * Port of Headroom's headroom_otel_metrics.py pattern.
 */

class Counter {
  #value = 0; #labels = {};
  constructor(name, labels = {}) { this.#labels = labels; }
  inc(n = 1) { this.#value += n; }
  reset() { this.#value = 0; }
  get value() { return this.#value; }
  get labels() { return this.#labels; }
}

class Histogram {
  #buckets = []; #sum = 0; #count = 0;
  constructor() { }
  observe(value) {
    this.#buckets.push(value);
    this.#sum += value;
    this.#count++;
  }
  reset() { this.#buckets = []; this.#sum = 0; this.#count = 0; }
  get mean() { return this.#count ? this.#sum / this.#count : 0; }
  get count() { return this.#count; }
  get p50() { return this.#percentile(0.5); }
  get p95() { return this.#percentile(0.95); }
  get p99() { return this.#percentile(0.99); }
  #percentile(p) {
    if (!this.#buckets.length) return 0;
    const sorted = [...this.#buckets].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[idx] || 0;
  }
}

class Gauge {
  #value = 0;
  constructor() { }
  set(v) { this.#value = v; }
  inc(n = 1) { this.#value += n; }
  dec(n = 1) { this.#value -= n; }
  reset() { this.#value = 0; }
  get value() { return this.#value; }
}

/**
 * Magnifiqe metrics registry.
 * Tracks compression, council, tools, and TTSR performance.
 */
class MagnifiqeMetrics {
  // ─── Compression Counters ──────────────────────────────────────────────
  compressionRuns = new Counter("magnifiqe.compression.runs");
  compressionTokensInput = new Counter("magnifiqe.compression.tokens.input");
  compressionTokensOutput = new Counter("magnifiqe.compression.tokens.output");
  compressionTokensSaved = new Counter("magnifiqe.compression.tokens.saved");
  compressionLevelLossless = new Counter("magnifiqe.compression.level", { level: "lossless" });
  compressionLevelStructural = new Counter("magnifiqe.compression.level", { level: "structural" });
  compressionLevelSemantic = new Counter("magnifiqe.compression.level", { level: "semantic" });
  compressionLevelAggressive = new Counter("magnifiqe.compression.level", { level: "aggressive" });

  // ─── Tool Counters ─────────────────────────────────────────────────────
  toolCalls = new Counter("magnifiqe.tool.calls");
  toolHalts = new Counter("magnifiqe.tool.halts");
  toolErrors = new Counter("magnifiqe.tool.errors");

  // ─── Council Counters ──────────────────────────────────────────────────
  councilGateScored = new Counter("magnifiqe.council.gate_scored");
  councilSessionsCreated = new Counter("magnifiqe.council.sessions_created");
  councilSynthesisCompleted = new Counter("magnifiqe.council.synthesis_completed");

  // ─── TTSR Counters ─────────────────────────────────────────────────────
  ttsrTriggers = new Counter("magnifiqe.ttsr.triggers");
  ttsrAborts = new Counter("magnifiqe.ttsr.aborts");

  // ─── Histograms ────────────────────────────────────────────────────────
  requestDuration = new Histogram("magnifiqe.request.duration_ms");
  compressionDuration = new Histogram("magnifiqe.compression.duration_ms");
  councilDuration = new Histogram("magnifiqe.council.duration_ms");
  codeParseDuration = new Histogram("magnifiqe.code_read.parse_ms");

  // ─── Gauges ────────────────────────────────────────────────────────────
  stateSizeChars = new Gauge("magnifiqe.state.size_chars");
  memoryObservations = new Gauge("magnifiqe.memory.observations");
  activeCouncilSessions = new Gauge("magnifiqe.council.active_sessions");
  cacheEntries = new Gauge("magnifiqe.compression.cache_entries");

  /**
   * Record a compression pipeline run.
   * @param {object} opts
   * @param {number} opts.tokensBefore
   * @param {number} opts.tokensAfter
   * @param {number} opts.durationMs
   * @param {string} [opts.level]
   */
  recordCompression({ tokensBefore, tokensAfter, durationMs, level }) {
    this.compressionRuns.inc();
    this.compressionTokensInput.inc(tokensBefore);
    this.compressionTokensOutput.inc(tokensAfter);
    this.compressionTokensSaved.inc(tokensBefore - tokensAfter);
    this.compressionDuration.observe(durationMs);
    if (level === "lossless") this.compressionLevelLossless.inc();
    else if (level === "structural") this.compressionLevelStructural.inc();
    else if (level === "semantic") this.compressionLevelSemantic.inc();
    else if (level === "aggressive") this.compressionLevelAggressive.inc();
  }

  /**
   * Record a tool call.
   * @param {string} toolName
   * @param {boolean} [halted=false]
   * @param {boolean} [errored=false]
   */
  recordToolCall(toolName, halted = false, errored = false) {
    this.toolCalls.inc();
    if (halted) this.toolHalts.inc();
    if (errored) this.toolErrors.inc();
  }

  /**
   * Export all metrics as a flat object (for JSON serialization).
   * @returns {object}
   */
  export() {
    return {
      compression: {
        runs: this.compressionRuns.value,
        tokensSaved: this.compressionTokensSaved.value,
        avgDurationMs: this.compressionDuration.mean,
      },
      tools: {
        calls: this.toolCalls.value,
        halts: this.toolHalts.value,
        errors: this.toolErrors.value,
      },
      council: {
        gateScored: this.councilGateScored.value,
        sessions: this.councilSessionsCreated.value,
        synthesis: this.councilSynthesisCompleted.value,
      },
      ttsr: {
        triggers: this.ttsrTriggers.value,
        aborts: this.ttsrAborts.value,
      },
      gauges: {
        stateSizeChars: this.stateSizeChars.value,
        memoryObservations: this.memoryObservations.value,
        activeCouncilSessions: this.activeCouncilSessions.value,
        cacheEntries: this.cacheEntries.value,
      },
    };
  }

  /** Reset all metrics */
  reset() {
    for (const key of Object.keys(this)) {
      const metric = this[key];
      if (typeof metric?.reset === "function") metric.reset();
    }
  }
}

/** Singleton metrics instance */
export const metrics = new MagnifiqeMetrics();

```
