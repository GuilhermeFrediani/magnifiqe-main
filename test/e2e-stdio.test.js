import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function readLines(stream, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    while (buffer.includes('\n')) {
      const idx = buffer.indexOf('\n');
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onLine(JSON.parse(line));
    }
  });
}

describe('MCP stdio E2E', () => {
  it('should initialize and list tools over stdio', async () => {
    const child = spawn(process.execPath, [resolve(process.cwd(), 'src/index.js'), '--project-root', '.', '--rules-dir', './ai-rules'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    const errors = [];
    readLines(child.stdout, (msg) => responses.push(msg));
    child.stderr.on('data', (chunk) => errors.push(chunk.toString('utf8')));

    const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    const waitFor = async (predicate, label) => {
      const started = Date.now();
      while (Date.now() - started < 5000) {
        const hit = responses.find(predicate);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`Timeout waiting for ${label}. stderr=${errors.join(' ')}`);
    };

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    const initResponse = await waitFor((msg) => msg.id === 1, 'initialize response');
    assert.ok(initResponse.result);
    assert.strictEqual(initResponse.result.serverInfo.name, 'stack-perfeita-mcp');

    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    const toolsResponse = await waitFor((msg) => msg.id === 2, 'tools/list response');
    const toolNames = toolsResponse.result.tools.map((tool) => tool.name);

    assert.ok(toolNames.includes('activate_project'));
    assert.ok(toolNames.includes('doctor_runtime_setup'));
    assert.ok(toolNames.includes('activate_role'));
    assert.ok(toolNames.includes('start_task_contract'));
    assert.ok(toolNames.includes('assert_step_evidence'));
    assert.ok(toolNames.includes('get_prompt_script'));

    child.kill('SIGTERM');
  });
});
