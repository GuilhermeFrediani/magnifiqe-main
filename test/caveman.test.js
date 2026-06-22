/**
 * Test suite for src/caveman.js
 * Tests: registerCavemanTools, caveman_budget, validate_caveman_output
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerCavemanTools } from '../src/caveman.js';

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

// ─── Tool Registration ────────────────────────────────────────────────────────

describe('registerCavemanTools', () => {
  it('should export registerCavemanTools as a function', () => {
    assert.strictEqual(typeof registerCavemanTools, 'function');
  });

  it('should register all three caveman tools', () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    assert.ok(tools.validate_caveman_output, 'validate_caveman_output should be registered');
    assert.ok(tools.caveman_budget, 'caveman_budget should be registered');
    assert.ok(tools.auto_validate_output, 'auto_validate_output should be registered');
    assert.strictEqual(Object.keys(tools).length, 3, 'should register exactly 3 tools');
  });

  it('each tool handler should be a function', () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    for (const [name, tool] of Object.entries(tools)) {
      assert.strictEqual(typeof tool.handler, 'function', `handler of ${name} should be a function`);
    }
  });
});

// ─── caveman_budget ───────────────────────────────────────────────────────────

describe('caveman_budget handler', () => {
  it('should return budget info for simple complexity', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.caveman_budget.handler({ task_complexity: 'simple' });
    const text = mockResponse(result);

    assert.ok(text.includes('CAVEMAN BUDGET — simple'), 'should indicate simple complexity');
    assert.ok(text.includes('Max words: 30'), 'should show max words 30');
    assert.ok(text.includes('Max lines: 10'), 'should show max lines 10');
    assert.ok(text.includes('Max code lines: 50'), 'should show max code lines 50');
    assert.ok(text.includes('Max explanations: 0'), 'should show max explanations 0');
  });

  it('should return budget info for moderate complexity', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.caveman_budget.handler({ task_complexity: 'moderate' });
    const text = mockResponse(result);

    assert.ok(text.includes('CAVEMAN BUDGET — moderate'), 'should indicate moderate complexity');
    assert.ok(text.includes('Max words: 80'), 'should show max words 80');
    assert.ok(text.includes('Max explanations: 1'), 'should show max explanations 1');
  });

  it('should return budget info for complex complexity', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.caveman_budget.handler({ task_complexity: 'complex' });
    const text = mockResponse(result);

    assert.ok(text.includes('CAVEMAN BUDGET — complex'), 'should indicate complex complexity');
    assert.ok(text.includes('Max words: 200'), 'should show max words 200');
    assert.ok(text.includes('Max lines: 50'), 'should show max lines 50');
    assert.ok(text.includes('Max explanations: 3'), 'should show max explanations 3');
  });

  it('should include usage rules', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.caveman_budget.handler({ task_complexity: 'simple' });
    const text = mockResponse(result);

    assert.ok(text.includes('Rules:'), 'should include rules section');
    assert.ok(text.includes('No process narration'), 'should mention no process narration');
  });
});

// ─── validate_caveman_output ─────────────────────────────────────────────────

describe('validate_caveman_output handler', () => {
  it('should PASS for short, concise text', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.validate_caveman_output.handler({
      text: 'Fix: add null check before accessing user.name property.',
      task_complexity: 'simple',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('CAVEMAN SCORE: 10/10 (PASS)'), 'should return perfect score');
    assert.ok(text.includes('Words: 8/30'), 'should report word count within budget');
    assert.ok(text.includes('Lines: 1/10'), 'should report line count within budget');
  });

  it('should WARN for text that exceeds word budget', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    // 35 words exceeds simple budget of 30
    const verboseText = Array(35).fill('word').join(' ');
    const result = await tools.validate_caveman_output.handler({
      text: verboseText,
      task_complexity: 'simple',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('WARN') || text.includes('HALT'), 'should indicate warning or halt for over-budget');
    assert.ok(text.includes('Word count'), 'should mention word count issue');
  });

  it('should HALT for excessively verbose text with explanations', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const verboseText = `This is a very long explanation that goes way over the word budget for simple mode.
    The reason we need to do this is because the system requires careful handling.
    I'm going to explain every single detail here so you understand completely.
    Basically, this is the purpose of the function and it needs to be done this way.`;
    const result = await tools.validate_caveman_output.handler({
      text: verboseText,
      task_complexity: 'simple',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('HALT'), 'should return HALT verdict');
    assert.ok(text.includes('Explanation count'), 'should mention explanation count issue');
  });

  it('should detect code lines in output', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const codeText = `const x = 1;
function test() {
  return true;
}
if (x > 0) {
  console.log(x);
}`;
    const result = await tools.validate_caveman_output.handler({
      text: codeText,
      task_complexity: 'simple',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('Code lines:'), 'should report code lines');
    assert.ok(text.includes('/50'), 'should show code line budget');
  });

  it('should be more lenient for complex tasks', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const text = Array(100).fill('word').join(' ');
    const resultSimple = await tools.validate_caveman_output.handler({
      text,
      task_complexity: 'simple',
    });
    const resultComplex = await tools.validate_caveman_output.handler({
      text,
      task_complexity: 'complex',
    });

    const textSimple = mockResponse(resultSimple);
    const textComplex = mockResponse(resultComplex);

    // Simple should warn/halt for 100 words (exceeds 30 max), complex should pass
    assert.ok(textSimple.includes('HALT') || textSimple.includes('WARN'), 'simple should penalize 100 words');
    assert.ok(textComplex.includes('PASS'), 'complex should allow 100 words');
  });

  it('should include task complexity in output', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.validate_caveman_output.handler({
      text: 'short',
      task_complexity: 'moderate',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('Task complexity: moderate'), 'should report the task complexity');
  });

  it('should report issues when budget is exceeded', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    // Create text that exceeds both word and line budgets for simple
    const longText = Array(12).fill('this is a line of text to fill the budget').join('\n');
    const result = await tools.validate_caveman_output.handler({
      text: longText,
      task_complexity: 'simple',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('Issues:'), 'should list issues section');
    assert.ok(text.includes('Word count'), 'should have word count issue');
    assert.ok(text.includes('Line count'), 'should have line count issue');
  });
});

// ─── auto_validate_output ─────────────────────────────────────────────────────

describe('auto_validate_output handler', () => {
  it('should report file not found for invalid path', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.auto_validate_output.handler({
      file_path: '/nonexistent/path/file.js',
      code: 'const x = 1;',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('AUTO VALIDATE: FAIL'), 'should return FAIL');
    assert.ok(text.includes('FILE SYNC: FAIL'), 'should report file sync failure');
  });

  it('should pass code quality check for clean code', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.auto_validate_output.handler({
      file_path: process.cwd() + '/package.json',
      code: 'const x = 1;\nconst y = 2;',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('CODE QUALITY: PASS'), 'should pass code quality');
    assert.ok(text.includes('FILE SYNC: PASS'), 'should pass file sync for existing file');
  });

  it('should include file path in output', async () => {
    const { server, tools } = createMockServer();
    registerCavemanTools(server);

    const result = await tools.auto_validate_output.handler({
      file_path: '/some/path.js',
      code: 'const x = 1;',
    });
    const text = mockResponse(result);

    assert.ok(text.includes('File: /some/path.js'), 'should include the file path');
  });
});
