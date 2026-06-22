# src/council.js

- kind: js
- lines: 328
- bytes: 15060

## Summary
Council Orchestrator — thin coordination layer that wires council modules to MCP tool registration. All business logic lives in: - council-gate.js      (gate scoring) - council-session.js   (session CRUD, constants, utilities) - council-synthesis.js (deterministic synthesis)

## Imports
- `zod`
- `./rate-limiter.js`
- `./council-gate.js`
- `./council-prompts.js`
- `./council-synthesis.js`

## Exports
- `registerCouncilTools`
- `evaluateCouncilNeed`
- `COUNCIL_BOT_ORDER`
- `COUNCIL_BOT_BRIEFS`
- `defaultCouncilState`
- `buildCouncilSession`
- `loadCouncilState`
- `saveCouncilState`
- `upsertCouncilPosition`
- `upsertCouncilReview`
- `synthesizeCouncilSession`

## Source
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
