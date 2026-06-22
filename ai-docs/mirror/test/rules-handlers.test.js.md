# test/rules-handlers.test.js

- kind: js
- lines: 208
- bytes: 9188

## Summary
Handler-level tests for src/rules.js MCP tools. Uses createMockServer pattern to invoke handlers directly against the real filesystem (ai-rules/ directory).

## Imports
- `node:test`
- `node:assert`
- `../src/rules.js`
- `../src/rate-limiter.js`

## Exports
- none

## Source
```js
/**
 * Handler-level tests for src/rules.js MCP tools.
 * Uses createMockServer pattern to invoke handlers directly
 * against the real filesystem (ai-rules/ directory).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { registerRulesTools } from '../src/rules.js';
import { rateLimiter } from '../src/rate-limiter.js';

/* ── Mock server ─────────────────────────────────────────── */

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool(name, _desc, _schema, handler) {
        tools[name] = { handler };
      },
    },
    tools,
  };
}

/* ── Setup ───────────────────────────────────────────────── */

let tools;

beforeEach(() => {
  // Reset rate-limiter counters so tests don't bleed into each other.
  rateLimiter.counters = {};

  const { server, tools: t } = createMockServer();
  registerRulesTools(server);
  tools = t;
});

/* ── list_rules ──────────────────────────────────────────── */

describe('list_rules', () => {
  it('should return a formatted list of available rule files', async () => {
    const result = await tools.list_rules.handler({});
    const text = result.content[0].text;

    assert.ok(text.includes('Available rule files'), 'should mention "Available rule files"');
    assert.ok(text.includes('.md'), 'should contain at least one .md filename');
    assert.ok(text.includes('get_rules'), 'should hint about get_rules usage');
  });

  it('should list all 14 bundled rule files', async () => {
    const result = await tools.list_rules.handler({});
    const text = result.content[0].text;

    // All 14 numbered rule files should be present
    for (let i = 0; i <= 13; i++) {
      const padded = String(i).padStart(2, '0');
      assert.ok(
        text.includes(`${padded}-`),
        `should contain rule file starting with ${padded}-`,
      );
    }
  });

  it('should use stable alphabetical sort order', async () => {
    const result = await tools.list_rules.handler({});
    const text = result.content[0].text;

    // 00 comes before 01, which comes before 02, etc.
    const idx00 = text.indexOf('00-');
    const idx13 = text.indexOf('13-');
    assert.ok(idx00 >= 0, '00-project-overview should be listed');
    assert.ok(idx13 >= 0, '13-live-council-runtime should be listed');
    assert.ok(idx00 < idx13, '00- should appear before 13- (alphabetical order)');
  });
});

/* ── get_rules ───────────────────────────────────────────── */

describe('get_rules', () => {
  it('should return full content for a known TOPIC_MAP keyword', async () => {
    const result = await tools.get_rules.handler({ topic: 'coding', mode: 'full' });
    const text = result.content[0].text;

    assert.ok(text.includes('02-coding-standards.md'), 'should identify the file');
    // Full content should contain substantive text, not just a description
    assert.ok(text.length > 200, 'full mode should return substantial content');
    assert.ok(!text.includes('Call get_rules'), 'full mode should not prompt for full mode');
  });

  it('should return description-only summary in summary mode', async () => {
    const result = await tools.get_rules.handler({ topic: 'security', mode: 'summary' });
    const text = result.content[0].text;

    assert.ok(text.includes('04-security-secrets.md'), 'should identify the file');
    assert.ok(text.includes('Call get_rules'), 'summary mode should prompt for full content');
    // Summary should be much shorter than full content
    assert.ok(text.length < 500, 'summary mode should be concise');
  });

  it('should return an error message for a nonexistent topic', async () => {
    const result = await tools.get_rules.handler({ topic: 'nonexistent-topic-xyz', mode: 'full' });
    const text = result.content[0].text;

    assert.ok(text.includes('No rules found for topic'), 'should say no rules found');
    assert.ok(text.includes('nonexistent-topic-xyz'), 'should echo back the topic name');
    assert.ok(text.includes('Available files'), 'should list available files');
  });

  it('should resolve TOPIC_MAP aliases (e.g. "debug" → 05-debugging-mastery.md)', async () => {
    const result = await tools.get_rules.handler({ topic: 'debug', mode: 'full' });
    const text = result.content[0].text;

    assert.ok(text.includes('05-debugging-mastery.md'), 'debug alias should resolve to 05');
  });

  it('should default to full mode when mode is omitted', async () => {
    const result = await tools.get_rules.handler({ topic: 'coding' });
    const text = result.content[0].text;

    assert.ok(text.includes('02-coding-standards.md'), 'should resolve the file');
    assert.ok(!text.includes('Call get_rules'), 'default mode is full, not summary');
  });
});

/* ── get_context ─────────────────────────────────────────── */

describe('get_context', () => {
  it('should return a not-found message for a module without CONTEXT.md', async () => {
    const result = await tools.get_context.handler({ module_path: 'nonexistent-module-abc' });
    const text = result.content[0].text;

    assert.ok(text.includes('No CONTEXT.md found'), 'should indicate file not found');
    assert.ok(text.includes('nonexistent-module-abc'), 'should echo the module path');
    assert.ok(text.includes('Searched in'), 'should list searched paths');
  });

  it('should strip path traversal sequences from module_path', async () => {
    const result = await tools.get_context.handler({ module_path: '../../etc/passwd' });
    const text = result.content[0].text;

    // The handler strips ".." sequences, so the original traversal path
    // should not appear anywhere in the output
    assert.ok(!text.includes('../..'), 'should not contain raw .. traversal');
    assert.ok(text.includes('No CONTEXT.md found'), 'should gracefully fail');
    assert.ok(text.includes('etc/passwd'), 'stripped module name "etc/passwd" may appear');
  });

  it('should search multiple candidate paths for CONTEXT.md', async () => {
    const result = await tools.get_context.handler({ module_path: 'some-module' });
    const text = result.content[0].text;

    // The error output lists searched paths — at least 3 candidates should be shown
    const dashCount = (text.match(/^- /gm) || []).length;
    assert.ok(dashCount >= 3, `should list at least 3 candidate paths, got ${dashCount}`);
  });
});

/* ── get_rules_bundle ────────────────────────────────────── */

describe('get_rules_bundle', () => {
  it('should return an index listing in index mode', async () => {
    const result = await tools.get_rules_bundle.handler({ mode: 'index' });
    const text = result.content[0].text;

    assert.ok(text.includes('Rules Index'), 'should include index header');
    assert.ok(text.includes('files'), 'should mention file count');
    // Index mode should list filenames with descriptions
    assert.ok(text.includes('00-project-overview.md'), 'should list first rule file');
    assert.ok(text.includes('get_rules'), 'should hint about get_rules');
  });

  it('should concatenate all rule content in full mode', async () => {
    const result = await tools.get_rules_bundle.handler({ mode: 'full' });
    const text = result.content[0].text;

    assert.ok(text.includes('Rules Bundle'), 'should include bundle header');
    assert.ok(text.includes('tokens'), 'should estimate token count');
    // Full bundle should contain HTML comment markers for each rule file
    assert.ok(text.includes('<!-- rule:'), 'should include rule comment markers');
    // Should contain sections separated by dividers
    assert.ok(text.includes('---'), 'should separate rules with dividers');
  });

  it('should fall through to full mode when mode is omitted at handler level', async () => {
    // Zod default ("index") only applies at MCP server level;
    // calling the handler directly omits the default, so mode=undefined
    // falls through to the full concatenation path.
    const result = await tools.get_rules_bundle.handler({});
    const text = result.content[0].text;

    assert.ok(text.includes('Rules Bundle'), 'undefined mode falls through to full bundle');
    assert.ok(text.includes('tokens'), 'should estimate token count');
  });
  it('should contain all 14 rule files in full mode', async () => {
    const result = await tools.get_rules_bundle.handler({ mode: 'full' });
    const text = result.content[0].text;

    for (let i = 0; i <= 13; i++) {
      const padded = String(i).padStart(2, '0');
      assert.ok(
        text.includes(`<!-- rule: ${padded}-`),
        `full bundle should include comment marker for rule ${padded}-*`,
      );
    }
  });
});

```
