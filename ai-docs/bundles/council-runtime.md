# Council Runtime

Council estruturado, Council Live, contratos de prompt e regras de deliberação.

## Included files
- `src/council.js` — Council Orchestrator — thin coordination layer that wires council modules to MCP tool registration. All business logic lives in: - council-gate.js      (gate scoring) - council-session.js   (session CRUD, constants, utilities) - council-synthesis.js (deterministic synthesis)
- `ai-rules/12-council-deliberation.md` — Council Deliberation Protocol
- `ai-rules/13-live-council-runtime.md` — Live Council Runtime
- `test/council-live.test.js` — No inline summary detected
- `test/council.test.js` — No inline summary detected
- `test-smoke-council.mjs` — ignore non-json lines

## src/council.js

- kind: js
- lines: 328
- summary: Council Orchestrator — thin coordination layer that wires council modules to MCP tool registration. All business logic lives in: - council-gate.js      (gate scoring) - council-session.js   (session CRUD, constants, utilities) - council-synthesis.js (deterministic synthesis)

```js
/**
 * Council Orchestrator — thin coordination layer that wires council modules
 * to MCP tool registration. All business logic lives in:
 *   - council-gate.js      (gate scoring)
 *   - council-session.js   (session CRUD, constants, utilities)
 *   - council-synthesis.js (deterministic synthesis)
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Re-exports from sub-modules (backward compatibility) ───────────────────

export { evaluateCouncilNeed } from "./council-gate.js";

export {
  COUNCIL_BOT_ORDER,
  COUNCIL_BOT_BRIEFS,
  defaultCouncilState,
  buildCouncilSession,
  loadCouncilState,
  saveCouncilState,
  upsertCouncilPosition,
  upsertCouncilReview,
} from "./council-session.js";

export { synthesizeCouncilSession } from "./council-synthesis.js";

// ─── Local imports for registerCouncilTools ─────────────────────────────────

import { evaluateCouncilNeed, formatGateResult } from "./council-gate.js";
import {
  COUNCIL_BOT_ORDER,
  FAILURE_COST_VALUES,
  BLAST_RADIUS_VALUES,
  MODE_VALUES,
  buildCouncilSession,
  loadCouncilState,
  saveCouncilState,
  findSession,
  ensureSession,
  upsertCouncilPosition,
  upsertCouncilReview,
  formatSession,
  formatSessionList,
} from "./council-session.js";
import { titleCaseBot, REVIEW_VERDICTS } from "./council-prompts.js";
import { synthesizeCouncilSession, formatSynthesis } from "./council-synthesis.js";

// ─── Tool Registration ─────────────────────────────────────────────────────

export function registerCouncilTools(server) {
  server.tool(
    "council_gate",
    "Scores whether a task deserves Council deliberation. Use before paying coordination cost on simple work.",
    {
      objective: z.string().describe("Short description of the task or decision."),
      task_type: z.string().optional().describe("Task label such as architecture, bugfix, refactor, security-review."),
      blast_radius: z.enum(BLAST_RADIUS_VALUES).optional().describe("How far a bad decision would spread."),
      ambiguity: z.number().int().min(0).max(5).optional().describe("How ambiguous the task framing is from 0-5."),
      tradeoff_intensity: z.number().int().min(0).max(5).optional().describe("How strong the trade-offs are from 0-5."),
      touches_multiple_modules: z.boolean().optional().describe("Whether the work spans multiple modules/services."),
      safety_critical: z.boolean().optional().describe("Whether security, safety, or compliance risk is material."),
      failure_cost: z.enum(FAILURE_COST_VALUES).optional().describe("Cost of a wrong decision."),
    },
    async ({ objective, task_type, blast_radius, ambiguity, tradeoff_intensity, touches_multiple_modules, safety_critical, failure_cost }) => {
      const rateLimitHit = rateLimiter.check("council_gate");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const result = evaluateCouncilNeed({
          objective,
          task_type,
          blast_radius: blast_radius || "local",
          ambiguity: ambiguity || 0,
          tradeoff_intensity: tradeoff_intensity || 0,
          touches_multiple_modules: touches_multiple_modules || false,
          safety_critical: safety_critical || false,
          failure_cost: failure_cost || "low",
        });

        return { content: [{ type: "text", text: `## Council Gate\n\n${formatGateResult(result)}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in council_gate: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "start_council_session",
    "Creates a persisted Council session with five bot briefs, shuffled peer-review queue, stop rules, scoring rubric, and Chairman synthesis.",
    {
      objective: z.string().describe("The decision or implementation objective under deliberation."),
      context: z.string().describe("Relevant repo, architecture, bug, or product context."),
      desired_output: z.string().describe("What the final deliverable from deliberation should unlock."),
      constraints: z.array(z.string()).optional().describe("Scope, time, stack, quality, or policy constraints."),
      task_type: z.string().optional().describe("Task label such as architecture, refactor, migration, debugging."),
      blast_radius: z.enum(BLAST_RADIUS_VALUES).optional().describe("How far a bad decision would spread."),
      mode: z.enum(MODE_VALUES).optional().describe("auto uses the gate heuristic; off bypasses activation."),
      ambiguity: z.number().int().min(0).max(5).optional().describe("How ambiguous the framing is from 0-5."),
      tradeoff_intensity: z.number().int().min(0).max(5).optional().describe("How strong the trade-offs are from 0-5."),
      touches_multiple_modules: z.boolean().optional().describe("Whether the work spans multiple modules/services."),
      safety_critical: z.boolean().optional().describe("Whether security, safety, or compliance risk is material."),
      failure_cost: z.enum(FAILURE_COST_VALUES).optional().describe("Cost of a wrong decision."),
      maximum_rounds: z.number().int().min(0).max(2).optional().describe("Upper bound for deliberation rounds. Full mode caps at 2."),
    },
    async ({ objective, context, desired_output, constraints, task_type, blast_radius, mode, ambiguity, tradeoff_intensity, touches_multiple_modules, safety_critical, failure_cost, maximum_rounds }) => {
      const rateLimitHit = rateLimiter.check("start_council_session");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const gate = evaluateCouncilNeed({
          objective,
          task_type,
          blast_radius: blast_radius || "local",
          ambiguity: ambiguity || 0,
          tradeoff_intensity: tradeoff_intensity || 0,
          touches_multiple_modules: touches_multiple_modules || false,
          safety_critical: safety_critical || false,
          failure_cost: failure_cost || "low",
        });

        const session = buildCouncilSession({
          objective,
          context,
          desired_output,
          constraints: constraints || [],
          task_type,
          blast_radius: blast_radius || "local",
          mode: mode || "auto",
          maximum_rounds: maximum_rounds ?? gate.maximum_rounds,
          gate,
        });

        const state = loadCouncilState();
        state.sessions.push(session);
        saveCouncilState(state);

        return { content: [{ type: "text", text: formatSession(session) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in start_council_session: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "get_council_session",
    "Lists Council sessions or returns one specific session with progress counters and peer-review queue.",
    {
      session_id: z.string().optional().describe("Council session id. Omit to list recent sessions."),
    },
    async ({ session_id }) => {
      const rateLimitHit = rateLimiter.check("get_council_session");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const state = loadCouncilState();
        if (!session_id) {
          return { content: [{ type: "text", text: `## Council Sessions\n\n${formatSessionList(state.sessions)}` }] };
        }

        const session = findSession(state, session_id);
        if (!session) {
          return { content: [{ type: "text", text: `Council session not found: ${session_id}` }] };
        }

        return { content: [{ type: "text", text: formatSession(session) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_council_session: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "record_council_position",
    "Stores or updates one bot position in a Council session. Requires structured claims so synthesis is auditable, not theatrical.",
    {
      session_id: z.string().describe("Council session id."),
      bot: z.enum(COUNCIL_BOT_ORDER).describe("Which Council bot is submitting the position."),
      problem_frame: z.string().describe("How this bot frames the task before solving it."),
      thesis: z.string().describe("Core recommendation or viewpoint from this bot."),
      assumptions: z.array(z.string()).describe("Assumptions that shape the recommendation."),
      opportunities: z.array(z.string()).describe("Additional opportunities or leverage points."),
      risks: z.array(z.string()).describe("Primary risks, failure modes, or objections."),
      next_steps: z.array(z.string()).describe("Concrete proposed next steps in priority order."),
      evidence: z.string().describe("Evidence used so far: files, tests, benchmarks, incidents, or constraints."),
      confidence: z.number().int().min(0).max(100).describe("How confident the bot is in the position."),
      tags: z.array(z.string()).describe("Short reusable tags like safety, refactor, dx, latency, testing."),
    },
    async ({ session_id, bot, problem_frame, thesis, assumptions, opportunities, risks, next_steps, evidence, confidence, tags }) => {
      const rateLimitHit = rateLimiter.check("record_council_position");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      const state = loadCouncilState();
      try {
        const session = ensureSession(state, session_id);
        upsertCouncilPosition(session, {
          bot,
          problem_frame,
          thesis,
          assumptions,
          opportunities,
          risks,
          next_steps,
          evidence,
          confidence,
          tags,
        });
        saveCouncilState(state);
        return {
          content: [{
            type: "text",
            text: `Council position recorded for ${titleCaseBot(bot)}.\n\n${formatSession(session)}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }] };
      }
    }
  );

  server.tool(
    "record_council_review",
    "Stores one peer review between Council bots. Self-review is blocked. Reviews are upserted per reviewer-target pair.",
    {
      session_id: z.string().describe("Council session id."),
      reviewer_bot: z.enum(COUNCIL_BOT_ORDER).describe("Bot performing the review."),
      target_bot: z.enum(COUNCIL_BOT_ORDER).describe("Bot being reviewed."),
      correctness_score: z.number().int().min(1).max(5).describe("How correct the reviewer judges the target position."),
      novelty_score: z.number().int().min(1).max(5).describe("How much useful novelty the target position adds."),
      feasibility_score: z.number().int().min(1).max(5).describe("How implementable the target position is."),
      risk_awareness_score: z.number().int().min(1).max(5).describe("How well the target position handles downside and failure modes."),
      verdict: z.enum(REVIEW_VERDICTS).describe("Overall stance from the reviewer."),
      critique: z.string().describe("Concise justification for the verdict."),
      adopted_ideas: z.array(z.string()).describe("Ideas from the target position the reviewer adopts."),
      major_concerns: z.array(z.string()).describe("Key concerns that the Chairman should preserve in synthesis."),
    },
    async ({ session_id, reviewer_bot, target_bot, correctness_score, novelty_score, feasibility_score, risk_awareness_score, verdict, critique, adopted_ideas, major_concerns }) => {
      const rateLimitHit = rateLimiter.check("record_council_review");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };
      if (reviewer_bot === target_bot) {
        return { content: [{ type: "text", text: "Council review rejected: reviewer_bot cannot equal target_bot." }] };
      }

      const state = loadCouncilState();
      try {
        const session = ensureSession(state, session_id);
        const allowedPair = session.peer_review_queue.some((item) => item.reviewer_bot === reviewer_bot && item.target_bot === target_bot);
        if (!allowedPair) {
          return {
            content: [{ type: "text", text: `Council review pair not in queue: ${reviewer_bot} -> ${target_bot}` }],
          };
        }

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
        saveCouncilState(state);
        return {
          content: [{
            type: "text",
            text: `Council review recorded: ${titleCaseBot(reviewer_bot)} -> ${titleCaseBot(target_bot)}.\n\n${formatSession(session)}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }] };
      }
    }
  );

  server.tool(
    "synthesize_council",
    "Runs deterministic Council synthesis from stored positions and peer reviews. Produces consensus, disagreements, discarded ideas, risk ranking, and recommended next step.",
    {
      session_id: z.string().describe("Council session id."),
    },
    async ({ session_id }) => {
      const rateLimitHit = rateLimiter.check("synthesize_council");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      const state = loadCouncilState();
      try {
        const session = ensureSession(state, session_id);
        const synthesis = synthesizeCouncilSession(session);
        saveCouncilState(state);
        return { content: [{ type: "text", text: formatSynthesis(synthesis) }] };
      } catch (error) {
        return { content: [{ type: "text", text: error.message }] };
      }
    }
  );

  // Tool: delete_session
  server.tool(
    "delete_council_session",
    "Deletes a Council session by ID. Use to clean up old or unneeded sessions.",
    {
      session_id: z.string().describe("The session ID to delete."),
    },
    async ({ session_id }) => {
      const rateLimitHit = rateLimiter.check("delete_council_session");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const state = loadCouncilState();
        const index = state.sessions.findIndex((s) => s.session_id === session_id);
        if (index === -1) {
          return { content: [{ type: "text", text: `Session not found: ${session_id}` }] };
        }
        state.sessions.splice(index, 1);
        saveCouncilState(state);
        return { content: [{ type: "text", text: `Session deleted: ${session_id}\nRemaining sessions: ${state.sessions.length}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `HALT — Error deleting session: ${error.message}` }] };
      }
    }
  );
}

```

## ai-rules/12-council-deliberation.md

- kind: md
- lines: 86
- summary: Council Deliberation Protocol

```md
# Council Deliberation Protocol

> Goal: add real multi-perspective deliberation without turning the MCP into theater, latency sludge, or endless debate.

## 1. Activation gate first
- Do **not** run Council on every task.
- Use Council when the task has at least one of:
  - architecture or migration impact
  - non-obvious trade-offs
  - cross-module blast radius
  - security / safety relevance
  - ambiguity in framing
- Skip Council for trivial CRUD, renames, boilerplate, or narrow bugfixes.

## 2. The five bots have non-overlapping mandates
### The Contrarian
- Hunts for weak assumptions, hidden failure modes, and unjustified confidence.
- Must challenge thin evidence and optimistic execution claims.
- Must not disagree for theater; every objection must point to a safer path.

### The First Principles Thinker
- Rebuilds the solution from zero.
- Must separate facts, assumptions, and invariants.
- Must resist inherited architecture bias.

### The Expansionist
- Hunts for opportunities that the default plan ignored.
- Must distinguish quick wins from scope creep.
- Must name DX, performance, security, automation, or reuse upside.

### The Outsider
- Challenges the framing itself.
- Must assume the original question may be wrong or incomplete.
- Must surface sunk-cost bias, false constraints, and blind spots.

### The Executor
- Converts the best direction into implementable next steps.
- Must define sequencing, evidence, rollback, and acceptance.
- Must not pretend unresolved architectural risks are implementation details.

## 3. Peer review is mandatory on complex work
- Council is not real if every bot speaks once and nobody challenges anything.
- Each bot must review assigned peers from a shuffled queue.
- Reviews must score:
  - correctness
  - novelty
  - feasibility
  - risk awareness
- Reviews must preserve major concerns for synthesis.
- Standard mode uses one review per bot.
- Full mode uses two reviews per bot.

## 4. Chairman rules
- The Chairman is **not** a vibe-based summarizer.
- The Chairman does not replace the five bots; the Chairman synthesizes their structured output.
- Final synthesis must contain:
  - consensus
  - disagreements
  - discarded ideas and why
  - risk ranking
  - recommended next step
  - confidence level
  - evidence still missing

## 5. Anti-theater rules
- Do not simulate multiple minds with cosmetic persona names only.
- If positions are not structurally different, call that out.
- If peer review is incomplete, synthesis must halt.
- If the same objection repeats without new evidence, stop further rounds.
- Maximum rounds: 2.

## 6. Integration with Stack Perfeita runtime
- Start with task contract and project activation.
- Use Council as an optional deliberation layer, not a replacement for validation.
- After Chairman synthesis, continue with:
  - `assert_step_evidence(...)`
  - `validate_bad_code(...)`
  - `dependency_validate(...)`
  - `checkpoint_task(...)`

## 7. Expected behavior
- Prefer real disagreement over fake harmony.
- Prefer explicit uncertainty over invented certainty.
- Prefer one justified next step over ten decorative suggestions.
- Prefer a compact Markdown trace over long conversational theater.

```

## ai-rules/13-live-council-runtime.md

- kind: md
- lines: 112
- summary: Live Council Runtime

```md
# Live Council Runtime

> Goal: make Council + Chairman work as a live, provider-agnostic protocol that can run inside any IDE, with one chosen model or mixed providers, without depending on special hidden features.

## 1. One runtime, many providers
- The protocol must work with GPT, Claude, Gemini, GLM, MiMo, Qwen or any other model that can follow prompt instructions.
- Do not hardcode provider-specific behavior into the reasoning contract.
- The runtime lives in:
  - strict prompts
  - compact JSON schemas
  - normalization / repair for weak JSON output
  - activation heuristics that choose simple vs deep mode

## 2. Two execution modes
### Simple mode
Use one model call when the task is narrow, direct or low-blast-radius.

Flow:
1. compact context in Markdown
2. one I/O agent call
3. direct answer

### Deep mode
Use structured deliberation when ambiguity, trade-offs or blast radius are high.

Flow:
1. same compact context base
2. 5 bot positions
3. shuffled peer review
4. Chairman synthesis in JSON
5. final I/O agent converts JSON -> natural answer

## 3. Auto mode
- Auto mode must choose between simple and deep.
- Do not ask the model to decide by vibes only.
- Prefer heuristics based on:
  - ambiguity
  - trade-off intensity
  - blast radius
  - safety / trust impact
  - cross-module surface
  - failure cost

## 4. Shared anti-theater contract
All live stages must follow these rules:
- JSON only when a schema is requested
- no markdown fences
- no intro phrases
- no decorative self-talk
- no invented evidence
- if evidence is missing, say it explicitly in the proper field
- max 3 list items per field unless a schema says otherwise
- no persona blending; each turn is one role only

## 5. Bot output contract
Each bot position should stay compact and machine-checkable.
Required shape:
- `bot`
- `problem_frame`
- `thesis`
- `assumptions[]`
- `opportunities[]`
- `risks[]`
- `next_steps[]`
- `evidence`
- `confidence`
- `tags[]`

## 6. Peer review contract
Each review should score the target position and surface what the Chairman cannot ignore.
Required shape:
- `reviewer_bot`
- `target_bot`
- `correctness_score`
- `novelty_score`
- `feasibility_score`
- `risk_awareness_score`
- `verdict`
- `critique`
- `adopted_ideas[]`
- `major_concerns[]`

## 7. Chairman contract
The Chairman must not summarize decoratively.
Required shape:
- `recommended_answer`
- `alternatives[]`
- `next_step`
- `rationale[]`
- `risk_ranking[]`
- `evidence_missing[]`
- `confidence`

## 8. I/O final contract
- The final answer is natural language, not JSON.
- It must not mention bots, council, chairman or internal analysis.
- It must preserve uncertainty honestly when evidence is missing.
- It should give the user the answer first, then the next step if useful.

## 9. Token economy rules
- Use Markdown source packs, compact indexes and thematic bundles before raw code.
- Never paste the whole repo into the prompt.
- Reuse the same system contract across turns.
- Prefer compact schema-first outputs over free-form essays.
- Normalize bad JSON instead of rerunning the same call blindly.

## 10. Practical operating posture
- Simple mode is the default for most direct tasks.
- Deep mode is optional, not always-on.
- A single provider key is enough; personas come from prompts, not from separate accounts.
- Different models may be mixed later, but the protocol must remain valid even with one chosen model.

```

## test/council-live.test.js

- kind: js
- lines: 71
- summary: No inline summary detected

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

## test/council.test.js

- kind: js
- lines: 197
- summary: No inline summary detected

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

## test-smoke-council.mjs

- kind: mjs
- lines: 200
- summary: ignore non-json lines

```js
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
      if (!line) continue;
      try {
        onLine(JSON.parse(line));
      } catch {
        // ignore non-json lines
      }
    }
  });
}

async function main() {
  const child = spawn(process.execPath, [resolve(process.cwd(), 'src/index.js'), '--project-root', '.', '--rules-dir', './ai-rules'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses = [];
  const stderr = [];
  readLines(child.stdout, (msg) => responses.push(msg));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));

  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
  const waitForId = async (id, label) => {
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const hit = responses.find((msg) => msg.id === id);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Timeout waiting for ${label}. stderr=${stderr.join(' ')}`);
  };

  let id = 1;
  const callTool = async (name, argumentsPayload) => {
    const requestId = ++id;
    send({
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: { name, arguments: argumentsPayload },
    });
    return waitForId(requestId, name);
  };

  send({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    },
  });
  await waitForId(id, 'initialize');
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const start = await callTool('start_council_session', {
    objective: 'Adicionar council deliberation no MCP com implementação real e sem teatro',
    context: 'Repo Stack Perfeita MCP com state, validation e role activation já existentes',
    desired_output: 'Sistema testado com gate, sessão, peer review, chairman e síntese',
    constraints: ['Sem loop infinito', 'Persistência local', 'Síntese auditável'],
    task_type: 'architecture-refactor',
    blast_radius: 'system',
    mode: 'full',
    ambiguity: 4,
    tradeoff_intensity: 4,
    touches_multiple_modules: true,
    safety_critical: false,
    failure_cost: 'high',
    maximum_rounds: 2,
  });

  const startText = start.result.content[0].text;
  const match = startText.match(/Council Session: (council-[^\n]+)/);
  if (!match) throw new Error(`Could not extract session id. Response=${startText}`);
  const sessionId = match[1].trim();

  const positions = {
    contrarian: {
      problem_frame: 'Precisamos de conflito útil, não de consenso decorativo.',
      thesis: 'Adicionar um bot contrarian explícito antes da síntese.',
      assumptions: ['Sem pressão contrária o council vira teatro'],
      opportunities: ['Capturar riscos cedo'],
      risks: ['Atrito excessivo se a crítica for vaga'],
      next_steps: ['Criar bot contrarian', 'Exigir risco explícito por posição'],
      evidence: 'O pedido exige revisão crítica real.',
      confidence: 92,
      tags: ['anti-theater', 'risk', 'auditability'],
    },
    first_principles: {
      problem_frame: 'Precisamos de deliberação real, não personas decorativas.',
      thesis: 'Persistir sessões e exigir estrutura mínima por bot.',
      assumptions: ['O MCP continuará como camada de tooling'],
      opportunities: ['Maior auditabilidade'],
      risks: ['Schema excessivo pode gerar fricção'],
      next_steps: ['Criar src/council.js', 'Registrar ferramentas no index'],
      evidence: 'O projeto já possui padrões de state e tool registration.',
      confidence: 90,
      tags: ['auditabilidade', 'deliberation', 'state'],
    },
    expansionist: {
      problem_frame: 'A camada de council também pode melhorar a qualidade de decisões futuras.',
      thesis: 'Adicionar gate heurístico, skill dedicada, docs e espelho markdown.',
      assumptions: ['Council deve ser opcional'],
      opportunities: ['Auto-gate', 'Playbook reutilizável', 'AI docs'],
      risks: ['Virar default e pesar tarefas simples'],
      next_steps: ['Criar council_gate', 'Adicionar docs:ai'],
      evidence: 'Há ativação por roles e regras sob demanda.',
      confidence: 84,
      tags: ['deliberation', 'auto-gate', 'docs'],
    },
    outsider: {
      problem_frame: 'O maior erro seria dizer que existe council sem evidência verificável.',
      thesis: 'Bloquear síntese antes de peer review completo e ranquear posições por score.',
      assumptions: ['Resumo livre não basta'],
      opportunities: ['Dificultar alucinação de consenso'],
      risks: ['Mais rigidez na operação'],
      next_steps: ['Exigir review queue', 'Gerar scorecard'],
      evidence: 'O pedido exige evitar teatro explicitamente.',
      confidence: 92,
      tags: ['auditabilidade', 'peer-review', 'anti-theater'],
    },
    executor: {
      problem_frame: 'A mudança precisa ser mínima e validada por teste real.',
      thesis: 'Entregar módulo novo, testes, smoke test, docs e export markdown.',
      assumptions: ['O padrão atual de módulos deve permanecer'],
      opportunities: ['Validação E2E'],
      risks: ['Quebra no startup do MCP'],
      next_steps: ['Rodar npm test', 'Executar smoke test via stdio'],
      evidence: 'src/index.js centraliza o registro das tools.',
      confidence: 95,
      tags: ['implementation', 'testing', 'deliberation'],
    },
  };

  for (const [bot, payload] of Object.entries(positions)) {
    await callTool('record_council_position', { session_id: sessionId, bot, ...payload });
  }

  const reviews = [
    ['contrarian', 'first_principles', 5, 4, 4, 5, 'support', 'Boa base, precisa manter hipótese explícita', ['evidência estruturada'], ['Evitar abstração excessiva']],
    ['contrarian', 'executor', 4, 3, 5, 5, 'support', 'Execução boa e verificável', ['smoke test'], ['Manter rollback visível']],
    ['first_principles', 'contrarian', 5, 4, 4, 5, 'support', 'Pressão contrária útil e concreta', ['failure-mode analysis'], ['Evitar crítica vazia']],
    ['first_principles', 'expansionist', 4, 5, 4, 4, 'support', 'Bom upside sem explodir escopo', ['markdown mirror'], ['Controlar scope creep']],
    ['expansionist', 'outsider', 4, 5, 4, 5, 'support', 'Ótimo anti-teatro', ['scorecard'], ['Schema pode pesar']],
    ['expansionist', 'executor', 4, 4, 5, 4, 'support', 'Boa entrega incremental', ['validação'], ['Não pular docs']],
    ['outsider', 'contrarian', 5, 4, 4, 5, 'support', 'Conflito útil, não cosmético', ['risk audit'], ['Faltar caminho seguro']],
    ['outsider', 'first_principles', 5, 4, 5, 4, 'support', 'Boa separação entre fundamentos e execução', ['evidência estruturada'], ['Mostrar conflitos']],
    ['executor', 'expansionist', 4, 4, 4, 3, 'support', 'Boa alavanca futura', ['AI docs'], ['Evitar always-on']],
    ['executor', 'outsider', 5, 5, 4, 5, 'support', 'Mais alinhado ao pedido de evitar teatro', ['peer review'], ['Nenhuma']],
  ];

  for (const [reviewer_bot, target_bot, correctness_score, novelty_score, feasibility_score, risk_awareness_score, verdict, critique, adopted_ideas, major_concerns] of reviews) {
    await callTool('record_council_review', {
      session_id: sessionId,
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

  const synthesis = await callTool('synthesize_council', { session_id: sessionId });
  const synthesisText = synthesis.result.content[0].text;

  if (!/Chairman Synthesis/.test(synthesisText)) {
    throw new Error(`Unexpected synthesis output: ${synthesisText}`);
  }

  console.log(JSON.stringify({
    sessionId,
    synthesisPreview: synthesisText.split('\n').slice(0, 18),
  }, null, 2));

  child.kill('SIGTERM');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

```
