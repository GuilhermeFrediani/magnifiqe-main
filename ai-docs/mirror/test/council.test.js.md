# test/council.test.js

- kind: js
- lines: 197
- bytes: 8499

## Summary
No inline summary detected

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`

## Exports
- none

## Source
```js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import {
  defaultCouncilState,
  loadCouncilState,
  saveCouncilState,
  evaluateCouncilNeed,
  buildCouncilSession,
  upsertCouncilPosition,
  upsertCouncilReview,
  synthesizeCouncilSession,
} from '../src/council.js';

const TEST_DIR = resolve(process.cwd(), '.claude_test_council');
const TEST_FILE = resolve(TEST_DIR, 'council_state.json');

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function makeSession(mode = 'full') {
  const gate = evaluateCouncilNeed({
    objective: 'Design and implement a council system for MCP orchestration',
    task_type: 'architecture-refactor',
    blast_radius: 'system',
    ambiguity: 4,
    tradeoff_intensity: 4,
    touches_multiple_modules: true,
    safety_critical: false,
    failure_cost: 'high',
  });

  return buildCouncilSession({
    objective: 'Implement Council',
    context: 'Existing MCP server with runtime/state tools',
    desired_output: 'Shippable deliberation system',
    constraints: ['No fake internal LLM calls', 'Persist state'],
    task_type: 'architecture-refactor',
    blast_radius: 'system',
    mode,
    maximum_rounds: 2,
    gate,
  });
}

function fillAllPositions(session) {
  upsertCouncilPosition(session, {
    bot: 'contrarian',
    problem_frame: 'The danger is shipping a decorative council with no real disagreement pressure.',
    thesis: 'Force explicit failure-mode analysis before synthesis.',
    assumptions: ['Most bad councils fail by fake consensus'],
    opportunities: ['Catch design drift earlier'],
    risks: ['Too much friction if objections are vague'],
    next_steps: ['Require contrarian evidence', 'Block synthesis without peer review'],
    evidence: 'The protocol explicitly targets anti-theater behavior.',
    confidence: 91,
    tags: ['anti-theater', 'risk', 'auditability'],
  });

  upsertCouncilPosition(session, {
    bot: 'first_principles',
    problem_frame: 'The system needs real divergence and auditability.',
    thesis: 'Create persisted sessions and structured evidence.',
    assumptions: ['The MCP must remain tool-based'],
    opportunities: ['Reduce theater risk'],
    risks: ['Too many tools could add friction'],
    next_steps: ['Add council session state', 'Add structured bot submissions'],
    evidence: 'Existing task-runtime and project-state patterns already exist.',
    confidence: 89,
    tags: ['state', 'auditability', 'deliberation'],
  });

  upsertCouncilPosition(session, {
    bot: 'expansionist',
    problem_frame: 'The feature can also improve role orchestration.',
    thesis: 'Add gate heuristics, peer review, reusable docs, and AI-first markdown traces.',
    assumptions: ['Users will want optional activation'],
    opportunities: ['Auto-gate', 'Reusable skill', 'Markdown mirror'],
    risks: ['Scope creep if always-on'],
    next_steps: ['Add council gate', 'Document peer review flow'],
    evidence: 'README already emphasizes activation and role posture.',
    confidence: 85,
    tags: ['deliberation', 'auto-gate', 'docs'],
  });

  upsertCouncilPosition(session, {
    bot: 'outsider',
    problem_frame: 'The danger is pretending to have a council without verifiable structure.',
    thesis: 'Block fake synthesis by requiring peer review and deterministic scoring.',
    assumptions: ['Free-form summaries alone are unreliable'],
    opportunities: ['Force stronger review discipline'],
    risks: ['Rigid schema may feel heavier'],
    next_steps: ['Require review queue', 'Compute auditable scorecards'],
    evidence: 'The user explicitly asked to avoid theater.',
    confidence: 91,
    tags: ['auditability', 'peer-review', 'anti-theater'],
  });

  upsertCouncilPosition(session, {
    bot: 'executor',
    problem_frame: 'The repo needs a minimal invasive implementation plan.',
    thesis: 'Ship one module, tests, docs, smoke validation, and markdown export.',
    assumptions: ['Current module registration pattern should remain intact'],
    opportunities: ['Keep implementation surgical'],
    risks: ['Broken tool registration would regress MCP startup'],
    next_steps: ['Register council tools', 'Run npm test', 'Run smoke test'],
    evidence: 'index.js already registers each module in one place.',
    confidence: 93,
    tags: ['implementation', 'testing', 'deliberation'],
  });
}

