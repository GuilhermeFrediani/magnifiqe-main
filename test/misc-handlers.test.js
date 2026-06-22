/**
 * Handler-level tests for src/profiles.js, src/roles.js,
 * src/task-runtime.js, src/commands.js
 *
 * Uses the createMockServer pattern: register tools into a mock server,
 * then invoke handlers directly and assert on the returned content.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { registerProfilesTools } from '../src/profiles.js';
import { registerRolesTools } from '../src/roles.js';
import { registerTaskRuntimeTools, TASK_RUNTIME_FILE } from '../src/task-runtime.js';
import { registerCommandsTools } from '../src/commands.js';
import { rateLimiter } from '../src/rate-limiter.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function mockResponse(result) {
  return result?.content?.[0]?.text || '';
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

// Keep rate limiter clean across tests
beforeEach(() => {
  rateLimiter.counters = {};
});

// Preserve and restore task_runtime.json around task-runtime handler tests
let savedRuntime = null;

function snapshotRuntime() {
  if (existsSync(TASK_RUNTIME_FILE)) {
    savedRuntime = readFileSync(TASK_RUNTIME_FILE, 'utf-8');
  } else {
    savedRuntime = null;
  }
}

function restoreRuntime() {
  if (savedRuntime !== null) {
    writeFileSync(TASK_RUNTIME_FILE, savedRuntime, 'utf-8');
  }
}

// ─── get_model_profile ────────────────────────────────────────────────────────

describe('get_model_profile handler', () => {
  it('should return profile info for a known model alias', async () => {
    const { server, tools } = createMockServer();
    registerProfilesTools(server);

    const result = await tools.get_model_profile.handler({ model: 'claude' });
    const text = mockResponse(result);

    assert.ok(text.includes('## Profile:'), 'should contain profile header');
    assert.ok(text.includes('Claude (Anthropic)'), 'should show the profile name');
    assert.ok(text.includes('Family: anthropic'), 'should show the family');
    assert.ok(text.includes('### Capability Matrix'), 'should include capability matrix');
  });

  it('should return error message for an unknown model', async () => {
    const { server, tools } = createMockServer();
    registerProfilesTools(server);

    const result = await tools.get_model_profile.handler({ model: 'nonexistent-model' });
    const text = mockResponse(result);

    assert.ok(text.includes('Unknown model/profile'), 'should indicate unknown model');
    assert.ok(text.includes('Available families'), 'should list available families');
  });
});

// ─── activate_role ────────────────────────────────────────────────────────────

describe('activate_role handler', () => {
  it('should return adapted role preset for a valid role and model', async () => {
    const { server, tools } = createMockServer();
    registerRolesTools(server);

    const result = await tools.activate_role.handler({
      role: 'architect',
      model: 'gpt',
      task_type: 'refactor',
      stack: 'Next.js + Node + Postgres',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('## Role activated: architect'), 'should show role header');
    assert.ok(text.includes('Model family: openai'), 'should resolve gpt to openai family');
    assert.ok(text.includes('Task type: refactor'), 'should include task type');
    assert.ok(text.includes('Stack: Next.js + Node + Postgres'), 'should include stack');
    assert.ok(text.includes('### Operating posture'), 'should include posture section');
    assert.ok(text.includes('### Priority rules'), 'should include priority rules');
    assert.ok(text.includes('### Required gates'), 'should include required gates');
  });

  it('should use default model family when model is omitted', async () => {
    const { server, tools } = createMockServer();
    registerRolesTools(server);

    const result = await tools.activate_role.handler({ role: 'debugger' });
    const text = mockResponse(result);

    assert.ok(text.includes('## Role activated: debugger'), 'should show role header');
    assert.ok(text.includes('Model family:'), 'should include model family');
    assert.ok(text.includes('Task type: generic'), 'should show generic task type');
    assert.ok(text.includes('Stack: unspecified'), 'should show unspecified stack');
  });
});

// ─── start_task_contract ──────────────────────────────────────────────────────

describe('start_task_contract handler', () => {
  afterEach(() => restoreRuntime());

  it('should create a contract and return formatted output', async () => {
    snapshotRuntime();
    const { server, tools } = createMockServer();
    registerTaskRuntimeTools(server);

    const result = await tools.start_task_contract.handler({
      objective: 'Refactor auth module',
      inputs: 'Existing codebase + auth docs',
      outputs: 'Clean auth module with tests',
      non_goals: 'Rewrite the database layer',
      acceptance_criteria: 'All tests pass, coverage > 80%',
      risks: 'Breaking existing login flow',
      minimum_evidence: 'Test suite green + manual login test',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('## Task contract started'), 'should show contract header');
    assert.ok(text.includes('Objective: Refactor auth module'), 'should include objective');
    assert.ok(text.includes('Inputs: Existing codebase + auth docs'), 'should include inputs');
    assert.ok(text.includes('Outputs: Clean auth module with tests'), 'should include outputs');
    assert.ok(text.includes('Non-goals: Rewrite the database layer'), 'should include non-goals');
    assert.ok(text.includes('Acceptance criteria: All tests pass'), 'should include acceptance criteria');
    assert.ok(text.includes('Risks: Breaking existing login flow'), 'should include risks');
    assert.ok(text.includes('Minimum evidence: Test suite green'), 'should include minimum evidence');
    assert.ok(text.includes('Created at:'), 'should include creation timestamp');
  });
});

// ─── assert_step_evidence ─────────────────────────────────────────────────────

describe('assert_step_evidence handler', () => {
  afterEach(() => restoreRuntime());

  it('should record verified evidence with timestamp', async () => {
    snapshotRuntime();
    const { server, tools } = createMockServer();
    registerTaskRuntimeTools(server);

    const result = await tools.assert_step_evidence.handler({
      hypothesis: 'Auth middleware correctly validates tokens',
      evidence: 'All 12 auth tests pass',
      verification: 'Ran test suite, inspected middleware response codes',
      status: 'verified',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('## Step evidence recorded'), 'should show evidence header');
    assert.ok(text.includes('Hypothesis: Auth middleware correctly validates tokens'), 'should include hypothesis');
    assert.ok(text.includes('Evidence: All 12 auth tests pass'), 'should include evidence');
    assert.ok(text.includes('Verification: Ran test suite'), 'should include verification');
    assert.ok(text.includes('Status: verified'), 'should include status');
    assert.ok(text.includes('Timestamp:'), 'should include timestamp');
    assert.ok(text.includes('Evidence log size:'), 'should report log size');
  });
});

// ─── run_command ──────────────────────────────────────────────────────────────

describe('run_command handler', () => {
  it('should return HALT message for a missing command', async () => {
    const { server, tools } = createMockServer();
    registerCommandsTools(server);

    const result = await tools.run_command.handler({ name: 'nonexistent-cmd' });
    const text = mockResponse(result);

    assert.ok(text.includes('HALT'), 'should return HALT for missing command');
    assert.ok(text.includes('nonexistent-cmd'), 'should include the command name');
  });

  it('should execute an existing command and substitute args', async () => {
    const { server, tools } = createMockServer();
    registerCommandsTools(server);

    const result = await tools.run_command.handler({
      name: 'code-analysis',
      args: 'src/config.js',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('## Command: code-analysis'), 'should include command header');
    assert.ok(text.includes('src/config.js'), 'should substitute args into template');
    assert.ok(text.includes('Code Analysis Command'), 'should contain command content');
  });
});
