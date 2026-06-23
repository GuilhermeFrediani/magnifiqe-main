/**
 * Stack Perfeita MCP — Context Window Manager
 * Explicit management of context window limits.
 * Provides token estimation, budget checking, compaction suggestions,
 * and real-time context usage status.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";
import { MODEL_ALIASES } from "./profiles.js";

// ─── Internal State ──────────────────────────────────────────────────────

const currentContextTokens = 0;

const TOKENS_PER_WORD = 1.33;
const TOKENS_PER_CHAR = 0.25;

/** Numeric context limits per model family (tokens). */
const CONTEXT_LIMITS = {
  claude: 200_000,
  gpt: 128_000,
  gemini: 1_000_000,
  glm: 128_000,
  mimo: 32_000,
};

const WARNING_THRESHOLD = 0.70;
const CRITICAL_THRESHOLD = 0.90;

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve a model string to a numeric context limit.
 * Tries PROFILES aliases first, then falls back to a reasonable default.
 */
function resolveContextLimit(model) {
  if (!model) {
    return { limit: CONTEXT_LIMITS.claude, resolved: "claude (default)" };
  }

  const normalized = String(model).trim().toLowerCase();

  // Direct alias match
  const alias = MODEL_ALIASES[normalized];
  if (alias && CONTEXT_LIMITS[alias] !== undefined) {
    return { limit: CONTEXT_LIMITS[alias], resolved: alias };
  }

  // Prefix matching (same logic as profiles.js resolveProfile)
  if (normalized.startsWith("claude") || normalized.startsWith("opus")) {
    return { limit: CONTEXT_LIMITS.claude, resolved: "claude" };
  }
  if (normalized.startsWith("gpt")) {
    return { limit: CONTEXT_LIMITS.gpt, resolved: "gpt" };
  }
  if (normalized.startsWith("gemini")) {
    return { limit: CONTEXT_LIMITS.gemini, resolved: "gemini" };
  }
  if (normalized.startsWith("glm")) {
    return { limit: CONTEXT_LIMITS.glm, resolved: "glm" };
  }
  if (normalized.startsWith("mimo")) {
    return { limit: CONTEXT_LIMITS.mimo, resolved: "mimo" };
  }

  // Unknown — assume claude-class as safe default
  return { limit: CONTEXT_LIMITS.claude, resolved: `unknown "${model}", defaulting to claude-class` };
}

/**
 * Classify a line as code, markdown, or plain text.
 */
