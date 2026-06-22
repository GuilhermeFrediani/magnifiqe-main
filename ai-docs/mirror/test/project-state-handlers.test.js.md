# test/project-state-handlers.test.js

- kind: js
- lines: 159
- bytes: 7240

## Summary
Handler-level tests for src/project-state.js MCP tools. Uses createMockServer pattern to invoke tool handlers directly. Uses a temp directory via --project-root to isolate state files.

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`
- `os`

## Exports
- none

## Source
```js
/**
 * Handler-level tests for src/project-state.js MCP tools.
 * Uses createMockServer pattern to invoke tool handlers directly.
 * Uses a temp directory via --project-root to isolate state files.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set up temp project root BEFORE importing project-state.js
// so config.js resolves PROJECT_STATE_FILE inside the temp dir.
const savedArgv = process.argv.slice();
const tempDir = mkdtempSync(join(tmpdir(), 'project-state-test-'));
process.argv.push('--project-root', tempDir);

const { registerProjectStateTools } = await import('../src/project-state.js');

// Restore process.argv — module-level values are already cached.
process.argv.length = savedArgv.length;
process.argv.push(...savedArgv);

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, _desc, _schema, handler) => {
        tools[name] = { handler };
      },
    },
    tools,
  };
}

function resetStateFile() {
  const stateFile = join(tempDir, '.claude', 'project_state.json');
  if (existsSync(stateFile)) {
    rmSync(stateFile);
  }
}

describe('Project State handler tests', () => {
  const { server, tools } = createMockServer();
  registerProjectStateTools(server);

  beforeEach(() => resetStateFile());

  after(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ── get_project_state ────────────────────────────────────────────────

  describe('get_project_state', () => {
    it('returns full state with all section headers when no section specified', async () => {
      const result = await tools.get_project_state.handler({});
      const text = result.content[0].text;
      assert.ok(text.includes('## Project State'), 'should contain state header');
      assert.ok(text.includes('### objective'), 'should contain objective section');
      assert.ok(text.includes('### constraints'), 'should contain constraints section');
    });

    it('returns specific section when section is provided', async () => {
      const result = await tools.get_project_state.handler({ section: 'objective' });
      const text = result.content[0].text;
      assert.ok(text.includes('## objective'), 'should contain section header');
    });
  });

  // ── save_project_state ───────────────────────────────────────────────

  describe('save_project_state', () => {
    it('appends to array sections', async () => {
      await tools.save_project_state.handler({ section: 'constraints', content: 'constraint A' });
      const result = await tools.save_project_state.handler({ section: 'constraints', content: 'constraint B' });
      const text = result.content[0].text;
      assert.ok(text.includes('constraint A'), 'should contain first constraint');
      assert.ok(text.includes('constraint B'), 'should contain second constraint');
    });

    it('replaces scalar sections', async () => {
      await tools.save_project_state.handler({ section: 'objective', content: 'First objective' });
      const result = await tools.save_project_state.handler({ section: 'objective', content: 'Updated objective' });
      const text = result.content[0].text;
      assert.ok(text.includes('Updated objective'), 'should contain new value');
      assert.ok(!text.includes('First objective'), 'should not contain old value');
    });
  });

  // ── checkpoint_task ──────────────────────────────────────────────────

  describe('checkpoint_task', () => {
    it('creates a labeled checkpoint with confirmation', async () => {
      const result = await tools.checkpoint_task.handler({ label: 'before-refactor' });
      const text = result.content[0].text;
      assert.ok(text.includes('before-refactor'), 'should contain label');
      assert.ok(text.includes('Checkpoint saved'), 'should confirm checkpoint creation');
    });

    it('shows checkpoint in list_checkpoints output', async () => {
      await tools.checkpoint_task.handler({ label: 'my-checkpoint' });
      const result = await tools.list_checkpoints.handler({});
      const text = result.content[0].text;
      assert.ok(text.includes('my-checkpoint'), 'should list the checkpoint label');
      assert.ok(text.includes('## Checkpoints (1)'), 'should show count of 1');
    });
  });

  // ── list_checkpoints ─────────────────────────────────────────────────

  describe('list_checkpoints', () => {
    it('reports no checkpoints when none exist', async () => {
      const result = await tools.list_checkpoints.handler({});
      const text = result.content[0].text;
      assert.ok(text.includes('No checkpoints found'), 'should indicate empty list');
    });

    it('lists checkpoints with count and labels', async () => {
      await tools.checkpoint_task.handler({ label: 'cp-1' });
      await tools.checkpoint_task.handler({ label: 'cp-2' });
      const result = await tools.list_checkpoints.handler({});
      const text = result.content[0].text;
      assert.ok(text.includes('## Checkpoints (2)'), 'should show correct count');
      assert.ok(text.includes('cp-2'), 'should list second checkpoint');
    });
  });

  // ── resume_task ──────────────────────────────────────────────────────

  describe('resume_task', () => {
    it('restores the most recent checkpoint when no label given', async () => {
      await tools.save_project_state.handler({ section: 'objective', content: 'Before checkpoint' });
      await tools.checkpoint_task.handler({ label: 'snap' });
      await tools.save_project_state.handler({ section: 'objective', content: 'After checkpoint' });

      const result = await tools.resume_task.handler({});
      const text = result.content[0].text;
      assert.ok(text.includes('Resumed from checkpoint'), 'should confirm resume');
      assert.ok(text.includes('Before checkpoint'), 'should restore old objective value');
    });

    it('restores a specific checkpoint by label', async () => {
      await tools.save_project_state.handler({ section: 'objective', content: 'State A' });
      await tools.checkpoint_task.handler({ label: 'checkpoint-a' });
      await tools.save_project_state.handler({ section: 'objective', content: 'State B' });
      await tools.checkpoint_task.handler({ label: 'checkpoint-b' });

      const result = await tools.resume_task.handler({ label: 'checkpoint-a' });
      const text = result.content[0].text;
      assert.ok(text.includes('checkpoint-a'), 'should reference the requested label');
      assert.ok(text.includes('State A'), 'should restore state A objective');
    });
  });
});

```
