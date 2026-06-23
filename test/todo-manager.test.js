/**
 * Test suite for src/todo-manager.js
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { registerTodoTools } from '../src/todo-manager.js';

const TEST_DIR = resolve(process.cwd(), '.claude_test_todo');
const TEST_STATE_FILE = resolve(TEST_DIR, 'todo-state.json');

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Mock server that captures tool registrations
function createMockServer() {
  const tools = {};
  return {
    tool(name, description, schema, handler) {
      tools[name] = { description, schema, handler };
    },
    tools,
  };
}

// Override config to use test file
async function setupTestEnv() {
  // Patch the module's config import for testing
  process.env.TODO_STATE_FILE = TEST_STATE_FILE;
  mkdirSync(TEST_DIR, { recursive: true });
}

describe('Todo Manager - init operation', () => {
  afterEach(() => cleanup());

  it('should create a task list with phases', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;
    const result = await handler({
      ops: [{
        op: 'init',
        list: [
          { phase: 'Phase 1', items: ['Task A', 'Task B'] },
          { phase: 'Phase 2', items: ['Task C'] },
        ],
      }],
    });

    assert.ok(result.content[0].text.includes('## Phase 1'));
    assert.ok(result.content[0].text.includes('## Phase 2'));
    assert.ok(result.content[0].text.includes('Task A'));
    assert.ok(result.content[0].text.includes('Task B'));
    assert.ok(result.content[0].text.includes('Task C'));
  });
});

describe('Todo Manager - start operation', () => {
  afterEach(() => cleanup());

  it('should mark task as in-progress', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init first
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task B'] }],
      }],
    });

    // Start Task A
    const result = await handler({
      ops: [{ op: 'start', task: 'Task A' }],
    });

    assert.ok(result.content[0].text.includes('\u25ba Task A')); // in-progress marker
    assert.ok(result.content[0].text.includes('\u25cb Task B')); // pending marker
  });
});

describe('Todo Manager - done operation', () => {
  afterEach(() => cleanup());

  it('should mark task as complete and auto-promote', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task B', 'Task C'] }],
      }],
    });

    // Start Task A
    await handler({ ops: [{ op: 'start', task: 'Task A' }] });

    // Done Task A - should auto-promote Task B
    const result = await handler({
      ops: [{ op: 'done', task: 'Task A' }],
    });

    assert.ok(result.content[0].text.includes('\u2713 Task A')); // done marker
    assert.ok(result.content[0].text.includes('\u25ba Task B')); // auto-promoted to in-progress
    assert.ok(result.content[0].text.includes('\u25cb Task C')); // still pending
  });
});

describe('Todo Manager - drop operation', () => {
  afterEach(() => cleanup());

  it('should mark task as abandoned and auto-promote', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task B'] }],
      }],
    });

    // Start Task A
    await handler({ ops: [{ op: 'start', task: 'Task A' }] });

    // Drop Task A - should auto-promote Task B
    const result = await handler({
      ops: [{ op: 'drop', task: 'Task A' }],
    });

    assert.ok(result.content[0].text.includes('\u2717 Task A')); // dropped marker
    assert.ok(result.content[0].text.includes('\u25ba Task B')); // auto-promoted to in-progress
  });
});

describe('Todo Manager - rm operation', () => {
  afterEach(() => cleanup());

  it('should remove a task from phase', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task B', 'Task C'] }],
      }],
    });

    // Remove Task B
    const result = await handler({
      ops: [{ op: 'rm', task: 'Task B' }],
    });

    assert.ok(!result.content[0].text.includes('Task B'));
    assert.ok(result.content[0].text.includes('Task A'));
    assert.ok(result.content[0].text.includes('Task C'));
  });

  it('should remove an entire phase', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [
          { phase: 'Phase 1', items: ['Task A'] },
          { phase: 'Phase 2', items: ['Task B'] },
        ],
      }],
    });

    // Remove Phase 2
    const result = await handler({
      ops: [{ op: 'rm', phase: 'Phase 2' }],
    });

    assert.ok(result.content[0].text.includes('## Phase 1'));
    assert.ok(!result.content[0].text.includes('## Phase 2'));
  });
});

describe('Todo Manager - append operation', () => {
  afterEach(() => cleanup());

  it('should add tasks to existing phase', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A'] }],
      }],
    });

    // Append
    const result = await handler({
      ops: [{ op: 'append', phase: 'Phase 1', items: ['Task B', 'Task C'] }],
    });

    assert.ok(result.content[0].text.includes('Task A'));
    assert.ok(result.content[0].text.includes('Task B'));
    assert.ok(result.content[0].text.includes('Task C'));
  });

  it('should create new phase if not exists', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A'] }],
      }],
    });

    // Append to new phase
    const result = await handler({
      ops: [{ op: 'append', phase: 'Phase 2', items: ['Task X'] }],
    });

    assert.ok(result.content[0].text.includes('## Phase 1'));
    assert.ok(result.content[0].text.includes('## Phase 2'));
    assert.ok(result.content[0].text.includes('Task X'));
  });
});

describe('Todo Manager - view operation', () => {
  afterEach(() => cleanup());

  it('should return current state without saving', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A'] }],
      }],
    });

    // View (read-only)
    const result = await handler({ ops: [{ op: 'view' }] });

    assert.ok(result.content[0].text.includes('## Phase 1'));
    assert.ok(result.content[0].text.includes('Task A'));
  });
});

describe('Todo Manager - multiple operations', () => {
  afterEach(() => cleanup());

  it('should handle init, start, done, drop in sequence', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task B', 'Task C'] }],
      }],
    });

    // Start A
    await handler({ ops: [{ op: 'start', task: 'Task A' }] });

    // Done A -> B auto-promotes
    await handler({ ops: [{ op: 'done', task: 'Task A' }] });

    // Drop B -> C auto-promotes
    const result = await handler({
      ops: [{ op: 'drop', task: 'Task B' }],
    });

    assert.ok(result.content[0].text.includes('\u2713 Task A'));
    assert.ok(result.content[0].text.includes('\u2717 Task B'));
    assert.ok(result.content[0].text.includes('\u25ba Task C'));
  });

  it('should batch multiple operations in single call', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    const result = await handler({
      ops: [
        {
          op: 'init',
          list: [{ phase: 'Phase 1', items: ['Task A', 'Task B'] }],
        },
        { op: 'start', task: 'Task A' },
        { op: 'done', task: 'Task A' },
      ],
    });

    assert.ok(result.content[0].text.includes('\u2713 Task A'));
    assert.ok(result.content[0].text.includes('\u25ba Task B'));
  });
});

describe('Todo Manager - edge cases', () => {
  afterEach(() => cleanup());

  it('should handle duplicate task names gracefully', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init with duplicate tasks
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task A', 'Task B'] }],
      }],
    });

    // Start the first Task A
    const result = await handler({
      ops: [{ op: 'start', task: 'Task A' }],
    });

    // Should mark the first Task A as in-progress
    assert.ok(result.content[0].text.includes('\u25ba Task A'));
  });

  it('should return error for missing task', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A'] }],
      }],
    });

    // Try to start non-existent task
    const result = await handler({
      ops: [{ op: 'start', task: 'Non-existent' }],
    });

    assert.ok(result.content[0].text.includes('HALT'));
    assert.ok(result.content[0].text.includes('Task not found'));
  });

  it('should handle empty phases', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init with empty phase
    const result = await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Empty Phase', items: [] }],
      }],
    });

    assert.ok(result.content[0].text.includes('## Empty Phase'));
    assert.ok(result.content[0].text.includes('(no tasks)'));
  });

  it('should handle append to non-existent phase', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A'] }],
      }],
    });

    // Append to new phase
    const result = await handler({
      ops: [{ op: 'append', phase: 'New Phase', items: ['Task X'] }],
    });

    assert.ok(result.content[0].text.includes('## New Phase'));
    assert.ok(result.content[0].text.includes('Task X'));
  });

  it('should show summary statistics', async () => {
    await setupTestEnv();
    const server = createMockServer();
    registerTodoTools(server);

    const handler = server.tools.todo.handler;

    // Init
    await handler({
      ops: [{
        op: 'init',
        list: [{ phase: 'Phase 1', items: ['Task A', 'Task B', 'Task C'] }],
      }],
    });

    // Start A, Done A, Drop B
    await handler({ ops: [{ op: 'start', task: 'Task A' }] });
    await handler({ ops: [{ op: 'done', task: 'Task A' }] });
    const result = await handler({
      ops: [{ op: 'drop', task: 'Task B' }],
    });

    assert.ok(result.content[0].text.includes('Summary: 3 total'));
    assert.ok(result.content[0].text.includes('1 done'));
    assert.ok(result.content[0].text.includes('1 active'));
    assert.ok(result.content[0].text.includes('1 dropped'));
  });
});
