# src/roles.js

- kind: js
- lines: 187
- bytes: 7689

## Summary
Stack Perfeita MCP — Role activation activate_role MCP tool registration. Applies role-specific scaffolding adapted by model capability profile.

## Imports
- `zod`
- `./profiles.js`
- `./rate-limiter.js`

## Exports
- `registerRolesTools`
- `ROLE_PRESETS`
- `adaptPreset`

## Source
```js
/**
 * Stack Perfeita MCP — Role activation
 * activate_role MCP tool registration.
 * Applies role-specific scaffolding adapted by model capability profile.
 */

import { z } from "zod";
import { resolveProfile } from "./profiles.js";
import { rateLimiter } from "./rate-limiter.js";

const ROLE_PRESETS = {
  architect: {
    verbosity: "high-signal, low-chatter",
    output_format: "decision log + architecture bullets + tradeoffs",
    retry_budget: 2,
    tool_budget: 6,
    priority_rules: ["00-project-overview.md", "08-backend-architecture.md", "11-systematic-debugging.md"],
    required_gates: ["dependency_validate for new imports", "checkpoint before broad refactors"],
    max_context_block: 12000,
    checkpoint_policy: "checkpoint before cross-cutting design changes",
  },
  implementer: {
    verbosity: "compact",
    output_format: "task checklist + changed files + proof",
    retry_budget: 2,
    tool_budget: 8,
    priority_rules: ["01-ai-workflow-strict.md", "02-coding-standards.md", "09-bad-patterns-halt.md"],
    required_gates: ["validate_bad_code before success", "dependency_validate after new imports"],
    max_context_block: 9000,
    checkpoint_policy: "checkpoint before risky mutations",
  },
  debugger: {
    verbosity: "compact diagnostic",
    output_format: "root cause / evidence / fix / verification",
    retry_budget: 2,
    tool_budget: 10,
    priority_rules: ["05-debugging-mastery.md", "11-systematic-debugging.md"],
    required_gates: ["prove reproduction", "prove fix with execution"],
    max_context_block: 8000,
    checkpoint_policy: "checkpoint before speculative refactor",
  },
  reviewer: {
    verbosity: "tight review notes",
    output_format: "findings ranked by severity",
    retry_budget: 1,
    tool_budget: 6,
    priority_rules: ["06-ci-cd-testing.md", "09-bad-patterns-halt.md"],
    required_gates: ["evidence for every finding", "no style nit without impact"],
    max_context_block: 7000,
    checkpoint_policy: "checkpoint only if changes are proposed",
  },
  frontend: {
    verbosity: "compact",
    output_format: "UI intent + a11y + performance checks",
    retry_budget: 2,
    tool_budget: 8,
    priority_rules: ["07-frontend-semantic.md", "02-coding-standards.md"],
    required_gates: ["validate_bad_code before delivery", "check semantic HTML/a11y"],
    max_context_block: 9000,
    checkpoint_policy: "checkpoint before layout or component rewrites",
  },
  backend: {
    verbosity: "compact",
    output_format: "API/DB intent + risks + proof",
    retry_budget: 2,
    tool_budget: 8,
    priority_rules: ["08-backend-architecture.md", "04-security-secrets.md"],
    required_gates: ["input validation at edge", "dependency_validate for new packages"],
    max_context_block: 9000,
    checkpoint_policy: "checkpoint before schema/auth changes",
  },
  "multimodal-agent": {
    verbosity: "compact orchestration",
    output_format: "handoff plan + evidence + rollback",
    retry_budget: 1,
    tool_budget: 12,
    priority_rules: ["01-ai-workflow-strict.md", "10-llm-behavioral-rules.md"],
    required_gates: ["explicit ownership per agent", "evidence before delegation"],
    max_context_block: 7000,
    checkpoint_policy: "checkpoint at every handoff boundary",
  },
  refactorer: {
    verbosity: "compact",
    output_format: "goal / invariant / change plan / proof",
    retry_budget: 2,
    tool_budget: 8,
    priority_rules: ["02-coding-standards.md", "09-bad-patterns-halt.md", "11-systematic-debugging.md"],
    required_gates: ["checkpoint before rewrite", "validate_bad_code after rewrite"],
    max_context_block: 8500,
    checkpoint_policy: "checkpoint before every non-trivial refactor wave",
  },
  "security-review": {
    verbosity: "severity-first",
    output_format: "risk / exploit path / remediation / proof",
    retry_budget: 1,
    tool_budget: 8,
    priority_rules: ["04-security-secrets.md", "09-bad-patterns-halt.md"],
    required_gates: ["proof before severity claim", "no success claim without mitigation check"],
    max_context_block: 7000,
    checkpoint_policy: "checkpoint before security-sensitive edits",
  },
};

function adaptPreset(basePreset, profile) {
  if (!profile) {
    return {
      ...basePreset,
      model_strategy: "generic",
    };
  }

  const adapted = {
    ...basePreset,
    retry_budget: Math.min(basePreset.retry_budget, profile.capabilities.recommended_retry_budget),
    tool_budget: profile.capabilities.needs_tighter_scaffolding
      ? Math.max(4, Math.min(basePreset.tool_budget, 6))
      : basePreset.tool_budget,
    max_context_block: profile.capabilities.needs_tighter_scaffolding
      ? Math.min(basePreset.max_context_block, 6000)
      : basePreset.max_context_block,
    output_format: `${basePreset.output_format}; contract=${profile.capabilities.recommended_output_contract}`,
    model_strategy: profile.capabilities.needs_tighter_scaffolding
      ? "tight scaffolding: one sub-goal at a time, explicit evidence, bounded retries"
      : "higher autonomy: same gates, broader planning latitude",
  };

  if (profile.capabilities.prefers_short_outcome_prompts) {
    adapted.verbosity = `${basePreset.verbosity}; outcome-first`;
  }

  return adapted;
}

export function registerRolesTools(server) {
  server.tool(
    "activate_role",
    "Returns an operational role preset adapted to the selected model profile. Use to calibrate verbosity, retries, tool budget, gates, context block size, and checkpoint policy.",
    {
      role: z.enum(["architect", "implementer", "debugger", "reviewer", "frontend", "backend", "multimodal-agent", "refactorer", "security-review"]).describe("Operational role to activate."),
      model: z.string().optional().describe("Optional provider family or model alias, e.g. gpt-5.5, claude, glm-5.1, mimo-v2.5."),
      task_type: z.string().optional().describe("Optional task type label for context, e.g. refactor, bugfix, api-design."),
      stack: z.string().optional().describe("Optional stack summary, e.g. Next.js + Node + Postgres."),
    },
    async ({ role, model, task_type, stack }) => {
      const rateLimitHit = rateLimiter.check("activate_role");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const preset = ROLE_PRESETS[role];
        const { profile } = resolveProfile(model || "gpt");
        const adapted = adaptPreset(preset, profile);

        const lines = [
          `## Role activated: ${role}`,
          profile ? `- Model family: ${profile.family}` : "- Model family: generic",
          task_type ? `- Task type: ${task_type}` : "- Task type: generic",
          stack ? `- Stack: ${stack}` : "- Stack: unspecified",
          "",
          "### Operating posture",
          `- Verbosity: ${adapted.verbosity}`,
          `- Output format: ${adapted.output_format}`,
          `- Retry budget: ${adapted.retry_budget}`,
          `- Tool budget: ${adapted.tool_budget}`,
          `- Max context block: ${adapted.max_context_block}`,
          `- Checkpoint policy: ${adapted.checkpoint_policy}`,
          `- Model strategy: ${adapted.model_strategy}`,
          "",
          "### Priority rules",
          ...adapted.priority_rules.map((item) => `- ${item}`),
          "",
          "### Required gates",
          ...adapted.required_gates.map((item) => `- ${item}`),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in activate_role: ${e.message}` }] };
      }
    }
  );
}

export { ROLE_PRESETS, adaptPreset };

```
