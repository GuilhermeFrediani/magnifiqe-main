/**
 * Test suite for src/project-state.js using the real implementation.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { VALID_SECTIONS, defaultState, loadState, saveState } from '../src/project-state.js';

const TEST_DIR = resolve(process.cwd(), '.claude_test_state');
const TEST_STATE_FILE = resolve(TEST_DIR, 'project_state.json');

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Project State schema', () => {
  afterEach(() => cleanup());

  it('should have all required sections in default state', () => {
    const state = defaultState();
    assert.strictEqual(state.objective, '');
    assert.deepStrictEqual(state.constraints, []);
    assert.deepStrictEqual(state.decisions, []);
    assert.deepStrictEqual(state.files_changed, []);
    assert.deepStrictEqual(state.next_steps, []);
    assert.deepStrictEqual(state.open_questions, []);
    assert.deepStrictEqual(state.risks, []);
    assert.strictEqual(state.last_error, null);
    assert.deepStrictEqual(state.checkpoints, []);
    assert.ok(state.compaction_history);
    assert.ok(state.updated_at);
  });

  it('should return default state when file does not exist', () => {
    const state = loadState(TEST_STATE_FILE);
    assert.strictEqual(state.objective, '');
    assert.deepStrictEqual(state.decisions, []);
  });

  it('should handle corrupt JSON gracefully', () => {
    saveState(defaultState(), TEST_STATE_FILE);
    writeFileSync(TEST_STATE_FILE, 'invalid json{{{', 'utf-8');
    const state = loadState(TEST_STATE_FILE);
    assert.strictEqual(state.objective, '');
    assert.deepStrictEqual(state.checkpoints, []);
  });
});

describe('Project State save/load cycle', () => {
  afterEach(() => cleanup());

  it('should persist and reload scalar sections', () => {
    const state = defaultState();
    state.objective = 'Implement auth module';
    state.last_error = 'TypeError at line 42';
    saveState(state, TEST_STATE_FILE);

    const loaded = loadState(TEST_STATE_FILE);
    assert.strictEqual(loaded.objective, 'Implement auth module');
    assert.strictEqual(loaded.last_error, 'TypeError at line 42');
  });

  it('should dedupe array sections and trim values', () => {
    const state = defaultState();
    state.decisions = [' Use JWT ', 'Use JWT', 'PostgreSQL'];
    saveState(state, TEST_STATE_FILE);

    const loaded = loadState(TEST_STATE_FILE);
    assert.deepStrictEqual(loaded.decisions, ['Use JWT', 'PostgreSQL']);
  });

  it('should merge with defaults when loading partial state', () => {
    saveState({ objective: 'Partial state', decisions: ['one decision'] }, TEST_STATE_FILE);

    const loaded = loadState(TEST_STATE_FILE);
    assert.strictEqual(loaded.objective, 'Partial state');
    assert.deepStrictEqual(loaded.decisions, ['one decision']);
    assert.deepStrictEqual(loaded.risks, []);
    assert.deepStrictEqual(loaded.checkpoints, []);
    assert.strictEqual(loaded.last_error, null);
  });
});

describe('Checkpoint behavior via real persistence', () => {
  afterEach(() => cleanup());

  it('should persist checkpoints without nesting checkpoint history in snapshot', () => {
    const state = defaultState();
    state.objective = 'Build API';
    const { checkpoints, ...rest } = state;
    state.checkpoints.push({
      label: 'before-refactor',
      timestamp: new Date().toISOString(),
      snapshot: JSON.parse(JSON.stringify(rest)),
    });
    saveState(state, TEST_STATE_FILE);

    const loaded = loadState(TEST_STATE_FILE);
    assert.strictEqual(loaded.checkpoints.length, 1);
    assert.strictEqual(loaded.checkpoints[0].snapshot.checkpoints, undefined);
  });
});

describe('VALID_SECTIONS', () => {
  it('should expose expected public state sections', () => {
    assert.deepStrictEqual(VALID_SECTIONS, [
      'objective',
      'constraints',
      'decisions',
      'files_changed',
      'next_steps',
      'open_questions',
      'risks',
      'last_error',
    ]);
  });
});
