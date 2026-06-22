/**
 * Handler-level tests for src/watchdog.js MCP tools.
 * Tests: registerWatchdogTools, session_health, detect_output_dedup, getDedupStats.
 * Uses createMockServer pattern to invoke handlers directly.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { registerWatchdogTools } from '../src/watchdog.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, desc, schema, handler) => {
        tools[name] = { desc, schema, handler };
      },
    },
    tools,
  };
}

function mockText(result) {
  return result?.content?.[0]?.text || '';
}

// ─── Tool Registration ──────────────────────────────────────────────────────

describe('watchdog tool registration', () => {
  it('should register all four watchdog tools', () => {
    const { server, tools } = createMockServer();
    registerWatchdogTools(server);
    assert.ok(tools.detect_output_dedup, 'detect_output_dedup registered');
    assert.ok(tools.session_watchdog, 'session_watchdog registered');
    assert.ok(tools.session_health, 'session_health registered');
    assert.ok(tools.run_test_and_report, 'run_test_and_report registered');
    assert.strictEqual(Object.keys(tools).length, 4, 'exactly 4 tools registered');
  });

  it('each handler should be a function', () => {
    const { server, tools } = createMockServer();
    registerWatchdogTools(server);
    for (const [name, tool] of Object.entries(tools)) {
      assert.strictEqual(typeof tool.handler, 'function', `${name} handler is a function`);
    }
  });
});

// ─── session_health ────────────────────────────────────────────────────────

describe('session_health handler', () => {
  const { server, tools } = createMockServer();
  registerWatchdogTools(server);

  it('should return a health score with score/10 format', async () => {
    const result = await tools.session_health.handler({});
    const text = mockText(result);
    assert.match(text, /SESSION HEALTH: \d+\/10/, 'should contain health score');
  });

  it('should report total tool calls', async () => {
    const result = await tools.session_health.handler({});
    const text = mockText(result);
    assert.match(text, /Total tool calls: \d+/, 'should report total tool calls');
  });

  it('should report duplicate output count', async () => {
    const result = await tools.session_health.handler({});
    const text = mockText(result);
    assert.match(text, /Duplicate outputs: \d+/, 'should report duplicate outputs');
  });

  it('should report output history size', async () => {
    const result = await tools.session_health.handler({});
    const text = mockText(result);
    assert.match(text, /Output history: \d+ entries/, 'should report output history');
  });

  it('should include a status or recommendations section', async () => {
    const result = await tools.session_health.handler({});
    const text = mockText(result);
    const hasStatus = text.includes('Status: Healthy');
    const hasRecommendations = text.includes('Recommendations:');
    assert.ok(hasStatus || hasRecommendations, 'should have either Status or Recommendations');
  });

  it('should return content array with text type', async () => {
    const result = await tools.session_health.handler({});
    assert.ok(Array.isArray(result.content), 'content is array');
    assert.strictEqual(result.content[0].type, 'text', 'content type is text');
  });
});

// ─── detect_output_dedup — check mode ──────────────────────────────────────

describe('detect_output_dedup check mode', () => {
  const { server, tools } = createMockServer();
  registerWatchdogTools(server);

  it('should report unique output in check mode', async () => {
    const result = await tools.detect_output_dedup.handler({
      text: 'unique-check-text-' + Date.now(),
      action: 'check',
    });
    const text = mockText(result);
    assert.match(text, /unique/i, 'should report output as unique');
    assert.match(text, /hash: [a-f0-9]+/, 'should include a hash');
  });

  it('should not mutate output ring in check mode', async () => {
    const uniqueText = 'check-no-mutate-' + Date.now();
    // First call in check mode — should not record
    await tools.detect_output_dedup.handler({ text: uniqueText, action: 'check' });
    // Second call in check mode — should still see it as unique since check doesn't track
    const result = await tools.detect_output_dedup.handler({ text: uniqueText, action: 'check' });
    const text = mockText(result);
    assert.match(text, /unique/i, 'should still be unique since check mode does not track');
  });
});

// ─── detect_output_dedup — track mode ──────────────────────────────────────

describe('detect_output_dedup track mode', () => {
  const { server, tools } = createMockServer();
  registerWatchdogTools(server);

  it('should report unique output on first track', async () => {
    const result = await tools.detect_output_dedup.handler({
      text: 'first-track-' + Date.now(),
      action: 'track',
    });
    const text = mockText(result);
    assert.match(text, /OK.*unique/i, 'should report output is unique');
    assert.match(text, /hash: [a-f0-9]+/, 'should include a hash');
  });

  it('should detect duplicate on second track of same text', async () => {
    const dupText = 'dup-track-' + Date.now();
    // First call — records the hash
    await tools.detect_output_dedup.handler({ text: dupText, action: 'track' });
    // Second call — should detect duplicate
    const result = await tools.detect_output_dedup.handler({ text: dupText, action: 'track' });
    const text = mockText(result);
    assert.match(text, /DETECTED|DUPLICATE/i, 'should detect duplicate output');
    assert.match(text, /seen \d+ times before|identical output/i, 'should report occurrence count');
  });

  it('should treat different text as unique', async () => {
    const result = await tools.detect_output_dedup.handler({
      text: 'wholly-different-text-' + Date.now(),
      action: 'track',
    });
    const text = mockText(result);
    assert.match(text, /OK.*unique/i, 'different text should be unique');
  });
});

// ─── detect_output_dedup — default action ──────────────────────────────────

describe('detect_output_dedup default action', () => {
  const { server, tools } = createMockServer();
  registerWatchdogTools(server);

  it('should default to track when action is omitted', async () => {
    const result = await tools.detect_output_dedup.handler({
      text: 'default-action-' + Date.now(),
    });
    const text = mockText(result);
    // Track mode returns OK for unique or DETECTED for duplicate
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.match(text, /(OK|DETECTED|unique|DETECTED)/i, 'should behave as track mode');
  });
});

// ─── getDedupStats ─────────────────────────────────────────────────────────

describe('getDedupStats via watchdog integration', () => {
  it('should be importable from safety-guards', async () => {
    const { getDedupStats } = await import('../src/safety-guards.js');
    assert.strictEqual(typeof getDedupStats, 'function', 'getDedupStats should be a function');
  });

  it('should return an object with ringSize and uniqueHashes', async () => {
    const { getDedupStats } = await import('../src/safety-guards.js');
    const stats = getDedupStats();
    assert.ok(typeof stats === 'object', 'stats should be an object');
    assert.ok('ringSize' in stats, 'stats should have ringSize');
    assert.ok('uniqueHashes' in stats, 'stats should have uniqueHashes');
    assert.strictEqual(typeof stats.ringSize, 'number', 'ringSize should be a number');
    assert.strictEqual(typeof stats.uniqueHashes, 'number', 'uniqueHashes should be a number');
  });
});

// ─── session_health after dedup activity ───────────────────────────────────

describe('session_health reflects dedup state', () => {
  const { server, tools } = createMockServer();
  registerWatchdogTools(server);

  it('should report duplicate count > 0 after tracking duplicates', async () => {
    const shared = 'health-dedup-' + Date.now();
    // Track once (unique)
    await tools.detect_output_dedup.handler({ text: shared, action: 'track' });
    // Track again (duplicate)
    await tools.detect_output_dedup.handler({ text: shared, action: 'track' });

    const result = await tools.session_health.handler({});
    const text = mockText(result);
    // Extract duplicate count
    const match = text.match(/Duplicate outputs: (\d+)/);
    assert.ok(match, 'should match Duplicate outputs line');
    const dupCount = parseInt(match[1], 10);
    assert.ok(dupCount >= 1, 'should have at least 1 duplicate after re-tracking same text');
  });
});
