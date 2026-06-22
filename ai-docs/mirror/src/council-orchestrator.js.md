# src/council-orchestrator.js

- kind: js
- lines: 443
- bytes: 18633

## Summary
@module council-orchestrator Session management, plan building, and tool registration for Council Live.

## Imports
- `zod`
- `./rate-limiter.js`

## Exports
- `resolveLiveMode`
- `buildLivePlanText`
- `createDeepSession`
- `registerCouncilLiveTools`

## Source
```js
/**
 * @module council-orchestrator
 * Session management, plan building, and tool registration for Council Live.
 */

import { z } from "zod";
import {
  COUNCIL_BOT_ORDER,
  evaluateCouncilNeed,
  buildCouncilSession,
  loadCouncilState,
  saveCouncilState,
} from "./council.js";
import { rateLimiter } from "./rate-limiter.js";
import {
  PROMPT_STAGE_VALUES,
  normalizeText,
  normalizeBot,
  titleCaseBot,
  formatGate,
  buildSimpleExecutionPrompt,
  buildPositionPrompt,
  buildReviewPrompt,
  buildChairmanPrompt,
  buildIoFinalPrompt,
} from "./council-prompts.js";
import {
  normalizeCouncilJsonPayload,
  serializePretty,
} from "./council-json.js";

// ─── Shared Zod Schemas ───────────────────────────────────────────────────────


// ─── Mode Resolution ──────────────────────────────────────────────────────────

function resolveLiveMode(requestedMode, gate = null) {
  if (requestedMode === "simple" || requestedMode === "deep") return requestedMode;
  const recommendation = gate?.recommendation || "skip";
  return recommendation === "full" || recommendation === "standard" ? "deep" : "simple";
}

// ─── Plan Building ────────────────────────────────────────────────────────────

function buildLivePlanText({ mode, gate, session = null, objective, context, desired_output, constraints }) {
  const lines = [
    "## Council Live Plan",
    `- resolved_mode: ${mode}`,
    `- objective: ${normalizeText(objective)}`,
    `- desired_output: ${normalizeText(desired_output) || "none"}`,
    "",
    "### Gate",
    formatGate(gate),
  ];

  if (mode === "simple") {
    lines.push(
      "",
      "### Next action",
      "Execute one model call using the prompt below.",
      "",
      "### Prompt",
      "```text",
      buildSimpleExecutionPrompt({ objective, context, desired_output, constraints }),
      "```"
    );
    return lines.join("\n");
  }

  if (session) {
    lines.push(
      "",
      "### Session",
      `- session_id: ${session.session_id}`,
      `- maximum_rounds: ${session.maximum_rounds}`,
      `- activated_mode: ${session.activated_mode}`,
      "",
      "### Bot order",
      ...session.role_order.map((bot, index) => `${index + 1}. ${titleCaseBot(bot)}`),
      "",
      "### Peer review queue",
      ...session.peer_review_queue.map((item, index) => `${index + 1}. ${titleCaseBot(item.reviewer_bot)} -> ${titleCaseBot(item.target_bot)}`),
      "",
      "### Next actions",
      "1. Use get_council_execution_prompt(stage='bot_position', bot=...) for each of the 5 bots.",
      "2. Execute the 5 bot prompts with the chosen model or provider.",
      "3. Normalize any weak JSON with normalize_council_json before recording it.",
      "4. Execute peer reviews following the queue.",
      "5. Use get_council_execution_prompt(stage='chairman', session_id=...) and then get_council_execution_prompt(stage='io_final', session_id=...)."
    );
  }

  return lines.join("\n");
}

// ─── Session Creation ─────────────────────────────────────────────────────────

