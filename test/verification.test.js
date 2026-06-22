/**
 * Test suite for src/verification.js
 * Tests: registerVerificationTools, groundedness_score, detect_hallucination
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'path';
import { registerVerificationTools } from '../src/verification.js';

const PROJECT_ROOT = resolve(process.cwd());

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

describe('registerVerificationTools', () => {
  it('should register all 4 verification tools', () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const expectedTools = [
      'verify_file_sync',
      'detect_hallucination',
      'groundedness_score',
      'diff_since_last',
    ];

    for (const name of expectedTools) {
      assert.ok(tools[name], `Tool '${name}' should be registered`);
      assert.strictEqual(typeof tools[name].handler, 'function', `Tool '${name}' should have a handler function`);
    }

    assert.strictEqual(Object.keys(tools).length, 4, 'Should register exactly 4 tools');
  });
});

describe('groundedness_score', () => {
  it('should return high score for text referencing real files', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const result = await tools.groundedness_score.handler({
      text: 'The file src/config.js exports PROJECT_ROOT.',
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('GROUNDEDNESS SCORE:'), 'Should include score header');
    // src/config.js exists, so no file deduction
    assert.ok(!text.includes('Referenced file not found'), 'Should not have file-not-found issue');
    assert.ok(text.includes('Verdict:'), 'Should include a verdict');
  });

  it('should deduct score for references to nonexistent files', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const result = await tools.groundedness_score.handler({
      text: 'The file src/definitely_fake_file.js was created and updated.',
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('GROUNDEDNESS SCORE:'), 'Should include score header');
    assert.ok(text.includes('Referenced file not found'), 'Should flag nonexistent file');
    assert.ok(text.includes('src/definitely_fake_file.js'), 'Should name the missing file');
  });

  it('should detect test claims', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const result = await tools.groundedness_score.handler({
      text: 'All tests pass and the test suite is green.',
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('test claim'), 'Should flag test claims as unverified');
  });
});

describe('detect_hallucination', () => {
  it('should pass for claims about files that exist', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const result = await tools.detect_hallucination.handler({
      claims: ['package.json', 'src/config.js'],
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('HALLUCINATION CHECK: PASS'), 'Should pass for real files');
    assert.ok(text.includes('Passed: 2'), 'Should report 2 passed');
    assert.ok(text.includes('Failed: 0'), 'Should report 0 failed');
  });

  it('should fail for claims about nonexistent files', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const result = await tools.detect_hallucination.handler({
      claims: ['src/nonexistent_file.js'],
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('HALLUCINATION CHECK: FAIL'), 'Should fail for missing file');
    assert.ok(text.includes('Failed: 1'), 'Should report 1 failed');
    assert.ok(text.includes('File not found'), 'Should explain failure reason');
  });

  it('should check exports in file:export format', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    // src/config.js exists and exports PROJECT_ROOT
    const result = await tools.detect_hallucination.handler({
      claims: ['src/config.js:PROJECT_ROOT'],
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('HALLUCINATION CHECK: PASS'), 'Should pass for real export');
  });

  it('should handle mixed valid and invalid claims', async () => {
    const { server, tools } = createMockServer();
    registerVerificationTools(server);

    const result = await tools.detect_hallucination.handler({
      claims: ['package.json', 'src/ghost_module.js'],
      project_root: PROJECT_ROOT,
    });

    const text = result.content[0].text;
    assert.ok(text.includes('HALLUCINATION CHECK: FAIL'), 'Should fail when any claim is invalid');
    assert.ok(text.includes('Passed: 1'), 'Should report 1 passed');
    assert.ok(text.includes('Failed: 1'), 'Should report 1 failed');
  });
});
