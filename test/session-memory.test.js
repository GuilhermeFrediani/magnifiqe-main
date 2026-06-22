/**
 * Test suite for session memory tools
 * Tests: save_session_state, get_session_state, create_handoff, resume_from_handoff
 */

import { describe, it, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

const TEST_SESSION_DIR = resolve(process.cwd(), '.claude_test_session');
const TEST_SESSION_STATE_FILE = resolve(TEST_SESSION_DIR, 'session-state.json');

function cleanup() {
  if (existsSync(TEST_SESSION_DIR)) {
    rmSync(TEST_SESSION_DIR, { recursive: true, force: true });
  }
}

function createMockServer() {
  const registeredTools = new Map();
  return {
    tool: (name, description, schema, handler) => {
      registeredTools.set(name, { description, schema, handler });
    },
    getHandler: (name) => registeredTools.get(name)?.handler,
    getTools: () => registeredTools,
  };
}

describe('Session Memory Tools', () => {
  let server;
  let registerMemoryTools;

  beforeEach(async () => {
    cleanup();
    // Mock the config to use test directory
    process.env.SESSION_STATE_FILE = TEST_SESSION_STATE_FILE;
    
    // Dynamic import to get fresh module
    const module = await import('../src/memory.js');
    registerMemoryTools = module.registerMemoryTools;
    
    server = createMockServer();
    registerMemoryTools(server);
  });

  afterEach(() => {
    cleanup();
    delete process.env.SESSION_STATE_FILE;
  });

  describe('save_session_state', () => {
    it('should save session state correctly', async () => {
      const handler = server.getHandler('save_session_state');
      
      const result = await handler({
        goal: 'Implement memory system',
        current_subtask: 'Create session tools',
        loaded_skills: ['memory', 'testing'],
        status: 'active',
        plan: ['Step 1', 'Step 2'],
        assumptions: ['User wants structured state'],
        blockers: ['None'],
      });

      assert.ok(result.content[0].text.includes('saved successfully'));
      assert.ok(existsSync(TEST_SESSION_STATE_FILE));

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.strictEqual(saved.goal, 'Implement memory system');
      assert.strictEqual(saved.current_subtask, 'Create session tools');
      assert.deepStrictEqual(saved.loaded_skills, ['memory', 'testing']);
      assert.strictEqual(saved.status, 'active');
      assert.deepStrictEqual(saved.plan, ['Step 1', 'Step 2']);
      assert.deepStrictEqual(saved.assumptions, ['User wants structured state']);
      assert.deepStrictEqual(saved.blockers, ['None']);
      assert.ok(saved.timestamp);
    });

    it('should handle optional fields with defaults', async () => {
      const handler = server.getHandler('save_session_state');
      
      const result = await handler({
        goal: 'Test goal',
        current_subtask: 'Test subtask',
        status: 'paused',
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.deepStrictEqual(saved.loaded_skills, []);
      assert.deepStrictEqual(saved.plan, []);
      assert.deepStrictEqual(saved.assumptions, []);
      assert.deepStrictEqual(saved.blockers, []);
    });

    it('should overwrite previous session state', async () => {
      const handler = server.getHandler('save_session_state');
      
      await handler({
        goal: 'First goal',
        current_subtask: 'First subtask',
        status: 'active',
      });

      await handler({
        goal: 'Second goal',
        current_subtask: 'Second subtask',
        status: 'completed',
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.strictEqual(saved.goal, 'Second goal');
      assert.strictEqual(saved.status, 'completed');
    });
  });

  describe('get_session_state', () => {
    it('should return latest session state', async () => {
      const saveHandler = server.getHandler('save_session_state');
      const getHandler = server.getHandler('get_session_state');
      
      await saveHandler({
        goal: 'Test goal',
        current_subtask: 'Test subtask',
        status: 'active',
      });

      const result = await getHandler({});
      const state = JSON.parse(result.content[0].text);
      
      assert.strictEqual(state.goal, 'Test goal');
      assert.strictEqual(state.current_subtask, 'Test subtask');
      assert.strictEqual(state.status, 'active');
    });

    it('should return message when no state exists', async () => {
      const getHandler = server.getHandler('get_session_state');
      
      const result = await getHandler({});
      assert.ok(result.content[0].text.includes('No session state found'));
    });
  });

  describe('create_handoff', () => {
    it('should create handoff document correctly', async () => {
      const handler = server.getHandler('create_handoff');
      
      const result = await handler({
        resume_from: 'Implementing test suite',
        next_actions: ['Write tests', 'Run tests'],
        watch_outs: ['Edge cases'],
        context_summary: 'Working on session memory tools',
      });

      assert.ok(result.content[0].text.includes('Handoff document created'));
      assert.ok(existsSync(TEST_SESSION_STATE_FILE));

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.ok(Array.isArray(saved.handoffs));
      assert.strictEqual(saved.handoffs.length, 1);
      
      const handoff = saved.handoffs[0];
      assert.strictEqual(handoff.resume_from, 'Implementing test suite');
      assert.deepStrictEqual(handoff.next_actions, ['Write tests', 'Run tests']);
      assert.deepStrictEqual(handoff.watch_outs, ['Edge cases']);
      assert.strictEqual(handoff.context_summary, 'Working on session memory tools');
      assert.ok(handoff.timestamp);
    });

    it('should append multiple handoffs', async () => {
      const handler = server.getHandler('create_handoff');
      
      await handler({
        resume_from: 'First handoff',
        next_actions: ['Action 1'],
        context_summary: 'First context',
      });

      await handler({
        resume_from: 'Second handoff',
        next_actions: ['Action 2'],
        context_summary: 'Second context',
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.strictEqual(saved.handoffs.length, 2);
      assert.strictEqual(saved.handoffs[0].resume_from, 'First handoff');
      assert.strictEqual(saved.handoffs[1].resume_from, 'Second handoff');
    });

    it('should handle optional watch_outs', async () => {
      const handler = server.getHandler('create_handoff');
      
      await handler({
        resume_from: 'Test',
        next_actions: ['Action'],
        context_summary: 'Context',
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.deepStrictEqual(saved.handoffs[0].watch_outs, []);
    });
  });

  describe('resume_from_handoff', () => {
    it('should resume from latest handoff by default', async () => {
      const createHandler = server.getHandler('create_handoff');
      const resumeHandler = server.getHandler('resume_from_handoff');
      
      await createHandler({
        resume_from: 'First',
        next_actions: ['Action 1'],
        context_summary: 'Context 1',
      });

      await createHandler({
        resume_from: 'Second',
        next_actions: ['Action 2'],
        context_summary: 'Context 2',
      });

      const result = await resumeHandler({});
      const handoff = JSON.parse(result.content[0].text);
      
      assert.strictEqual(handoff.resume_from, 'Second');
      assert.deepStrictEqual(handoff.next_actions, ['Action 2']);
    });

    it('should resume from specific index', async () => {
      const createHandler = server.getHandler('create_handoff');
      const resumeHandler = server.getHandler('resume_from_handoff');
      
      await createHandler({
        resume_from: 'First',
        next_actions: ['Action 1'],
        context_summary: 'Context 1',
      });

      await createHandler({
        resume_from: 'Second',
        next_actions: ['Action 2'],
        context_summary: 'Context 2',
      });

      const result = await resumeHandler({ index: 0 });
      const handoff = JSON.parse(result.content[0].text);
      
      assert.strictEqual(handoff.resume_from, 'First');
      assert.deepStrictEqual(handoff.next_actions, ['Action 1']);
    });

    it('should return error when no handoffs exist', async () => {
      const resumeHandler = server.getHandler('resume_from_handoff');
      
      const result = await resumeHandler({});
      assert.ok(result.content[0].text.includes('No handoff documents found'));
    });

    it('should return error for invalid index', async () => {
      const createHandler = server.getHandler('create_handoff');
      const resumeHandler = server.getHandler('resume_from_handoff');
      
      await createHandler({
        resume_from: 'Test',
        next_actions: ['Action'],
        context_summary: 'Context',
      });

      const result = await resumeHandler({ index: 5 });
      assert.ok(result.content[0].text.includes('Invalid handoff index'));
    });
  });

  describe('Edge cases', () => {
    it('should handle empty arrays', async () => {
      const saveHandler = server.getHandler('save_session_state');
      
      const result = await saveHandler({
        goal: 'Test',
        current_subtask: 'Test',
        status: 'active',
        loaded_skills: [],
        plan: [],
        assumptions: [],
        blockers: [],
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.deepStrictEqual(saved.loaded_skills, []);
      assert.deepStrictEqual(saved.plan, []);
    });

    it('should handle special characters in strings', async () => {
      const saveHandler = server.getHandler('save_session_state');
      
      await saveHandler({
        goal: 'Test with "quotes" and \\backslash',
        current_subtask: 'Line1\nLine2',
        status: 'active',
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.strictEqual(saved.goal, 'Test with "quotes" and \\backslash');
      assert.strictEqual(saved.current_subtask, 'Line1\nLine2');
    });

    it('should maintain separate concerns between session state and handoffs', async () => {
      const saveStateHandler = server.getHandler('save_session_state');
      const createHandoffHandler = server.getHandler('create_handoff');
      
      await saveStateHandler({
        goal: 'Session goal',
        current_subtask: 'Session subtask',
        status: 'active',
      });

      await createHandoffHandler({
        resume_from: 'Handoff point',
        next_actions: ['Action'],
        context_summary: 'Handoff context',
      });

      const saved = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      assert.strictEqual(saved.goal, 'Session goal');
      assert.ok(Array.isArray(saved.handoffs));
      assert.strictEqual(saved.handoffs.length, 1);
    });
  });

  describe('Multiple sessions', () => {
    it('should not interfere with different session directories', async () => {
      const otherDir = resolve(process.cwd(), '.claude_test_other');
      const otherFile = resolve(otherDir, 'session-state.json');
      
      mkdirSync(otherDir, { recursive: true });
      writeFileSync(otherFile, JSON.stringify({
        goal: 'Other session',
        current_subtask: 'Other subtask',
        status: 'completed',
        handoffs: [],
      }));

      const saveHandler = server.getHandler('save_session_state');
      await saveHandler({
        goal: 'Main session',
        current_subtask: 'Main subtask',
        status: 'active',
      });

      const mainState = JSON.parse(readFileSync(TEST_SESSION_STATE_FILE, 'utf-8'));
      const otherState = JSON.parse(readFileSync(otherFile, 'utf-8'));

      assert.strictEqual(mainState.goal, 'Main session');
      assert.strictEqual(otherState.goal, 'Other session');

      rmSync(otherDir, { recursive: true, force: true });
    });
  });
});
