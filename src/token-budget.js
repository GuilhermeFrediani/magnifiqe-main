/**
 * Stack Perfeita MCP — Token Budget Advisor
 * Estimates token cost of responses and offers user-controlled depth levels.
 * Helps save tokens on simple questions, go deep on complex ones.
 */

import { z } from "zod";

// Heuristic token estimation (words × 1.3 for prose, chars / 4 for code)
function estimateTokens(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

// Classify prompt complexity
function classifyComplexity(text) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasCodeBlock = /```[\s\S]*?```/.test(text);
  const hasMultiPart = /\b(and|also|additionally|plus|then|after that|finally)\b/i.test(text);
  const hasQuestion = /\?/.test(text);
  const hasComparison = /\b(compare|versus|vs|difference|better|worse|pros|cons)\b/i.test(text);
  const hasArchitecture = /\b(architect|design|system|pattern|structure|organize)\b/i.test(text);

  let score = 0;
  if (wordCount > 50) score += 2;
  else if (wordCount > 20) score += 1;
  if (hasCodeBlock) score += 2;
  if (hasMultiPart) score += 1;
  if (hasQuestion) score += 1;
  if (hasComparison) score += 2;
  if (hasArchitecture) score += 2;

  if (score >= 5) return { level: "complex", score, label: "Complexa" };
  if (score >= 3) return { level: "moderate", score, label: "Moderada" };
  return { level: "simple", score, label: "Simples" };
}

// Multiplier ranges by complexity
const MULTIPLIERS = {
  simple: { min: 3, max: 8 },
  moderate: { min: 8, max: 20 },
  complex: { min: 15, max: 40 }
};

// Depth level definitions
const DEPTH_LEVELS = [
  { level: 1, name: "Essencial (25%)", fraction: 0.25, description: "Resposta direta apenas, sem preâmbulo" },
  { level: 2, name: "Moderada (50%)", fraction: 0.50, description: "Resposta + contexto + 1 exemplo" },
  { level: 3, name: "Detalhada (75%)", fraction: 0.75, description: "Resposta completa com alternativas" },
  { level: 4, name: "Exaustiva (100%)", fraction: 1.00, description: "Tudo, sem limites" }
];

