# src/profiles.js

- kind: js
- lines: 244
- bytes: 10565

## Summary
Stack Perfeita MCP — Model Profiles get_model_profile MCP tool registration. Adapts behavior by provider family and operational capability profile.

## Imports
- `zod`
- `./rate-limiter.js`

## Exports
- `PROFILES`
- `MODEL_ALIASES`
- `resolveProfile`
- `registerProfilesTools`

## Source
```js
/**
 * Stack Perfeita MCP — Model Profiles
 * get_model_profile MCP tool registration.
 * Adapts behavior by provider family and operational capability profile.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

export const PROFILES = {
  claude: {
    id: "claude",
    family: "anthropic",
    name: "Claude (Anthropic)",
    verbosity: "Terse by default. Expand when debugging, testing, or ambiguity is high. Use bullet points over paragraphs.",
    citations: "Reference rule file names when applying policy. Prefer concrete evidence over long explanation.",
    compaction: "Use compress_markdown before long docs. Compact logs/diffs at natural breakpoints.",
    caching: "Keep stable rules and project manifest near the start of context for cache-friendly reuse.",
    context_limit: "200K-class context. Keep active working set lean and checkpoint often.",
    strictness: "High for security, validation, and proof-before-success. Adaptive for style.",
    tool_style: "Call tools before asserting facts. Verify after mutations. Use checkpoints before risky changes.",
    cache_tool: "Call get_rules_bundle('index') once per session and reuse as stable prefix.",
    capabilities: {
      supports_tool_calling: true,
      supports_structured_output: true,
      supports_prompt_cache: true,
      prefers_short_outcome_prompts: true,
      needs_tighter_scaffolding: false,
      recommended_retry_budget: 2,
      recommended_compaction_threshold: "medium",
      recommended_output_contract: "bullets + explicit verification status",
    },
  },
  gpt: {
    id: "gpt",
    family: "openai",
    name: "GPT (OpenAI)",
    verbosity: "Concise responses. Avoid preamble. Prefer structured outputs when data or steps matter.",
    citations: "Reference rule names when relevant and keep output schema explicit.",
    compaction: "Summarize long context before processing. Compact logs after build/test output.",
    caching: "Keep static instructions stable. Prefer result-oriented prompts over ritualistic phrasing.",
    context_limit: "128K-class context. Rotate volatile context aggressively.",
    strictness: "High for output contract and security. Moderate for style conventions.",
    tool_style: "Prefer function/tool calling over prose about actions. Verify tool results before responding.",
    cache_tool: "Call get_rules_bundle('index') at session start and preserve a stable prefix.",
    capabilities: {
      supports_tool_calling: true,
      supports_structured_output: true,
      supports_prompt_cache: true,
      prefers_short_outcome_prompts: true,
      needs_tighter_scaffolding: false,
      recommended_retry_budget: 2,
      recommended_compaction_threshold: "medium",
      recommended_output_contract: "checklist + final artifact summary",
    },
  },
  gemini: {
    id: "gemini",
    family: "google",
    name: "Gemini (Google)",
    verbosity: "Direct and factual. Use code blocks for code output and keep reasoning compressed.",
    citations: "Reference rule paths when applying policy. Prefer grounded answers with source attribution.",
    compaction: "Use cached context for stable rules, compact noisy runtime output.",
    caching: "Place stable rules and project manifest in reusable cached prefix whenever possible.",
    context_limit: "1M-class context. Large context helps, but compaction still matters for quality and cost.",
    strictness: "High for security validation. Adaptive for style and formatting.",
    tool_style: "Use declared tools systematically. Verify file existence and mutations before success claims.",
    cache_tool: "Call get_rules_bundle('index') at session start and keep it stable.",
    capabilities: {
      supports_tool_calling: true,
      supports_structured_output: true,
      supports_prompt_cache: true,
      prefers_short_outcome_prompts: true,
      needs_tighter_scaffolding: false,
      recommended_retry_budget: 2,
      recommended_compaction_threshold: "high",
      recommended_output_contract: "sections + evidence bullets",
    },
  },
  glm: {
    id: "glm",
    family: "zai",
    name: "GLM family",
    verbosity: "Be direct and explicit. Short task framing plus strong acceptance criteria work best.",
    citations: "Cite rules and concrete checks rather than long rationale.",
    compaction: "Compact aggressively after noisy tool output and keep only the current hypothesis alive.",
    caching: "Assume less benefit from prompt ritual. Prefer explicit state and short reusable summaries.",
    context_limit: "Mid-to-large context class. Keep active context curated instead of broad.",
    strictness: "High for gates and acceptance criteria. Keep instructions concrete.",
    tool_style: "Use tools early, then restate verified findings in compact form.",
    cache_tool: "Use get_rules_bundle('index') plus project activation summary as the stable prefix.",
    capabilities: {
      supports_tool_calling: true,
      supports_structured_output: true,
      supports_prompt_cache: false,
      prefers_short_outcome_prompts: true,
      needs_tighter_scaffolding: true,
      recommended_retry_budget: 1,
      recommended_compaction_threshold: "medium",
      recommended_output_contract: "goal / evidence / next-step",
    },
  },
  mimo: {
    id: "mimo",
    family: "xiaomi-mimo",
    name: "MiMo family",
    verbosity: "Ultra-compact. Keep one objective at a time and avoid optional digressions.",
    citations: "Reference only the exact rule or proof that matters now.",
    compaction: "Compact early. Keep working memory small and checkpoint often.",
    caching: "Do not rely on verbose prompt scaffolding. Prefer short contracts and explicit state.",
    context_limit: "Smaller effective working window for complex coding tasks. Operate in short verified loops.",
    strictness: "Very high for gates, stopping conditions, and retry bounds.",
    tool_style: "Prefer short tool-driven loops: inspect -> change -> validate -> checkpoint.",
    cache_tool: "Use get_rules_bundle('index') sparingly and summarize to the minimum stable prefix.",
    capabilities: {
      supports_tool_calling: true,
      supports_structured_output: true,
      supports_prompt_cache: false,
      prefers_short_outcome_prompts: true,
      needs_tighter_scaffolding: true,
      recommended_retry_budget: 1,
      recommended_compaction_threshold: "low",
      recommended_output_contract: "single-task checklist + hard stop on failure",
    },
  },
};

export const MODEL_ALIASES = {
  claude: "claude",
  "claude-3": "claude",
  "claude-3.5": "claude",
  "claude-3.7": "claude",
  opus: "claude",
  "opus-4": "claude",
  "opus-4.7": "claude",
  gpt: "gpt",
  "gpt-4o": "gpt",
  "gpt-5": "gpt",
  "gpt-5.5": "gpt",
  gemini: "gemini",
  "gemini-1.5-pro": "gemini",
  "gemini-2.5-pro": "gemini",
  "gemini-3.5-flash": "gemini",
  glm: "glm",
  "glm-4": "glm",
  "glm-5.1": "glm",
  mimo: "mimo",
  "mimo-v2.5": "mimo",
};

export function resolveProfile(model) {
  const normalized = String(model || "").trim().toLowerCase();
  const direct = MODEL_ALIASES[normalized];
  if (direct) return { requested: normalized, profile: PROFILES[direct] };

  if (normalized.startsWith("gpt-")) return { requested: normalized, profile: PROFILES.gpt };
  if (normalized.startsWith("claude") || normalized.startsWith("opus")) return { requested: normalized, profile: PROFILES.claude };
  if (normalized.startsWith("gemini")) return { requested: normalized, profile: PROFILES.gemini };
  if (normalized.startsWith("glm")) return { requested: normalized, profile: PROFILES.glm };
  if (normalized.startsWith("mimo")) return { requested: normalized, profile: PROFILES.mimo };

  return { requested: normalized, profile: null };
}

function formatCapabilities(capabilities) {
  return [
    `- supports_tool_calling: ${capabilities.supports_tool_calling}`,
    `- supports_structured_output: ${capabilities.supports_structured_output}`,
    `- supports_prompt_cache: ${capabilities.supports_prompt_cache}`,
    `- prefers_short_outcome_prompts: ${capabilities.prefers_short_outcome_prompts}`,
    `- needs_tighter_scaffolding: ${capabilities.needs_tighter_scaffolding}`,
    `- recommended_retry_budget: ${capabilities.recommended_retry_budget}`,
    `- recommended_compaction_threshold: ${capabilities.recommended_compaction_threshold}`,
    `- recommended_output_contract: ${capabilities.recommended_output_contract}`,
  ].join("\n");
}

export function registerProfilesTools(server) {
  server.tool(
    "get_model_profile",
    "Returns recommended operating guidance for a provider family or model alias. Covers verbosity, compaction, caching, strictness, tool style, and operational capability flags.",
    {
      model: z.string().describe("Provider family or model alias. Examples: claude, gpt, gemini, glm-5.1, mimo-v2.5, gpt-5.5."),
    },
    async ({ model }) => {
      const rateLimitHit = rateLimiter.check("get_model_profile");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const { requested, profile } = resolveProfile(model);
        if (!profile) {
          return {
            content: [{
              type: "text",
              text: `Unknown model/profile: ${model}. Available families: ${Object.keys(PROFILES).join(", ")}. Known aliases include: ${Object.keys(MODEL_ALIASES).slice(0, 12).join(", ")}...`,
            }],
          };
        }

        const lines = [
          `## Profile: ${profile.name}`,
          `- Requested: ${requested || profile.id}`,
          `- Family: ${profile.family}`,
          "",
          "### Verbosity",
          profile.verbosity,
          "",
          "### Citations",
          profile.citations,
          "",
          "### Compaction",
          profile.compaction,
          "",
          "### Caching",
          profile.caching,
          "",
          "### Context Limit",
          profile.context_limit,
          "",
          "### Strictness",
          profile.strictness,
          "",
          "### Tool Style",
          profile.tool_style,
          "",
          "### Cache Strategy",
          profile.cache_tool,
          "",
          "### Capability Matrix",
          formatCapabilities(profile.capabilities),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_model_profile: ${e.message}` }] };
      }
    }
  );
}


```