function classifyLine(line) {
  const trimmed = line.trim();

  // Fenced code block markers
  if (/^```/.test(trimmed)) return "code";
  // Indented code (4+ spaces or tab)
  if (/^(\t| {4})/.test(line)) return "code";
  // Markdown structural elements
  if (/^#{1,6}\s/.test(trimmed)) return "markdown";
  if (/^[-*+]\s/.test(trimmed)) return "markdown";
  if (/^\d+\.\s/.test(trimmed)) return "markdown";
  if (/^>\s/.test(trimmed)) return "markdown";
  if (/^\|.*\|/.test(trimmed)) return "markdown";
  if (/^[-*_]{3,}$/.test(trimmed)) return "markdown";

  return "text";
}

/**
 * Break down text into { text, code, markdown } character counts.
 */
function breakdownContent(text) {
  const lines = text.split("\n");
  const counts = { text: 0, code: 0, markdown: 0 };

  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Toggle fenced code blocks
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      counts.code += line.length;
      continue;
    }

    if (inCodeBlock) {
      counts.code += line.length;
      continue;
    }

    const classification = classifyLine(line);
    counts[classification] += line.length;
  }

  return counts;
}

// ─── Token Estimation ────────────────────────────────────────────────────

/**
 * Estimate token count with breakdown by content type.
 */
function estimateTokens(text) {
  if (!text || text.length === 0) {
    return {
      estimated_tokens: 0,
      word_count: 0,
      char_count: 0,
      breakdown: { text: 0, code: 0, markdown: 0 },
    };
  }

  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const breakdown = breakdownContent(text);

  // Primary estimate: chars-based (more accurate for mixed content)
  const tokensFromChars = Math.ceil(charCount * TOKENS_PER_CHAR);
  // Secondary estimate: word-based
  const tokensFromWords = Math.ceil(wordCount * TOKENS_PER_WORD);

  // Use the average of both methods for better accuracy
  const estimatedTokens = Math.ceil((tokensFromChars + tokensFromWords) / 2);

  // Breakdown in tokens per category
  const tokenBreakdown = {
    text: Math.ceil(breakdown.text * TOKENS_PER_CHAR),
    code: Math.ceil(breakdown.code * TOKENS_PER_CHAR),
    markdown: Math.ceil(breakdown.markdown * TOKENS_PER_CHAR),
  };

  return {
    estimated_tokens: estimatedTokens,
    word_count: wordCount,
    char_count: charCount,
    breakdown: tokenBreakdown,
  };
}

// ─── Budget Checking ─────────────────────────────────────────────────────

/**
 * Check context budget against model limits.
 */
function checkBudget(currentTokens, model) {
  const { limit, resolved } = resolveContextLimit(model);
  const usedPercent = Math.round((currentTokens / limit) * 10000) / 100;
  const remaining = Math.max(0, limit - currentTokens);

  let status;
  if (usedPercent >= CRITICAL_THRESHOLD * 100) {
    status = "critical";
  } else if (usedPercent >= WARNING_THRESHOLD * 100) {
    status = "warning";
  } else {
    status = "ok";
  }

  return {
    within_budget: usedPercent < CRITICAL_THRESHOLD * 100,
    used_percent: usedPercent,
    remaining_tokens: remaining,
    status,
    model: resolved,
    limit,
  };
}

// ─── Compaction Suggestions ──────────────────────────────────────────────

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Suggest sections to compact based on priority.
 */
function suggestCompaction(sections) {
  if (!sections || sections.length === 0) {
    return {
      suggestions: ["No sections provided — nothing to compact."],
      tokens_saved: 0,
      compacted_sections: [],
    };
  }

  // Sort: low priority first (these get removed first), then medium
  const sorted = [...sections].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  );

  const suggestions = [];
  const compactedSections = [];
  let tokensSaved = 0;

  // Always suggest removing low-priority sections
  const lowPriority = sorted.filter((s) => s.priority === "low");
  if (lowPriority.length > 0) {
    const lowTokens = lowPriority.reduce((sum, s) => sum + s.token_count, 0);
    suggestions.push(
      `Remove low-priority sections (${lowPriority.map((s) => s.name).join(", ")}): saves ~${lowTokens.toLocaleString()} tokens`
    );
    for (const s of lowPriority) {
      compactedSections.push(s.name);
      tokensSaved += s.token_count;
    }
  }

  // Suggest summarizing medium-priority sections
  const medPriority = sorted.filter((s) => s.priority === "medium");
  if (medPriority.length > 0) {
    const medTokens = medPriority.reduce((sum, s) => sum + s.token_count, 0);
    const halfSavings = Math.ceil(medTokens / 2);
    suggestions.push(
      `Summarize medium-priority sections (${medPriority.map((s) => s.name).join(", ")}): saves ~${halfSavings.toLocaleString()} tokens (estimated 50% reduction)`
    );
    // Only count full savings for sections actually removed, not summarized
    tokensSaved += halfSavings;
  }

  // Warn about high-priority sections
  const highPriority = sorted.filter((s) => s.priority === "high");
  if (highPriority.length > 0) {
    const highTokens = highPriority.reduce((sum, s) => sum + s.token_count, 0);
    suggestions.push(
      `Keep high-priority sections (${highPriority.map((s) => s.name).join(", ")}): ${highTokens.toLocaleString()} tokens — not recommended to remove`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("All sections are accounted for. No compaction needed.");
  }

  return {
    suggestions,
    tokens_saved: tokensSaved,
    compacted_sections: compactedSections,
  };
}

// ─── Context Status ──────────────────────────────────────────────────────

/**
 * Get current context usage overview with recommendations.
 */
function getContextStatus() {
  const budget = checkBudget(currentContextTokens, null);
  const recommendations = [];

  if (budget.status === "critical") {
    recommendations.push(
      "Context is critically full. Remove or compress low-priority sections immediately.",
      "Consider checkpointing progress and starting a fresh context window.",
      "Use suggest_compaction to identify sections to remove."
    );
  } else if (budget.status === "warning") {
    recommendations.push(
      "Context is approaching capacity. Review sections for compaction opportunities.",
      "Summarize verbose outputs from earlier tool calls.",
      "Consider dropping completed task history from active context."
    );
  } else {
    recommendations.push(
      "Context usage is healthy. No immediate action needed.",
      "Monitor usage as more tool calls accumulate.",
      "Preemptive compaction of low-priority sections can extend headroom."
    );
  }

  return {
    estimated_used: currentContextTokens,
    model_limit: budget.limit,
    usage_percent: budget.used_percent,
    status: budget.status,
    remaining_tokens: budget.remaining_tokens,
    model: budget.resolved,
    recommendations,
  };
}

// ─── Tool Registration ───────────────────────────────────────────────────

export function registerContextManagerTools(server) {
  // Tool 1: estimate_tokens
  server.tool(
    "estimate_tokens",
    "Estimates token count for text with breakdown by content type (text, code, markdown). Uses dual word/char estimation for accuracy.",
    {
      text: z.string().describe("Text content to estimate tokens for."),
    },
    async ({ text }) => {
      const rateLimitHit = rateLimiter.check("estimate_tokens");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = estimateTokens(text);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in estimate_tokens: ${e.message}` }],
        };
      }
    }
  );

  // Tool 2: check_context_budget
  server.tool(
    "check_context_budget",
    "Checks if a token count is within budget for a given model. Returns status: ok (<70%), warning (70-90%), critical (>90%).",
    {
      current_tokens: z.number().int().min(0).describe("Current token count to check against budget."),
      model: z.string().optional().describe("Model name or family (e.g., claude, gpt-4o, gemini-2.5-pro). Defaults to claude-class."),
    },
    async ({ current_tokens, model }) => {
      const rateLimitHit = rateLimiter.check("check_context_budget");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = checkBudget(current_tokens, model);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in check_context_budget: ${e.message}` }],
        };
      }
    }
  );

  // Tool 3: suggest_compaction
  server.tool(
    "suggest_compaction",
    "Suggests which context sections to compact to save tokens. Prioritizes removing low-priority sections first, then summarizing medium-priority ones.",
    {
      sections: z
        .array(
          z.object({
            name: z.string().describe("Section identifier."),
            token_count: z.number().int().min(0).describe("Estimated token count of this section."),
            priority: z
              .enum(["high", "medium", "low"])
              .describe("Priority level. Low-priority sections are removed first."),
          })
        )
        .min(1)
        .describe("List of context sections with token counts and priorities."),
    },
    async ({ sections }) => {
      const rateLimitHit = rateLimiter.check("suggest_compaction");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = suggestCompaction(sections);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in suggest_compaction: ${e.message}` }],
        };
      }
    }
  );

  // Tool 4: get_context_status
  server.tool(
    "get_context_status",
    "Returns current context usage overview: estimated tokens used, model limit, usage percentage, and recommendations for staying within budget.",
    {},
    async () => {
      const rateLimitHit = rateLimiter.check("get_context_status");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = getContextStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in get_context_status: ${e.message}` }],
        };
      }
    }
  );
}