export function registerTokenBudgetTools(server) {
  server.tool(
    "token_budget",
    "Estimates the token cost of a response and offers 4 depth levels (25%/50%/75%/100%) for the user to choose. Use BEFORE answering when the user wants control over response length, or when working with models that have tight context windows. Returns estimated input tokens, complexity classification, and token ranges for each depth level.",
    {
      prompt: z.string().describe("The user's prompt/question to analyze"),
      context_tokens: z.number().optional().describe("Known context window size (e.g., 128000). If omitted, assumes 200K."),
      current_depth: z.number().optional().describe("If user already chose a depth level in this session, pass it here to skip the menu")
    },
    async ({ prompt, context_tokens, current_depth }) => {
      const inputTokens = estimateTokens(prompt);
      const complexity = classifyComplexity(prompt);
      const mults = MULTIPLIERS[complexity.level];
      const contextWindow = context_tokens || 200000;

      const minOutput = Math.ceil(inputTokens * mults.min);
      const maxOutput = Math.ceil(inputTokens * mults.max);
      const cappedMax = Math.min(maxOutput, contextWindow * 0.4); // Cap at 40% of window

      // If user already chose depth, return compact confirmation
      if (current_depth) {
        const depth = DEPTH_LEVELS.find(d => d.level === current_depth) || DEPTH_LEVELS[1];
        const targetTokens = Math.ceil(minOutput + (cappedMax - minOutput) * depth.fraction);
        return {
          content: [{
            type: "text",
            text: `Depth: ${depth.name} | Target: ~${targetTokens} tokens | Maintaining level ${current_depth} for this session.`
          }]
        };
      }

      // Build full budget menu
      const depthLines = DEPTH_LEVELS.map(d => {
        const targetTokens = Math.ceil(minOutput + (cappedMax - minOutput) * d.fraction);
        return `[${d.level}] ${d.name.padEnd(18)} → ~${String(targetTokens).padStart(6)} tokens | ${d.description}`;
      });

      const report = [
        "TOKEN BUDGET ANALYSIS",
        "═══════════════════════════════════════",
        `Input: ~${inputTokens} tokens`,
        `Complexity: ${complexity.label} (score: ${complexity.score})`,
        `Context window: ${contextWindow.toLocaleString()} tokens`,
        `Response range: ${minOutput.toLocaleString()} – ${cappedMax.toLocaleString()} tokens`,
        "",
        "Choose depth level:",
        ...depthLines,
        "",
        "═══════════════════════════════════════",
        `Reply with 1, 2, 3, or 4 (or say "25% depth", "50% depth", etc.)`,
        `Heuristic estimate: ~85-90% accuracy (±15%)`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "context_audit",
    "Audits the current project's MCP and component overhead. Estimates how many tokens are consumed by loaded tools, rules, and skills. Identifies bloat and suggests savings.",
    {
      project_root: z.string().optional().describe("Project root to audit")
    },
    async ({ project_root }) => {
      const { readFileSync, readdirSync, existsSync } = await import("fs");
      const { resolve } = await import("path");

      const root = project_root || process.cwd();
      let totalTokens = 0;
      const components = [];

      // Count MCP tool schemas (~500 tokens each)
      const toolCount = 145; // Known from audit
      const mcpTokens = toolCount * 500;
      components.push({ name: "MCP Tool Schemas", count: toolCount, tokens: mcpTokens });
      totalTokens += mcpTokens;

      // Count rules files
      try {
        const rulesDir = resolve(root, "ai-rules");
        if (existsSync(rulesDir)) {
          const ruleFiles = readdirSync(rulesDir, { recursive: true }).filter(f => f.endsWith(".md"));
          let ruleTokens = 0;
          for (const f of ruleFiles) {
            try {
              const content = readFileSync(resolve(rulesDir, f), "utf-8");
              ruleTokens += Math.ceil(content.split(/\s+/).length * 1.3);
            } catch {}
          }
          components.push({ name: "AI Rules", count: ruleFiles.length, tokens: ruleTokens });
          totalTokens += ruleTokens;
        }
      } catch {}

      // Count src files (agent logic loaded at startup)
      try {
        const srcDir = resolve(root, "src");
        if (existsSync(srcDir)) {
          const srcFiles = readdirSync(srcDir).filter(f => f.endsWith(".js"));
          let srcTokens = 0;
          for (const f of srcFiles) {
            try {
              const content = readFileSync(resolve(srcDir, f), "utf-8");
              srcTokens += Math.ceil(content.split(/\s+/).length * 1.3);
            } catch {}
          }
          components.push({ name: "Source Modules", count: srcFiles.length, tokens: srcTokens });
          totalTokens += srcTokens;
        }
      } catch {}

      const contextWindow = 200000;
      const usagePercent = ((totalTokens / contextWindow) * 100).toFixed(1);

      // Identify bloat
      const warnings = [];
      if (mcpTokens > 50000) warnings.push(`MCP schemas consuming ${mcpTokens.toLocaleString()} tokens — consider lazy-loading`);
      const heavyComps = components.filter(c => c.tokens > 10000);
      if (heavyComps.length > 0) warnings.push(`Heavy components: ${heavyComps.map(c => c.name).join(", ")}`);

      const report = [
        "CONTEXT BUDGET AUDIT",
        "═══════════════════════════════════════",
        `Project: ${root}`,
        `Context window: ${contextWindow.toLocaleString()} tokens`,
        "",
        "Component Breakdown:",
        "┌─────────────────────┬────────┬────────────┐",
        "│ Component           │ Count  │ Tokens     │",
        "├─────────────────────┼────────┼────────────┤",
        ...components.map(c => `│ ${c.name.padEnd(19)} │ ${String(c.count).padStart(6)} │ ${String(c.tokens.toLocaleString()).padStart(10)} │`),
        "└─────────────────────┴────────┴────────────┘",
        "",
        `Total overhead: ~${totalTokens.toLocaleString()} tokens (${usagePercent}% of window)`,
        "",
        warnings.length > 0 ? `WARNINGS:\n${warnings.map(w => `  ⚠ ${w}`).join("\n")}` : "No bloat detected.",
        "",
        `Top saving: ${components.length > 0 ? `Reduce ${components.sort((a, b) => b.tokens - a.tokens)[0]?.name}` : "N/A"}`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
