# test/council-live.test.js

- kind: js
- lines: 71
- bytes: 2817

## Summary
No inline summary detected

## Imports
- `node:test`
- `node:assert`
- `../src/council-json.js`
- `../src/council-orchestrator.js`

## Exports
- none

## Source
```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseLooseJson, normalizeCouncilJsonPayload } from '../src/council-json.js';
import { resolveLiveMode } from '../src/council-orchestrator.js';

describe('council live runtime', () => {
  it('resolves auto mode to simple when gate recommends skip', () => {
    const mode = resolveLiveMode('auto', { recommendation: 'skip' });
    assert.strictEqual(mode, 'simple');
  });

  it('resolves auto mode to deep when gate recommends full', () => {
    const mode = resolveLiveMode('auto', { recommendation: 'full' });
    assert.strictEqual(mode, 'deep');
  });

  it('parses loose json with fences and trailing commas', () => {
    const parsed = parseLooseJson('```json\n{ "bot": "contrarian", "thesis": "x", }\n```');
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.value.bot, 'contrarian');
  });

  it('normalizes bot position payloads into strict shape', () => {
    const result = normalizeCouncilJsonPayload('bot_position', {
      raw_text: JSON.stringify({
        bot: 'executor',
        problem_frame: 'Precisamos concluir o trabalho sem teatro.',
        thesis: 'Editar o código e validar tudo.',
        assumptions: ['A base atual é modular'],
        opportunities: ['Reduzir atrito entre IDE e modelo'],
        risks: ['Quebrar a inicialização do MCP'],
        next_steps: ['Editar código', 'Rodar testes'],
        evidence: 'Há testes e runtime existentes.',
        confidence: '88',
        tags: ['implementacao', 'teste'],
      }),
      expected_bot: 'executor',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.bot, 'executor');
    assert.strictEqual(result.normalized.confidence, 88);
    assert.deepStrictEqual(result.normalized.next_steps, ['Editar código', 'Rodar testes']);
  });

  it('normalizes peer review payloads into strict scores', () => {
    const result = normalizeCouncilJsonPayload('peer_review', {
      raw_text: JSON.stringify({
        reviewer_bot: 'contrarian',
        target_bot: 'executor',
        correctness_score: '5',
        novelty_score: '3',
        feasibility_score: '4',
        risk_awareness_score: '5',
        verdict: 'support',
        critique: 'Plano forte e verificável.',
        adopted_ideas: ['Rodar smoke test'],
        major_concerns: ['Manter rollback visível'],
      }),
      expected_reviewer_bot: 'contrarian',
      expected_target_bot: 'executor',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.normalized.reviewer_bot, 'contrarian');
    assert.strictEqual(result.normalized.target_bot, 'executor');
    assert.strictEqual(result.normalized.correctness_score, 5);
    assert.strictEqual(result.normalized.verdict, 'support');
  });
});

```
