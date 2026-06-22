/**
 * Phase 2 GAP fixes regression tests.
 * GAP-2: Performance Metrics, GAP-11: Benchmarking, GAP-6: Context Manager, GAP-15: Session Analytics
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ─── GAP-2: Performance Metrics ────────────────────────────────────────────

describe('GAP-2: Performance Metrics', () => {
  it('should export registerPerfMetricsTools', async () => {
    const mod = await import('../src/perf-metrics.js');
    assert.ok(typeof mod.registerPerfMetricsTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/perf-metrics.js', 'utf8');
    assert.ok(src.includes('"track_tool_call"'), 'Missing track_tool_call');
    assert.ok(src.includes('"get_tool_metrics"'), 'Missing get_tool_metrics');
    assert.ok(src.includes('"get_performance_summary"'), 'Missing get_performance_summary');
    assert.ok(src.includes('"detect_performance_anomalies"'), 'Missing detect_performance_anomalies');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/perf-metrics.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('checkRateLimit'), 'Missing rate limiting');
  });

  it('should have try-catch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/perf-metrics.js', 'utf8');
    assert.ok(src.includes('try {'), 'Missing try-catch');
  });
});

// ─── GAP-11: Performance Benchmarking ──────────────────────────────────────

describe('GAP-11: Performance Benchmarking', () => {
  it('should export registerPerfBenchmarkTools', async () => {
    const mod = await import('../src/perf-benchmark.js');
    assert.ok(typeof mod.registerPerfBenchmarkTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/perf-benchmark.js', 'utf8');
    assert.ok(src.includes('"run_benchmark"'), 'Missing run_benchmark');
    assert.ok(src.includes('"compare_models"'), 'Missing compare_models');
    assert.ok(src.includes('"get_benchmark_history"'), 'Missing get_benchmark_history');
    assert.ok(src.includes('"recommend_model_for_task"'), 'Missing recommend_model_for_task');
  });
  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/perf-benchmark.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('checkRateLimit') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── GAP-6: Context Window Manager ─────────────────────────────────────────

describe('GAP-6: Context Window Manager', () => {
  it('should export registerContextManagerTools', async () => {
    const mod = await import('../src/context-manager.js');
    assert.ok(typeof mod.registerContextManagerTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/context-manager.js', 'utf8');
    assert.ok(src.includes('"estimate_tokens"'), 'Missing estimate_tokens');
    assert.ok(src.includes('"check_context_budget"'), 'Missing check_context_budget');
    assert.ok(src.includes('"suggest_compaction"'), 'Missing suggest_compaction');
    assert.ok(src.includes('"get_context_status"'), 'Missing get_context_status');
  });

  it('should use profiles for model limits', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/context-manager.js', 'utf8');
    assert.ok(src.includes('PROFILES') || src.includes('profiles'), 'Missing model profiles');
  });
});

// ─── GAP-15: Session Analytics ─────────────────────────────────────────────

describe('GAP-15: Session Analytics', () => {
  it('should export registerSessionAnalyticsTools', async () => {
    const mod = await import('../src/session-analytics.js');
    assert.ok(typeof mod.registerSessionAnalyticsTools === 'function');
  });

  it('should have all 5 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/session-analytics.js', 'utf8');
    assert.ok(src.includes('"track_session_event"'), 'Missing track_session_event');
    assert.ok(src.includes('"get_session_summary"'), 'Missing get_session_summary');
    assert.ok(src.includes('"get_session_timeline"'), 'Missing get_session_timeline');
    assert.ok(src.includes('"analyze_session_patterns"'), 'Missing analyze_session_patterns');
    assert.ok(src.includes('"export_session_report"'), 'Missing export_session_report');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/session-analytics.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('checkRateLimit') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── Integration: All Phase 2 in index.js ───────────────────────────────────

describe('Phase 2 Integration: All modules in index.js', () => {
  it('should import all 4 Phase 2 modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerPerfMetricsTools'), 'Missing PerfMetrics import');
    assert.ok(src.includes('registerPerfBenchmarkTools'), 'Missing PerfBenchmark import');
    assert.ok(src.includes('registerContextManagerTools'), 'Missing ContextManager import');
    assert.ok(src.includes('registerSessionAnalyticsTools'), 'Missing SessionAnalytics import');
  });

  it('should register all 4 Phase 2 modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerPerfMetricsTools(server)'), 'Missing PerfMetrics registration');
    assert.ok(src.includes('registerPerfBenchmarkTools(server)'), 'Missing PerfBenchmark registration');
    assert.ok(src.includes('registerContextManagerTools(server)'), 'Missing ContextManager registration');
    assert.ok(src.includes('registerSessionAnalyticsTools(server)'), 'Missing SessionAnalytics registration');
  });
});
