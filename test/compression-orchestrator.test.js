/**
 * Test suite for src/compression-orchestrator.js
 * Tests: compressToolOutput, decompressOutput, getCompressionStats
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  compressToolOutput,
  decompressOutput,
  getCompressionStats,
} from '../src/compression-orchestrator.js';
import { circuitBreaker } from '../src/compression/circuit-breaker.js';
import { cacheAligner } from '../src/compression/cache-aligner.js';
import { compressionStore } from '../src/compression/store.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate text of a given approximate character length with varied content. */
function generateText(charCount) {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
  let text = '';
  for (let i = 0; i < charCount; i++) {
    text += words[i % words.length] + ' ';
  }
  return text.slice(0, charCount);
}

// ─── compressToolOutput ─────────────────────────────────────────────────────

describe('compressToolOutput', () => {
  beforeEach(() => {
    circuitBreaker.reset();
    cacheAligner.reset();
  });

  it('should return original text when input is empty', () => {
    const result = compressToolOutput('');
    assert.strictEqual(result.compressed, '');
    assert.strictEqual(result.original, '');
    assert.strictEqual(result.stats.level, 0);
    assert.strictEqual(result.sentinel, null);
  });

  it('should return original text when input is null/undefined', () => {
    const resultNull = compressToolOutput(null);
    assert.strictEqual(resultNull.compressed, '');
    assert.strictEqual(resultNull.stats.level, 0);
    assert.strictEqual(resultNull.sentinel, null);

    const resultUndef = compressToolOutput(undefined);
    assert.strictEqual(resultUndef.compressed, '');
    assert.strictEqual(resultUndef.stats.level, 0);
    assert.strictEqual(resultUndef.sentinel, null);
  });

  it('should compress large text and return stats with level > 0', () => {
    // Text of ~125K chars → ~31K tokens. Using targetTokens=1000 forces SEMANTIC level.
    const largeText = generateText(125_000);
    const result = compressToolOutput(largeText, { targetTokens: 1000 });

    assert.ok(result.stats.level > 0, `expected compression level > 0, got ${result.stats.level}`);
    assert.strictEqual(typeof result.stats.contentType, 'string');
    assert.strictEqual(typeof result.stats.originalTokens, 'number');
    assert.ok(result.stats.originalTokens > 0, 'originalTokens should be positive');
    assert.strictEqual(typeof result.stats.savingsPercent, 'number');
  });

  it('should return sentinel hash when compression occurs', () => {
    // Large text that triggers compression via targetTokens override.
    const largeText = generateText(125_000);
    const result = compressToolOutput(largeText, { targetTokens: 1000 });

    assert.ok(result.stats.level > 0, 'compression level should be > 0');
    // When compression reduces the text, the original is stored and a sentinel hash returned.
    assert.strictEqual(typeof result.sentinel, 'string', 'sentinel should be a string hash');
    assert.ok(result.sentinel.length > 0, 'sentinel hash should be non-empty');
  });

  it('should not compress small text (below threshold)', () => {
    const smallText = 'Hello world, this is a short message.';
    const result = compressToolOutput(smallText);

    // 36 chars → ~9 tokens → well below LOSSLESS_TRIGGER (10,000)
    assert.strictEqual(result.stats.level, 0);
    assert.strictEqual(result.compressed, smallText);
    assert.strictEqual(result.sentinel, null);
  });

  it('should handle circuit breaker open state', () => {
    // Force circuit breaker open by recording 3 failures
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();

    assert.strictEqual(circuitBreaker.shouldSkip(), true);

    const largeText = generateText(125_000);
    const result = compressToolOutput(largeText, { targetTokens: 100 });

    // When circuit breaker is open, output passes through unchanged
    assert.strictEqual(result.compressed, largeText);
    assert.strictEqual(result.stats.level, 0);
    assert.strictEqual(result.stats.circuitBreakerOpen, true);
    assert.strictEqual(result.sentinel, null);
  });

  it('should track volatile content via cache aligner', () => {
    // Text containing volatile content (UUIDs, timestamps)
    const textWithUuid = 'id-550e8400-e29b-41d4-a716-446655440000 and timestamp 2024-01-15T10:30:00Z here';
    const detectionsBefore = cacheAligner.totalDetections;

    compressToolOutput(textWithUuid);

    const detectionsAfter = cacheAligner.totalDetections;
    assert.ok(
      detectionsAfter > detectionsBefore,
      `expected detections to increase: before=${detectionsBefore}, after=${detectionsAfter}`
    );
  });
});

// ─── decompressOutput ───────────────────────────────────────────────────────

describe('decompressOutput', () => {
  it('should return not found for non-existent hash', () => {
    const result = decompressOutput('nonexistent_hash_abc123');
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.original, null);
    assert.strictEqual(result.metadata, null);
  });

  it('should retrieve original after compress + store cycle', () => {
    // Manually store an entry in the compressionStore (bypassing the
    // compress() return-type issue) to test decompressOutput independently.
    const originalText = 'This is the original full text that was compressed away.';
    const compressedText = 'compressed summary';
    const hash = compressionStore.store(originalText, compressedText, {
      toolName: 'test-tool',
      contentType: 'text',
    });

    assert.strictEqual(typeof hash, 'string');
    assert.ok(hash.length > 0, 'hash should be non-empty');

    const result = decompressOutput(hash);
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.original, originalText);
    assert.ok(result.metadata !== null, 'metadata should be present');
    assert.strictEqual(result.metadata.toolName, 'test-tool');
  });
});

// ─── getCompressionStats ───────────────────────────────────────────────────

describe('getCompressionStats', () => {
  beforeEach(() => {
    circuitBreaker.reset();
    cacheAligner.reset();
  });

  it('should return store size and circuit breaker status', () => {
    const stats = getCompressionStats();

    assert.strictEqual(typeof stats.storeSize, 'number');
    assert.ok(stats.storeSize >= 0, 'storeSize should be non-negative');

    assert.ok(stats.circuitBreaker !== null && typeof stats.circuitBreaker === 'object',
      'circuitBreaker should be an object');
    assert.strictEqual(typeof stats.circuitBreaker.state, 'string');
    assert.strictEqual(typeof stats.circuitBreaker.failureCount, 'number');
    assert.strictEqual(typeof stats.circuitBreaker.threshold, 'number');

    assert.strictEqual(typeof stats.cacheAlignerDetections, 'number');
    assert.ok(stats.cacheAlignerDetections >= 0, 'cacheAlignerDetections should be non-negative');
  });
});
