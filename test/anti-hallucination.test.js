/**
 * Tests for src/anti-hallucination.js — the orchestrator that registers
 * all anti-hallucination tools by delegating to verification, watchdog, and caveman.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerAntiHallucinationTools } from '../src/anti-hallucination.js';

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

describe('registerAntiHallucinationTools', () => {
  it('is a function', () => {
    assert.strictEqual(typeof registerAntiHallucinationTools, 'function');
  });

  it('registers all expected tools (verification + watchdog + caveman + prompt-injection)', () => {
    const { server, tools } = createMockServer();
    registerAntiHallucinationTools(server);

    const toolNames = Object.keys(tools);
    assert.strictEqual(toolNames.length, 12, `expected 12 tools, got ${toolNames.length}: ${toolNames.join(', ')}`);
  });

  it('contains tool from prompt-injection.js', () => {
    const { server, tools } = createMockServer();
    registerAntiHallucinationTools(server);

    const promptInjectionTools = [
      'detect_prompt_injection',
    ];
    for (const name of promptInjectionTools) {
      assert.ok(name in tools, `missing prompt-injection tool: ${name}`);
      assert.strictEqual(typeof tools[name].handler, 'function', `${name} handler should be a function`);
    }
  });

  it('contains tools from verification.js', () => {
    const { server, tools } = createMockServer();
    registerAntiHallucinationTools(server);

    const verificationTools = [
      'verify_file_sync',
      'detect_hallucination',
      'groundedness_score',
      'diff_since_last',
    ];
    for (const name of verificationTools) {
      assert.ok(name in tools, `missing verification tool: ${name}`);
      assert.strictEqual(typeof tools[name].handler, 'function', `${name} handler should be a function`);
    }
  });

  it('contains tools from watchdog.js', () => {
    const { server, tools } = createMockServer();
    registerAntiHallucinationTools(server);

    const watchdogTools = [
      'run_test_and_report',
      'detect_output_dedup',
      'session_watchdog',
      'session_health',
    ];
    for (const name of watchdogTools) {
      assert.ok(name in tools, `missing watchdog tool: ${name}`);
      assert.strictEqual(typeof tools[name].handler, 'function', `${name} handler should be a function`);
    }
  });

  it('contains tools from caveman.js', () => {
    const { server, tools } = createMockServer();
    registerAntiHallucinationTools(server);

    const cavemanTools = [
      'validate_caveman_output',
      'caveman_budget',
      'auto_validate_output',
    ];
    for (const name of cavemanTools) {
      assert.ok(name in tools, `missing caveman tool: ${name}`);
      assert.strictEqual(typeof tools[name].handler, 'function', `${name} handler should be a function`);
    }
  });
});
