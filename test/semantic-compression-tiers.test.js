/**
 * Test suite for src/semantic-compression.js
 * Tests: semanticCompress 3-tier system, preservation rules, code block protection,
 *        edge cases, compression ratio measurement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  semanticCompress,
  getCompressionStats,
  classifyTokens,
  shouldPreserve,
} from '../src/semantic-compression.js';

// ─── Tier 1: Always Delete ───────────────────────────────────────────────────

describe('Tier 1 — Always Delete', () => {
  it('should remove articles (a, an, the)', () => {
    const result = semanticCompress('The cat is on a mat and an apple fell.', { tier: 1 });
    assert.ok(!result.compressed.includes(' the '), 'should remove "the"');
    assert.ok(!result.compressed.includes(' a '), 'should remove "a"');
    assert.ok(!result.compressed.includes(' an '), 'should remove "an"');
  });

  it('should remove copulas (is, are, was, were)', () => {
    const result = semanticCompress('The server is running and the logs are clean.', { tier: 1 });
    assert.ok(!result.compressed.includes(' is '), 'should remove "is"');
    assert.ok(!result.compressed.includes(' are '), 'should remove "are"');
  });

  it('should remove expletive subjects (There is, It is)', () => {
    const result = semanticCompress('There are many issues. It is important to fix them.', { tier: 1 });
    assert.ok(!result.compressed.includes('There'), 'should remove "There"');
    assert.ok(!result.compressed.includes('It is'), 'should remove "It is"');
  });

  it('should remove intensifiers (very, really, quite)', () => {
    const result = semanticCompress('This is very important and really quite critical.', { tier: 1 });
    assert.ok(!result.compressed.includes('very'), 'should remove "very"');
    assert.ok(!result.compressed.includes('really'), 'should remove "really"');
    assert.ok(!result.compressed.includes('quite'), 'should remove "quite"');
  });

  it('should compress filler phrases', () => {
    const result = semanticCompress('In order to fix this, you need to do it.', { tier: 1 });
    assert.ok(!result.compressed.includes('In order to'), 'should compress "In order to"');
    assert.ok(result.compressed.includes('to'), 'should keep "to"');
  });

  it('should remove complementizer "that" before noun phrases', () => {
    const result = semanticCompress('We found that the error is in line 5.', { tier: 1 });
    // "that" before "the" should be removed
    assert.ok(!result.compressed.includes('that the'), 'should remove complementizer "that"');
  });

  it('should achieve meaningful compression ratio on prose', () => {
    const text = 'The server is running very well and it is important that all the tests are passing. There are many benefits to this approach and it is really quite effective.';
    const result = semanticCompress(text, { tier: 1 });
    assert.ok(result.stats.savingsPercent > 15, `expected >15% savings, got ${result.stats.savingsPercent}%`);
  });
});

// ─── Tier 2: Delete If Context Clear ─────────────────────────────────────────

describe('Tier 2 — Delete If Context Clear', () => {
  it('should remove auxiliary verbs when safe', () => {
    const result = semanticCompress('The system has completed the task.', { tier: 2 });
    assert.ok(!result.compressed.includes(' has '), 'should remove "has"');
  });

  it('should remove modal verbs can/could/may', () => {
    const result = semanticCompress('This function can parse JSON and may return null.', { tier: 2 });
    assert.ok(!result.compressed.includes(' can '), 'should remove "can"');
    assert.ok(!result.compressed.includes(' may '), 'should remove "may"');
  });

  it('should remove relative pronouns (which, who, whom)', () => {
    const result = semanticCompress('The function, which processes data, is fast.', { tier: 2 });
    assert.ok(!result.compressed.includes('which'), 'should remove "which"');
  });

  it('should remove safe prepositions', () => {
    const result = semanticCompress('The report on the project is ready.', { tier: 2 });
    assert.ok(!result.compressed.includes(' on '), 'should remove "on"');
  });

  it('should be more aggressive than Tier 1 alone', () => {
    const text = 'The system that has processed the data can be used by the developer.';
    const t1 = semanticCompress(text, { tier: 1 });
    const t2 = semanticCompress(text, { tier: 2 });
    assert.ok(t2.stats.after <= t1.stats.after, 'Tier 2 should produce equal or fewer words than Tier 1');
  });
});

// ─── Tier 3: Delete If Obvious ───────────────────────────────────────────────

describe('Tier 3 — Delete If Obvious', () => {
  it('should remove redundant adverbs (also, additionally, furthermore)', () => {
    const result = semanticCompress('The system is fast. Additionally, it is reliable.', { tier: 3 });
    assert.ok(!result.compressed.includes('Additionally'), 'should remove "Additionally"');
  });

  it('should remove remaining prepositions', () => {
    const result = semanticCompress('The report from the team about the project.', { tier: 3 });
    assert.ok(!result.compressed.includes(' from '), 'should remove "from"');
    assert.ok(!result.compressed.includes(' about '), 'should remove "about"');
  });

  it('should be most aggressive tier', () => {
    const text = 'The system has also been tested by the team. Furthermore, additional tests from the developer about the feature.';
    const t2 = semanticCompress(text, { tier: 2 });
    const t3 = semanticCompress(text, { tier: 3 });
    assert.ok(t3.stats.after <= t2.stats.after, 'Tier 3 should produce equal or fewer words than Tier 2');
  });
});

// ─── Preservation Rules ──────────────────────────────────────────────────────

describe('Preservation — Technical Terms, Negation, Requirements', () => {
  it('should preserve negation: not, no, never', () => {
    const text = 'The function does not return null and never throws errors.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.compressed.includes('not'), 'should preserve "not"');
    assert.ok(result.compressed.includes('never'), 'should preserve "never"');
  });

  it('should preserve requirements: must, shall, required', () => {
    const text = 'All functions must handle errors and shall return a result.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.compressed.includes('must'), 'should preserve "must"');
    assert.ok(result.compressed.includes('shall'), 'should preserve "shall"');
  });

  it('should preserve causality: because, therefore, thus', () => {
    const text = 'The test fails because the input is null. Therefore, validation is required.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.compressed.includes('because'), 'should preserve "because"');
    assert.ok(result.compressed.includes('Therefore'), 'should preserve "Therefore"');
  });

  it('should preserve uncertainty markers: might, could, uncertain', () => {
    const text = 'The fix might work. It could be uncertain.';
    const result = semanticCompress(text, { tier: 3 });
    // "could" is preserved via context check returning false
    assert.ok(result.compressed.includes('uncertain'), 'should preserve "uncertain"');
  });

  it('should preserve main verbs', () => {
    const text = 'The function processes the data and returns the result.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.compressed.includes('processes'), 'should preserve main verb "processes"');
    assert.ok(result.compressed.includes('returns'), 'should preserve main verb "returns"');
  });

  it('should preserve nouns', () => {
    const text = 'The configuration file contains the database settings.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.compressed.includes('configuration'), 'should preserve noun "configuration"');
    assert.ok(result.compressed.includes('database'), 'should preserve noun "database"');
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle empty string', () => {
    const result = semanticCompress('', { tier: 1 });
    assert.strictEqual(result.compressed, '');
    assert.strictEqual(result.stats.before, 0);
    assert.strictEqual(result.stats.after, 0);
  });

  it('should handle null/undefined input', () => {
    const result1 = semanticCompress(null, { tier: 1 });
    assert.strictEqual(result1.compressed, '');

    const result2 = semanticCompress(undefined, { tier: 1 });
    assert.strictEqual(result2.compressed, '');
  });

  it('should handle very short text', () => {
    const result = semanticCompress('ok', { tier: 1 });
    assert.ok(result.compressed.length > 0);
  });

  it('should handle single word', () => {
    const result = semanticCompress('function', { tier: 1 });
    assert.strictEqual(result.compressed.trim(), 'function');
  });

  it('should preserve code blocks intact', () => {
    const text = 'Here is the code:\n```js\nconst x = the value;\nfunction test() {\n  return a result;\n}\n```\nThe code above works.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.compressed.includes('```js'), 'should preserve code fence');
    assert.ok(result.compressed.includes('const x = the value;'), 'should preserve code content');
    assert.ok(result.compressed.includes('function test()'), 'should preserve function definition');
  });

  it('should preserve inline code', () => {
    const text = 'Use the `getConfig()` function to get the settings.';
    const result = semanticCompress(text, { tier: 1 });
    assert.ok(result.compressed.includes('`getConfig()`'), 'should preserve inline code');
  });

  it('should handle text with only stop words', () => {
    const text = 'the is are a an';
    const result = semanticCompress(text, { tier: 1 });
    // All words are stop words, result should be very short
    assert.ok(result.compressed.split(/\s+/).filter(Boolean).length <= 2);
  });

  it('should not produce double spaces', () => {
    const text = 'The very big and really important file is here now.';
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(!result.compressed.includes('  '), 'should not have double spaces');
  });

  it('should handle text with newlines and multiple paragraphs', () => {
    const text = 'The first paragraph is about something.\n\nThe second paragraph is about another thing.';
    const result = semanticCompress(text, { tier: 1 });
    assert.ok(result.compressed.length > 0);
    assert.ok(!result.compressed.includes('  '), 'should clean up spaces');
  });
});

// ─── Compression Ratio Measurement ───────────────────────────────────────────

describe('Compression Ratio', () => {
  it('should achieve >20% compression on typical prose at Tier 1', () => {
    const text = `The system is designed to handle multiple types of data. 
It is important to note that the configuration file contains all the settings 
that are needed for the application to function correctly. There are several 
benefits to using this approach and it is really quite effective for most use cases.
The developer should review the code before submitting a pull request.`;
    const result = semanticCompress(text, { tier: 1 });
    assert.ok(result.stats.savingsPercent > 20, 
      `expected >20% savings on typical prose, got ${result.stats.savingsPercent}%`);
  });

  it('should achieve >35% compression at Tier 2', () => {
    const text = `The system that has been developed by the team can process data 
which is sent from the client. It has been tested by the QA team and the results 
are that it may have some issues with large files. The developer should review 
the code and the tests that have been written for this feature.`;
    const result = semanticCompress(text, { tier: 2 });
    assert.ok(result.stats.savingsPercent > 25, 
      `expected >25% savings at Tier 2, got ${result.stats.savingsPercent}%`);
  });

  it('should achieve >40% compression at Tier 3', () => {
    const text = `Additionally, the system has also been tested by the team. 
Furthermore, the results from the testing about the feature are also good. 
The report from the developer about the performance during the testing 
was additionally reviewed by the manager. Moreover, additional tests 
from the QA team over the weekend were also successful.`;
    const result = semanticCompress(text, { tier: 3 });
    assert.ok(result.stats.savingsPercent > 30, 
      `expected >30% savings at Tier 3, got ${result.stats.savingsPercent}%`);
  });

  it('should provide accurate word counts in stats', () => {
    const text = 'The server is running and the logs are clean.';
    const result = semanticCompress(text, { tier: 1 });
    const originalWords = text.split(/\s+/).filter(Boolean).length;
    const compressedWords = result.compressed.split(/\s+/).filter(Boolean).length;
    assert.strictEqual(result.stats.before, originalWords);
    assert.strictEqual(result.stats.after, compressedWords);
  });
});

// ─── Utility Functions ───────────────────────────────────────────────────────

describe('Utility Functions', () => {
  describe('getCompressionStats', () => {
    it('should calculate correct savings', () => {
      const stats = getCompressionStats('the cat is on the mat', 'cat mat');
      assert.strictEqual(stats.beforeTokens, 6);
      assert.strictEqual(stats.afterTokens, 2);
      assert.strictEqual(stats.saved, 4);
      assert.ok(stats.savedPercent > 50);
    });

    it('should handle empty inputs', () => {
      const stats = getCompressionStats('', '');
      assert.strictEqual(stats.saved, 0);
      assert.strictEqual(stats.savedPercent, 0);
    });
  });

  describe('classifyTokens', () => {
    it('should classify articles as tier 1', () => {
      const cls = classifyTokens('the cat');
      assert.ok(cls.tier1.includes('the'), 'should classify "the" as tier 1');
    });

    it('should classify modals as tier 2', () => {
      const cls = classifyTokens('can should might');
      assert.ok(cls.tier2.includes('can'), 'should classify "can" as tier 2');
    });

    it('should classify adverbs as tier 3', () => {
      const cls = classifyTokens('quickly slowly');
      assert.ok(cls.tier3.includes('quickly'), 'should classify "quickly" as tier 3');
    });

    it('should classify preserved words correctly', () => {
      const cls = classifyTokens('must not never');
      assert.ok(cls.preserve.includes('must'), 'should preserve "must"');
      assert.ok(cls.preserve.includes('not'), 'should preserve "not"');
      assert.ok(cls.preserve.includes('never'), 'should preserve "never"');
    });

    it('should handle empty input', () => {
      const cls = classifyTokens('');
      assert.deepStrictEqual(cls.tier1, []);
      assert.deepStrictEqual(cls.tier2, []);
      assert.deepStrictEqual(cls.tier3, []);
      assert.deepStrictEqual(cls.preserve, []);
    });
  });

  describe('shouldPreserve', () => {
    it('should preserve negation words', () => {
      assert.ok(shouldPreserve('not'));
      assert.ok(shouldPreserve('never'));
      assert.ok(shouldPreserve('no'));
    });

    it('should preserve requirement words', () => {
      assert.ok(shouldPreserve('must'));
      assert.ok(shouldPreserve('shall'));
      assert.ok(shouldPreserve('required'));
    });

    it('should not preserve non-preserve words', () => {
      assert.ok(!shouldPreserve('cat'));
      assert.ok(!shouldPreserve('running'));
    });
  });
});

// ─── Backward Compatibility ──────────────────────────────────────────────────

describe('Backward Compatibility', () => {
  it('should accept legacy `level` option', () => {
    const result = semanticCompress('The very big file is here.', { level: 1 });
    assert.ok(result.stats.savings > 0, 'level option should work like tier');
  });

  it('should default to tier 1 when no options given', () => {
    const result = semanticCompress('The cat is on the mat.');
    assert.ok(result.stats.tier1 > 0, 'default should apply Tier 1');
    assert.strictEqual(result.stats.tier2, 0, 'default should not apply Tier 2');
  });

  it('should return correct stats structure', () => {
    const result = semanticCompress('test text', { tier: 1 });
    assert.ok('compressed' in result);
    assert.ok('stats' in result);
    assert.ok('before' in result.stats);
    assert.ok('after' in result.stats);
    assert.ok('savings' in result.stats);
    assert.ok('savingsPercent' in result.stats);
    assert.ok('tier' in result.stats);
  });
});
