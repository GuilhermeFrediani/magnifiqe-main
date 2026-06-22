/**
 * Test suite for src/safety-guards.js
 * Tests: checkRateLimit, trackOutput, isDuplicateOutput,
 *        trackToolCall, validateOutput
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  checkRateLimit,
  trackOutput,
  trackToolCall,
  resetLoopDetection,
  validateOutput,
} from '../src/safety-guards.js';

// ─── checkRateLimit ─────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('should return null for normal calls', () => {
    // Use a unique tool name to avoid per-tool rate limit accumulation
    const toolName = `normal_test_${Date.now()}`;
    const result = checkRateLimit(toolName);
    // Normal call should not be rate-limited
    assert.strictEqual(result, null);
  });

  it('should return HALT after exceeding global limit', () => {
    // The global limit is 100 calls/min. Call 101 times with unique tool names
    // to avoid per-tool rate limiting (per-tool limit is 20).
    let lastResult = null;
    for (let i = 0; i < 101; i++) {
      lastResult = checkRateLimit(`global_halt_test_${i}`);
    }
    // The 101st call should trigger the global HALT
    assert.ok(typeof lastResult === 'string', 'should return a HALT string');
    assert.ok(lastResult.includes('HALT'), `HALT message should contain "HALT": ${lastResult}`);
  });
});

// ─── trackOutput / isDuplicateOutput ────────────────────────────────────────

describe('trackOutput / isDuplicateOutput', () => {
  it('should return isDuplicate=false for first call', () => {
    const text = `unique_text_${Date.now()}_first`;
    const result = trackOutput(text, 'test-source');

    assert.strictEqual(typeof result.hash, 'string');
    assert.ok(result.hash.length > 0, 'hash should be non-empty');
    assert.strictEqual(result.isDuplicate, false);
    assert.strictEqual(result.duplicateCount, 1);
  });

  it('should return isDuplicate=true for duplicate output', () => {
    const text = `duplicate_text_${Date.now()}_same`;
    const first = trackOutput(text, 'test-source');
    const second = trackOutput(text, 'test-source');

    assert.strictEqual(first.isDuplicate, false);
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.duplicateCount, 2);
    assert.strictEqual(first.hash, second.hash, 'same text should produce same hash');
  });

  it('should return isDuplicate=false for different outputs', () => {
    const textA = `text_alpha_${Date.now()}`;
    const textB = `text_beta_${Date.now()}_different`;
    const resultA = trackOutput(textA, 'test-source');
    const resultB = trackOutput(textB, 'test-source');

    assert.strictEqual(resultA.isDuplicate, false);
    assert.strictEqual(resultB.isDuplicate, false);
    assert.notStrictEqual(resultA.hash, resultB.hash, 'different texts should produce different hashes');
  });
});


// ─── trackToolCall ──────────────────────────────────────────────────────────

describe('trackToolCall', () => {
  beforeEach(() => {
    resetLoopDetection();
  });

  it('should return isLoop=false for first calls', () => {
    const r1 = trackToolCall('test_tool_loop', { file: 'a.js' });
    assert.strictEqual(r1.isLoop, false);
    assert.strictEqual(r1.consecutiveCount, 1);
    assert.strictEqual(r1.message, null);

    const r2 = trackToolCall('test_tool_loop', { file: 'a.js' });
    assert.strictEqual(r2.isLoop, false);
    assert.strictEqual(r2.consecutiveCount, 2);
    assert.strictEqual(r2.message, null);
  });

  it('should return isLoop=true after 3 identical consecutive calls', () => {
    const params = { file: 'target.js', action: 'edit' };
    trackToolCall('loop_tool', params);
    trackToolCall('loop_tool', params);
    const r3 = trackToolCall('loop_tool', params);

    assert.strictEqual(r3.isLoop, true);
    assert.strictEqual(r3.consecutiveCount, 3);
    assert.ok(typeof r3.message === 'string', 'message should be a string');
    assert.ok(r3.message.includes('HALT'), `message should contain HALT: ${r3.message}`);
  });

  it('should reset consecutive count on different params', () => {
    trackToolCall('tool_reset', { file: 'a.js' });
    trackToolCall('tool_reset', { file: 'a.js' });

    // Different params break the consecutive streak
    const r3 = trackToolCall('tool_reset', { file: 'b.js' });
    assert.strictEqual(r3.isLoop, false);
    assert.strictEqual(r3.consecutiveCount, 1, 'consecutive count should reset to 1');

    // Now 2 more with b.js params — still under threshold
    const r4 = trackToolCall('tool_reset', { file: 'b.js' });
    assert.strictEqual(r4.isLoop, false);
    assert.strictEqual(r4.consecutiveCount, 2);
  });
});

// ─── validateOutput ────────────────────────────────────────────────────────

describe('validateOutput', () => {
  it('should return valid=true for normal text', () => {
    const text = 'The file was successfully written to disk. The operation completed in 42ms.';
    const result = validateOutput(text);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.issues, []);
  });

  it('should flag empty/trivial output', () => {
    const resultShort = validateOutput('ab');
    assert.strictEqual(resultShort.valid, false);
    assert.ok(resultShort.issues.some(i => i.includes('trivially short')),
      `should flag trivially short: ${JSON.stringify(resultShort.issues)}`);

    const resultNull = validateOutput(null);
    assert.strictEqual(resultNull.valid, false);
    assert.ok(resultNull.issues.some(i => i.includes('empty')),
      `should flag empty: ${JSON.stringify(resultNull.issues)}`);
  });

  it('should flag excessive word repetition', () => {
    // > 20 words with < 20% unique → repetition detected
    const repeated = Array(25).fill('error error error').join(' ');
    const result = validateOutput(repeated);

    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('repetition')),
      `should flag repetition: ${JSON.stringify(result.issues)}`);
  });

  it('should flag hallucination markers', () => {
    const text = "I don't have access to the file system so I can't read the file.";
    const result = validateOutput(text);

    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('hallucination')),
      `should flag hallucination: ${JSON.stringify(result.issues)}`);
  });

  it('should flag uncertainty markers', () => {
    const text = 'This function should be implemented. TODO: implement the caching layer.';
    const result = validateOutput(text);

    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('Uncertainty')),
      `should flag uncertainty: ${JSON.stringify(result.issues)}`);
  });
});