function fillAllReviews(session) {
  const reviews = [
    ['contrarian', 'first_principles', 5, 4, 4, 5, 'support', 'Strong fundamentals, but keep assumptions visible', ['structured evidence'], ['Guard against abstraction drift']],
    ['contrarian', 'executor', 4, 3, 5, 5, 'support', 'Execution is grounded and test-aware', ['smoke test'], ['Keep rollback visible']],
    ['first_principles', 'contrarian', 5, 4, 4, 5, 'support', 'Useful pressure on false certainty', ['failure-mode analysis'], ['Avoid generic negativity']],
    ['first_principles', 'expansionist', 4, 5, 4, 4, 'support', 'Good upside with bounded scope', ['markdown mirror'], ['Watch scope creep']],
    ['expansionist', 'outsider', 4, 5, 4, 5, 'support', 'Excellent anti-theater framing', ['deterministic scoring'], ['Schema weight']],
    ['expansionist', 'executor', 4, 4, 5, 4, 'support', 'Implementation posture keeps momentum', ['validation'], ['Do not skip docs']],
    ['outsider', 'contrarian', 5, 4, 4, 5, 'support', 'The objection layer is earned, not decorative', ['risk audit'], ['Need a safer-path clause']],
    ['outsider', 'first_principles', 5, 4, 5, 4, 'support', 'Properly separates fundamentals', ['structured evidence'], ['Need visible disagreement output']],
    ['executor', 'expansionist', 4, 4, 4, 3, 'support', 'Useful leverage without breaking scope', ['AI-first docs'], ['Avoid always-on mode']],
    ['executor', 'outsider', 5, 5, 4, 5, 'support', 'Most aligned with anti-theater requirement', ['peer review'], ['None']],
  ];

  for (const [reviewer_bot, target_bot, correctness_score, novelty_score, feasibility_score, risk_awareness_score, verdict, critique, adopted_ideas, major_concerns] of reviews) {
    upsertCouncilReview(session, {
      reviewer_bot,
      target_bot,
      correctness_score,
      novelty_score,
      feasibility_score,
      risk_awareness_score,
      verdict,
      critique,
      adopted_ideas,
      major_concerns,
    });
  }
}

describe('council runtime', () => {
  afterEach(() => cleanup());

  it('recommends full council for complex high-blast-radius work', () => {
    const result = evaluateCouncilNeed({
      objective: 'Refactor MCP architecture and add council workflow',
      task_type: 'architecture-refactor',
      blast_radius: 'system',
      ambiguity: 4,
      tradeoff_intensity: 4,
      touches_multiple_modules: true,
      safety_critical: true,
      failure_cost: 'high',
    });

    assert.strictEqual(result.recommendation, 'full');
    assert.strictEqual(result.maximum_rounds, 2);
    assert.ok(result.score >= 10);
  });

  it('persists council sessions to disk', () => {
    const state = defaultCouncilState();
    const session = makeSession('standard');
    state.sessions.push(session);
    saveCouncilState(state, TEST_FILE);

    const loaded = loadCouncilState(TEST_FILE);
    assert.strictEqual(loaded.sessions.length, 1);
    assert.strictEqual(loaded.sessions[0].objective, 'Implement Council');
    assert.strictEqual(loaded.sessions[0].peer_review_queue.length, 5);
    assert.strictEqual(loaded.sessions[0].role_order.length, 5);
  });

  it('synthesizes a ranked recommendation from positions and reviews with chairman output', () => {
    const session = makeSession('full');
    fillAllPositions(session);
    fillAllReviews(session);

    const synthesis = synthesizeCouncilSession(session);

    assert.strictEqual(session.status, 'synthesized');
    assert.strictEqual(synthesis.chairman, 'The Chairman');
    assert.ok(['high', 'medium'].includes(synthesis.confidence));
    assert.ok(synthesis.consensus.some((item) => item.includes('anti-theater') || item.includes('auditability') || item.includes('deliberation')));
    assert.ok(synthesis.recommended_next_step.length > 0);
    assert.strictEqual(synthesis.scorecard.length, 5);
    assert.ok(Array.isArray(synthesis.evidence_missing));
    assert.ok(synthesis.scorecard[0].weighted_score >= synthesis.scorecard[1].weighted_score);
  });
});

```
