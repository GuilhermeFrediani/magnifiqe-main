# test/council-handlers.test.js

- kind: js
- lines: 87
- bytes: 3048

## Summary
Either lists sessions or shows empty message

## Imports
- `node:test`
- `node:assert`
- `../src/council.js`

## Exports
- none

## Source
```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerCouncilTools } from '../src/council.js';

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

describe('council_gate handler', () => {
  it('returns skip recommendation for a trivial task', async () => {
    const { server, tools } = createMockServer();
    registerCouncilTools(server);

    const result = await tools.council_gate.handler({
      objective: 'Fix a typo in a comment',
    });

    const text = result.content[0].text;
    assert.ok(text.includes('## Council Gate'), 'should include header');
    assert.ok(text.includes('- Score: 0'), 'trivial task score should be 0');
    assert.ok(text.includes('- Recommendation: skip'), 'should recommend skip');
    assert.ok(text.includes('- Suggested rounds: 0'), 'skip should suggest 0 rounds');
  });

  it('returns full recommendation for a high-risk multi-module task', async () => {
    const { server, tools } = createMockServer();
    registerCouncilTools(server);

    const result = await tools.council_gate.handler({
      objective: 'Migrate authentication system to new protocol',
      task_type: 'architecture',
      blast_radius: 'system',
      ambiguity: 4,
      tradeoff_intensity: 3,
      touches_multiple_modules: true,
      safety_critical: true,
      failure_cost: 'high',
    });

    const text = result.content[0].text;
    assert.ok(text.includes('## Council Gate'), 'should include header');
    assert.ok(text.includes('- Recommendation: full'), 'should recommend full council');
    assert.ok(text.includes('- Suggested rounds: 2'), 'full should suggest 2 rounds');

    const scoreMatch = text.match(/- Score: (\d+)/);
    assert.ok(scoreMatch, 'should contain score');
    assert.ok(Number(scoreMatch[1]) >= 10, 'score should be >= 10 for full recommendation');
  });
});

describe('get_council_session handler', () => {
  it('lists sessions when no session_id is provided', async () => {
    const { server, tools } = createMockServer();
    registerCouncilTools(server);

    const result = await tools.get_council_session.handler({});
    const text = result.content[0].text;

    assert.ok(text.includes('## Council Sessions'), 'should include sessions header');
    // Either lists sessions or shows empty message
    assert.ok(
      text.includes('No council sessions found.') || text.includes('|'),
      'should show session list or empty message',
    );
  });

  it('returns not-found message for a nonexistent session_id', async () => {
    const { server, tools } = createMockServer();
    registerCouncilTools(server);

    const result = await tools.get_council_session.handler({
      session_id: 'nonexistent-session-id',
    });

    const text = result.content[0].text;
    assert.ok(text.includes('Council session not found: nonexistent-session-id'), 'should report session not found');
  });
});

```
