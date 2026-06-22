/**
 * Handler-level tests for src/compaction.js MCP tools.
 * Uses createMockServer pattern to invoke handlers directly.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { registerCompactionTools } from '../src/compaction.js';

const PROJECT_ROOT = resolve(process.cwd());
const STATE_DIR = resolve(PROJECT_ROOT, '.claude');
const STATE_FILE = resolve(STATE_DIR, 'project_state.json');

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, desc, schema, handler) => {
        tools[name] = { handler };
      },
    },
    tools,
  };
}

function cleanupState() {
  if (existsSync(STATE_FILE)) rmSync(STATE_FILE);
  // Remove .claude dir if we created it and it's otherwise empty
  if (existsSync(STATE_DIR)) {
    try { rmSync(STATE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

afterEach(() => {
  cleanupState();
});

describe('compact_logs handler', () => {
  it('should extract errors and report savings', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    const logText = `INFO: Starting build
ERROR: Cannot find module 'x'
INFO: Compiling...
WARN: Deprecated API usage
INFO: Done`;

    const result = await tools.compact_logs.handler({
      log_text: logText,
      keep_errors: true,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('[Compacted'), 'should report chars compacted');
    assert.ok(text.includes("ERROR: Cannot find module 'x'"), 'should contain ERROR line');
    assert.ok(text.includes('WARN: Deprecated API usage'), 'should contain WARN line');
    assert.ok(text.includes('Errors/warnings: 2'), 'should report error count');
  });

  it('should omit error details when keep_errors is false', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    const logText = `INFO: ok
ERROR: fail
INFO: fine`;

    const result = await tools.compact_logs.handler({
      log_text: logText,
      keep_errors: false,
    });

    const text = result.content[0].text;
    assert.ok(!text.includes('ERROR: fail'), 'should not contain error details');
    assert.ok(text.includes('Errors/warnings: 1'), 'should still report error count');
    assert.ok(text.includes('Info lines discarded: 2'), 'should report discarded count');
  });
});

describe('compact_diff handler', () => {
  it('should summarize a multi-file diff', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    const diffText = `--- a/src/foo.js
+++ b/src/foo.js
@@ -1,5 +1,7 @@ function bar
 const x = 1;
+const y = 2;
+const z = 3;
 const w = 4;
--- a/src/bar.js
+++ b/src/bar.js
@@ -10,3 +10,4 @@ class Baz
-old line
+new line`;

    const result = await tools.compact_diff.handler({ diff_text: diffText });

    const text = result.content[0].text;
    assert.ok(text.includes('[Compacted'), 'should report chars compacted');
    assert.ok(text.includes('Files changed: 2'), 'should count changed files');
    assert.ok(text.includes('src/foo.js'), 'should list foo.js');
    assert.ok(text.includes('src/bar.js'), 'should list bar.js');
    assert.ok(text.includes('Lines added: +3'), 'should count additions');
    assert.ok(text.includes('Lines removed: -1'), 'should count deletions');
  });

  it('should report zero counts for empty diff', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    const result = await tools.compact_diff.handler({ diff_text: '' });

    const text = result.content[0].text;
    assert.ok(text.includes('Files changed: 0'), 'should show zero files');
    assert.ok(text.includes('Lines added: +0'), 'should show zero additions');
    assert.ok(text.includes('Lines removed: -0'), 'should show zero deletions');
  });
});

describe('compact_conversation_state handler', () => {
  afterEach(() => cleanupState());

  it('should save summary to state and return confirmation', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    const result = await tools.compact_conversation_state.handler({
      summary: 'Decided to refactor auth module. Created tests. Ready for review.',
    });

    const text = result.content[0].text;
    assert.ok(text.includes('Conversation state compacted'), 'should confirm compaction');
    assert.ok(text.includes('1 entries saved'), 'should report entry count');
    assert.ok(text.includes('promote_summary_to_checkpoint'), 'should suggest promotion');

    // Verify state file was written with the summary
    assert.ok(existsSync(STATE_FILE), 'state file should exist');
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    assert.strictEqual(state.compaction_history.length, 1);
    assert.ok(state.compaction_history[0].summary.includes('Decided to refactor'));
  });

  it('should increment entry count on multiple calls', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    await tools.compact_conversation_state.handler({ summary: 'First summary.' });
    const result = await tools.compact_conversation_state.handler({ summary: 'Second summary.' });

    const text = result.content[0].text;
    assert.ok(text.includes('2 entries saved'), 'should report incremented count');
  });
});

describe('promote_summary_to_checkpoint handler', () => {
  afterEach(() => cleanupState());

  it('should fail gracefully when no compaction history exists', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    const result = await tools.promote_summary_to_checkpoint.handler({
      label: 'test-checkpoint',
    });

    const text = result.content[0].text;
    assert.ok(text.includes('No compaction history found'), 'should report missing history');
  });

  it('should create checkpoint from latest compaction', async () => {
    const { server, tools } = createMockServer();
    registerCompactionTools(server);

    // First compact, then promote
    await tools.compact_conversation_state.handler({
      summary: 'Auth refactored. Tests passing.',
    });

    const result = await tools.promote_summary_to_checkpoint.handler({
      label: 'post-refactor',
    });

    const text = result.content[0].text;
    assert.ok(text.includes('Checkpoint promoted'), 'should confirm checkpoint');
    assert.ok(text.includes('post-refactor'), 'should include the label');
    assert.ok(text.includes('1 checkpoint(s) total'), 'should report total');

    // Verify checkpoint was saved to state
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    assert.strictEqual(state.checkpoints.length, 1);
    assert.strictEqual(state.checkpoints[0].label, 'post-refactor');
    assert.ok(state.checkpoints[0].from_compaction.includes('Auth refactored'));
  });
});
