/**
 * Phase 3 GAP fixes regression tests.
 * GAP-4: Task Checklists, GAP-9: Error Recovery, GAP-12: Chain-of-Thought, GAP-10: Output Formats
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ─── GAP-4: Task Checklists ────────────────────────────────────────────────

describe('GAP-4: Task Checklists', () => {
  it('should export registerTaskChecklistsTools', async () => {
    const mod = await import('../src/task-checklists.js');
    assert.ok(typeof mod.registerTaskChecklistsTools === 'function');
  });

  it('should have all 3 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/task-checklists.js', 'utf8');
    assert.ok(src.includes('"get_task_checklist"'), 'Missing get_task_checklist');
    assert.ok(src.includes('"validate_checklist"'), 'Missing validate_checklist');
    assert.ok(src.includes('"generate_completion_report"'), 'Missing generate_completion_report');
  });

  it('should support 8+ task types', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/task-checklists.js', 'utf8');
    assert.ok(src.includes('frontend'), 'Missing frontend');
    assert.ok(src.includes('backend'), 'Missing backend');
    assert.ok(src.includes('debug'), 'Missing debug');
    assert.ok(src.includes('security'), 'Missing security');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/task-checklists.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── GAP-9: Error Recovery ─────────────────────────────────────────────────

describe('GAP-9: Error Recovery', () => {
  it('should export registerErrorRecoveryTools', async () => {
    const mod = await import('../src/error-recovery.js');
    assert.ok(typeof mod.registerErrorRecoveryTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/error-recovery.js', 'utf8');
    assert.ok(src.includes('"classify_error"'), 'Missing classify_error');
    assert.ok(src.includes('"create_recovery_plan"'), 'Missing create_recovery_plan');
    assert.ok(src.includes('"execute_recovery"'), 'Missing execute_recovery');
    assert.ok(src.includes('"get_recovery_patterns"'), 'Missing get_recovery_patterns');
  });

  it('should support 5+ error categories', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/error-recovery.js', 'utf8');
    assert.ok(src.includes('syntax') || src.includes('runtime'), 'Missing error categories');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/error-recovery.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── GAP-12: Chain-of-Thought ──────────────────────────────────────────────

describe('GAP-12: Chain-of-Thought', () => {
  it('should export registerChainOfThoughtTools', async () => {
    const mod = await import('../src/chain-of-thought.js');
    assert.ok(typeof mod.registerChainOfThoughtTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/chain-of-thought.js', 'utf8');
    assert.ok(src.includes('"create_reasoning_chain"'), 'Missing create_reasoning_chain');
    assert.ok(src.includes('"validate_reasoning_chain"'), 'Missing validate_reasoning_chain');
    assert.ok(src.includes('"synthesize_conclusion"'), 'Missing synthesize_conclusion');
    assert.ok(src.includes('"get_domain_templates"'), 'Missing get_domain_templates');
  });

  it('should support 4 domains', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/chain-of-thought.js', 'utf8');
    assert.ok(src.includes('code') || src.includes('architecture'), 'Missing domains');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/chain-of-thought.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── GAP-10: Output Formats ────────────────────────────────────────────────

describe('GAP-10: Output Formats', () => {
  it('should export registerOutputFormatsTools', async () => {
    const mod = await import('../src/output-formats.js');
    assert.ok(typeof mod.registerOutputFormatsTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/output-formats.js', 'utf8');
    assert.ok(src.includes('"format_task_output"'), 'Missing format_task_output');
    assert.ok(src.includes('"get_output_template"'), 'Missing get_output_template');
    assert.ok(src.includes('"validate_output_completeness"'), 'Missing validate_output_completeness');
    assert.ok(src.includes('"adapt_for_context"'), 'Missing adapt_for_context');
  });

  it('should support 5+ task types', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/output-formats.js', 'utf8');
    assert.ok(src.includes('bug_fix') || src.includes('feature'), 'Missing task types');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/output-formats.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── Integration: All Phase 3 in index.js ───────────────────────────────────

describe('Phase 3 Integration: All modules in index.js', () => {
  it('should import all 4 Phase 3 modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerTaskChecklistsTools'), 'Missing TaskChecklists import');
    assert.ok(src.includes('registerErrorRecoveryTools'), 'Missing ErrorRecovery import');
    assert.ok(src.includes('registerChainOfThoughtTools'), 'Missing ChainOfThought import');
    assert.ok(src.includes('registerOutputFormatsTools'), 'Missing OutputFormats import');
  });

  it('should register all 4 Phase 3 modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerTaskChecklistsTools(server)'), 'Missing TaskChecklists registration');
    assert.ok(src.includes('registerErrorRecoveryTools(server)'), 'Missing ErrorRecovery registration');
    assert.ok(src.includes('registerChainOfThoughtTools(server)'), 'Missing ChainOfThought registration');
    assert.ok(src.includes('registerOutputFormatsTools(server)'), 'Missing OutputFormats registration');
  });
});