function createDeepSession({ objective, context, desired_output, constraints, task_type, blast_radius, ambiguity, tradeoff_intensity, touches_multiple_modules, safety_critical, failure_cost, maximum_rounds }) {
  const gate = evaluateCouncilNeed({
    objective,
    task_type,
    blast_radius,
    ambiguity,
    tradeoff_intensity,
    touches_multiple_modules,
    safety_critical,
    failure_cost,
  });

  const session = buildCouncilSession({
    objective,
    context,
    desired_output,
    constraints,
    task_type,
    blast_radius,
    mode: "full",
    maximum_rounds,
    gate,
  });

  const state = loadCouncilState();
  state.sessions.push(session);
  saveCouncilState(state);

  return { gate, session };
}

// ─── Tool Registration ────────────────────────────────────────────────────────

function registerCouncilLiveTools(server) {
  server.tool(
    "run_council_simple",
    "Builds a single-call, model-agnostic execution contract for low-latency work. Use when one well-structured response is enough.",
    {
      objective: z.string().describe("User objective or question."),
      context: z.string().optional().describe("Relevant compact context, preferably markdown or a short brief."),
      desired_output: z.string().optional().describe("Expected outcome or answer format."),
      constraints: z.array(z.string()).optional().describe("Important constraints, rules, or forbidden moves."),
      task_type: z.string().optional().describe("Task type hint for gate analysis."),
      blast_radius: z.enum(["local", "module", "system"]).optional().describe("Estimated blast radius."),
      ambiguity: z.number().int().min(1).max(5).optional().describe("How ambiguous the task is."),
      tradeoff_intensity: z.number().int().min(1).max(5).optional().describe("How heavy the trade-offs are."),
      touches_multiple_modules: z.boolean().optional().describe("Whether the work touches multiple modules or subsystems."),
      safety_critical: z.boolean().optional().describe("Whether mistakes carry security, safety, or trust impact."),
      failure_cost: z.enum(["low", "medium", "high"]).optional().describe("Cost of a wrong answer or wrong implementation."),
    },
    async ({ objective, context = "", desired_output = "", constraints = [], task_type = "general", blast_radius = "local", ambiguity = 1, tradeoff_intensity = 1, touches_multiple_modules = false, safety_critical = false, failure_cost = "low" }) => {
      const rateLimitHit = rateLimiter.check("run_council_simple");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const gate = evaluateCouncilNeed({
          objective,
          task_type,
          blast_radius,
          ambiguity,
          tradeoff_intensity,
          touches_multiple_modules,
          safety_critical,
          failure_cost,
        });

        return {
          content: [{
            type: "text",
            text: buildLivePlanText({
              mode: "simple",
              gate,
              objective,
              context,
              desired_output,
              constraints,
            }),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in run_council_simple: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "run_council_deep",
    "Creates a persisted deep Council plan with 5 bot prompts, peer-review order, chairman stage, and final I/O handoff. Model-agnostic and independent of provider choice.",
    {
      objective: z.string().describe("User objective or question."),
      context: z.string().optional().describe("Relevant compact context, preferably markdown or a short brief."),
      desired_output: z.string().optional().describe("Expected outcome or answer format."),
      constraints: z.array(z.string()).optional().describe("Important constraints, rules, or forbidden moves."),
      task_type: z.string().optional().describe("Task type hint for gate analysis."),
      blast_radius: z.enum(["local", "module", "system"]).optional().describe("Estimated blast radius."),
      ambiguity: z.number().int().min(1).max(5).optional().describe("How ambiguous the task is."),
      tradeoff_intensity: z.number().int().min(1).max(5).optional().describe("How heavy the trade-offs are."),
      touches_multiple_modules: z.boolean().optional().describe("Whether the work touches multiple modules or subsystems."),
      safety_critical: z.boolean().optional().describe("Whether mistakes carry security, safety, or trust impact."),
      failure_cost: z.enum(["low", "medium", "high"]).optional().describe("Cost of a wrong answer or wrong implementation."),
      maximum_rounds: z.number().int().min(1).max(2).optional().describe("Maximum council rounds; bounded to 2."),
    },
    async ({ objective, context = "", desired_output = "", constraints = [], task_type = "general", blast_radius = "system", ambiguity = 4, tradeoff_intensity = 4, touches_multiple_modules = true, safety_critical = false, failure_cost = "medium", maximum_rounds = 2 }) => {
      const rateLimitHit = rateLimiter.check("run_council_deep");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const { gate, session } = createDeepSession({
          objective,
          context,
          desired_output,
          constraints,
          task_type,
          blast_radius,
          ambiguity,
          tradeoff_intensity,
          touches_multiple_modules,
          safety_critical,
          failure_cost,
          maximum_rounds,
        });

        return {
          content: [{
            type: "text",
            text: buildLivePlanText({
              mode: "deep",
              gate,
              session,
              objective,
              context,
              desired_output,
              constraints,
            }),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in run_council_deep: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "run_council_auto",
    "Resolves whether the task should run in simple or deep mode, then returns the proper model-agnostic plan. Use when you want one-key, provider-independent behavior.",
    {
      objective: z.string().describe("User objective or question."),
      context: z.string().optional().describe("Relevant compact context, preferably markdown or a short brief."),
      desired_output: z.string().optional().describe("Expected outcome or answer format."),
      constraints: z.array(z.string()).optional().describe("Important constraints, rules, or forbidden moves."),
      task_type: z.string().optional().describe("Task type hint for gate analysis."),
      blast_radius: z.enum(["local", "module", "system"]).optional().describe("Estimated blast radius."),
      ambiguity: z.number().int().min(1).max(5).optional().describe("How ambiguous the task is."),
      tradeoff_intensity: z.number().int().min(1).max(5).optional().describe("How heavy the trade-offs are."),
      touches_multiple_modules: z.boolean().optional().describe("Whether the work touches multiple modules or subsystems."),
      safety_critical: z.boolean().optional().describe("Whether mistakes carry security, safety, or trust impact."),
      failure_cost: z.enum(["low", "medium", "high"]).optional().describe("Cost of a wrong answer or wrong implementation."),
      maximum_rounds: z.number().int().min(1).max(2).optional().describe("Maximum council rounds when deep mode is selected."),
    },
    async ({ objective, context = "", desired_output = "", constraints = [], task_type = "general", blast_radius = "module", ambiguity = 3, tradeoff_intensity = 3, touches_multiple_modules = false, safety_critical = false, failure_cost = "medium", maximum_rounds = 2 }) => {
      const rateLimitHit = rateLimiter.check("run_council_auto");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const gate = evaluateCouncilNeed({
          objective,
          task_type,
          blast_radius,
          ambiguity,
          tradeoff_intensity,
          touches_multiple_modules,
          safety_critical,
          failure_cost,
        });

        const resolvedMode = resolveLiveMode("auto", gate);
        if (resolvedMode === "simple") {
          return {
            content: [{
              type: "text",
              text: buildLivePlanText({
                mode: "simple",
                gate,
                objective,
                context,
                desired_output,
                constraints,
              }),
            }],
          };
        }

        const { session } = createDeepSession({
          objective,
          context,
          desired_output,
          constraints,
          task_type,
          blast_radius,
          ambiguity,
          tradeoff_intensity,
          touches_multiple_modules,
          safety_critical,
          failure_cost,
          maximum_rounds,
        });

        return {
          content: [{
            type: "text",
            text: buildLivePlanText({
              mode: "deep",
              gate,
              session,
              objective,
              context,
              desired_output,
              constraints,
            }),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in run_council_auto: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "get_council_execution_prompt",
    "Returns the strict prompt contract for one Council Live stage: bot_position, peer_review, chairman, or io_final. Use the returned prompt with any chosen model.",
    {
      stage: z.enum(PROMPT_STAGE_VALUES).describe("Execution stage."),
      session_id: z.string().optional().describe("Existing council session id for deep mode reuse."),
      bot: z.enum(COUNCIL_BOT_ORDER).optional().describe("Bot for bot_position stage."),
      reviewer_bot: z.enum(COUNCIL_BOT_ORDER).optional().describe("Reviewer bot for peer_review stage."),
      target_bot: z.enum(COUNCIL_BOT_ORDER).optional().describe("Target bot for peer_review stage."),
      objective: z.string().optional().describe("Objective override when no session is used."),
      context: z.string().optional().describe("Context override when no session is used."),
      desired_output: z.string().optional().describe("Desired output override when no session is used."),
      constraints: z.array(z.string()).optional().describe("Constraints override when no session is used."),
    },
    async ({ stage, session_id, bot, reviewer_bot, target_bot, objective = "", context = "", desired_output = "", constraints = [] }) => {
      const rateLimitHit = rateLimiter.check("get_council_execution_prompt");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        let payload = { objective, context, desired_output, constraints };
        if (session_id) {
          const state = loadCouncilState();
          const session = state.sessions.find((entry) => entry.session_id === session_id);
          if (!session) {
            return { content: [{ type: "text", text: `HALT — Council session not found: ${session_id}` }] };
          }
          payload = {
            objective: session.objective,
            context: session.context,
            desired_output: session.desired_output,
            constraints: session.constraints,
          };
        }

        let promptText = "";
        if (stage === "bot_position") {
          const resolvedBot = normalizeBot(bot, "executor");
          promptText = buildPositionPrompt({ ...payload, bot: resolvedBot });
        } else if (stage === "peer_review") {
          const resolvedReviewer = normalizeBot(reviewer_bot, "contrarian");
          const resolvedTarget = normalizeBot(target_bot, "executor");
          promptText = buildReviewPrompt({ ...payload, reviewer_bot: resolvedReviewer, target_bot: resolvedTarget });
        } else if (stage === "chairman") {
          promptText = buildChairmanPrompt(payload);
        } else if (stage === "io_final") {
          promptText = buildIoFinalPrompt(payload);
        }

        return {
          content: [{
            type: "text",
            text: [
              `## Council Execution Prompt`,
              `- stage: ${stage}`,
              session_id ? `- session_id: ${session_id}` : null,
              bot ? `- bot: ${bot}` : null,
              reviewer_bot ? `- reviewer_bot: ${reviewer_bot}` : null,
              target_bot ? `- target_bot: ${target_bot}` : null,
              "",
              "```text",
              promptText,
              "```",
            ].filter(Boolean).join("\n"),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_council_execution_prompt: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "normalize_council_json",
    "Normalizes weak or noisy JSON generated by a model for Council Live stages. Useful when the model adds fences, trailing commas, or wrong scalar types.",
    {
      stage: z.enum(["bot_position", "peer_review", "chairman"]).describe("Stage whose JSON should be normalized."),
      raw_text: z.string().describe("Raw text returned by the model."),
      expected_bot: z.enum(COUNCIL_BOT_ORDER).optional().describe("Optional bot override for bot_position stage."),
      expected_reviewer_bot: z.enum(COUNCIL_BOT_ORDER).optional().describe("Optional reviewer bot override for peer_review stage."),
      expected_target_bot: z.enum(COUNCIL_BOT_ORDER).optional().describe("Optional target bot override for peer_review stage."),
    },
    async ({ stage, raw_text, expected_bot, expected_reviewer_bot, expected_target_bot }) => {
      const rateLimitHit = rateLimiter.check("normalize_council_json");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };

      try {
        const result = normalizeCouncilJsonPayload(stage, {
          raw_text,
          expected_bot,
          expected_reviewer_bot,
          expected_target_bot,
        });

        if (!result.ok) {
          return { content: [{ type: "text", text: `HALT — ${result.error}` }] };
        }

        return {
          content: [{
            type: "text",
            text: serializePretty(result.normalized),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in normalize_council_json: ${e.message}` }] };
      }
    }
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  resolveLiveMode,
  buildLivePlanText,
  createDeepSession,
  registerCouncilLiveTools,
};

```
