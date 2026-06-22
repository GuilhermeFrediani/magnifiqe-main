/**
 * Test suite for src/rate-limiter.js
 * Tests: rate limit check, window reset
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { rateLimiter } from '../src/rate-limiter.js';

describe('rateLimiter', () => {
  beforeEach(() => {
    rateLimiter.counters = {};
  });

  it('should return null on first call', () => {
    const result = rateLimiter.check('test_tool');
    assert.strictEqual(result, null);
  });

  it('should allow calls within limit', () => {
    for (let i = 0; i < 10; i++) {
      const result = rateLimiter.check('test_tool');
      assert.strictEqual(result, null);
    }
  });

  it('should block after max calls', () => {
    for (let i = 0; i < 20; i++) {
      rateLimiter.check('test_tool');
    }
    const result = rateLimiter.check('test_tool');
    assert.ok(result.startsWith('HALT'));
    assert.ok(result.includes('rate limit'));
  });

  it('should track different tools independently', () => {
    for (let i = 0; i < 20; i++) {
      rateLimiter.check('tool_a');
    }
    const resultA = rateLimiter.check('tool_a');
    const resultB = rateLimiter.check('tool_b');
    assert.ok(resultA.startsWith('HALT'));
    assert.strictEqual(resultB, null);
  });

  it('should reset after window expires', async () => {
    rateLimiter.windowMs = 100; // 100ms for testing
    for (let i = 0; i < 20; i++) {
      rateLimiter.check('test_tool');
    }
    const result1 = rateLimiter.check('test_tool');
    assert.ok(result1.startsWith('HALT'));

    await new Promise(resolve => setTimeout(resolve, 150));

    const result2 = rateLimiter.check('test_tool');
    assert.strictEqual(result2, null);

    rateLimiter.windowMs = 60000; // Reset to default
  });
});
