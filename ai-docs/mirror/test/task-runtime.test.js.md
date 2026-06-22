# test/task-runtime.test.js

- kind: js
- lines: 55
- bytes: 1855

## Summary
No inline summary detected

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`
- `../src/task-runtime.js`

## Exports
- none

## Source
```js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { defaultTaskRuntime, loadTaskRuntime, saveTaskRuntime } from '../src/task-runtime.js';

const TEST_DIR = resolve(process.cwd(), '.claude_test_runtime');
const TEST_FILE = resolve(TEST_DIR, 'task_runtime.json');

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('task runtime state', () => {
  afterEach(() => cleanup());

  it('should create default runtime when file is missing', () => {
    const state = loadTaskRuntime(TEST_FILE);
    assert.strictEqual(state.current_contract, null);
    assert.deepStrictEqual(state.contracts_history, []);
    assert.deepStrictEqual(state.evidence_log, []);
  });

  it('should persist current contract and evidence', () => {
    const state = defaultTaskRuntime();
    state.current_contract = {
      objective: 'Refinar MCP',
      inputs: 'repo + auditoria',
      outputs: 'patch testado',
      non_goals: 'reescrever tudo',
      acceptance_criteria: 'testes verdes',
      risks: 'regressão',
      minimum_evidence: 'npm test',
      created_at: new Date().toISOString(),
    };
    state.contracts_history.push(state.current_contract);
    state.evidence_log.push({
      hypothesis: 'safeResolvePath está vulnerável',
      evidence: 'prefix collision',
      verification: 'teste reproduzido',
      status: 'verified',
      timestamp: new Date().toISOString(),
    });

    saveTaskRuntime(state, TEST_FILE);
    const loaded = loadTaskRuntime(TEST_FILE);

    assert.strictEqual(loaded.current_contract.objective, 'Refinar MCP');
    assert.strictEqual(loaded.evidence_log.length, 1);
    assert.strictEqual(loaded.contracts_history.length, 1);
  });
});

```
