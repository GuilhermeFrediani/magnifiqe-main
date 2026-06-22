/**
 * @module phase1-tools
 * Phase 1 tool registrations: Semantic Compression + Prompt Standards.
 */

import { z } from "zod";
import { checkRateLimit } from "./safety-guards.js";
import { semanticCompress, classifyTokens } from "./semantic-compression.js";
import { analyzePrompt } from "./prompt-standards.js";

// ─── Semantic Compression Tools ───────────────────────────────────────────────

export function registerSemanticCompressionTools(server) {
  server.tool(
    "semantic_compress",
    "Compresses text using LLM-aware semantic compression with three deletion tiers. Removes grammatical scaffolding while preserving semantic content.",
    {
      text: z.string().describe("Text to compress semantically."),
      level: z.number().int().min(0).max(2).default(1).describe("Compression level: 0=minimal, 1=standard, 2=aggressive."),
    },
    async ({ text, level }) => {
      const rateLimitHit = checkRateLimit("semantic_compress");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };
      try {
        const result = semanticCompress(text, { level });
        const lines = [
          "## Semantic Compression Result",
          `- Level: ${result.stats.level}`,
          `- Before: ${result.stats.before} words`,
          `- After: ${result.stats.after} words`,
          `- Saved: ${result.stats.savingsPercent}% (${result.stats.savings} words)`,
          "",
          "### Compressed Output",
          result.compressed,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in semantic_compress: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "classify_tokens",
    "Classifies text tokens by compression tier: which words can be deleted at each level.",
    {
      text: z.string().describe("Text to classify tokens from."),
    },
    async ({ text }) => {
      const rateLimitHit = checkRateLimit("classify_tokens");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };
      try {
        const result = classifyTokens(text);
        const lines = [
          "## Token Classification",
          `- Tier 1 (always delete): ${result.tier1.length} tokens`,
          `- Tier 2 (delete if clear): ${result.tier2.length} tokens`,
          `- Tier 3 (delete if relation clear): ${result.tier3.length} tokens`,
          `- Preserve: ${result.preserve.length} tokens`,
          "",
        ];
        if (result.tier1.length > 0) lines.push(`### Tier 1: ${result.tier1.join(", ")}`);
        if (result.tier2.length > 0) lines.push(`### Tier 2: ${result.tier2.join(", ")}`);
        if (result.preserve.length > 0) lines.push(`### Preserve: ${result.preserve.join(", ")}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in classify_tokens: ${e.message}` }] };
      }
    }
  );
}

// ─── Prompt Standards Tools ───────────────────────────────────────────────────

export function registerPromptStandardsTools(server) {
  server.tool(
    "validate_prompt_standards",
    "Validates a prompt against RFC 2119 conventions: non-compliant keywords, ornamental tags, critical rule placement, anti-patterns.",
    {
      text: z.string().describe("Prompt text to validate."),
    },
    async ({ text }) => {
      const rateLimitHit = checkRateLimit("validate_prompt_standards");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };
      try {
        const result = analyzePrompt(text);
        const lines = [
          "## Prompt Standards Analysis",
          `- Score: ${result.score}/100`,
          `- Total issues: ${result.totalIssues}`,
          `- Recommendation: ${result.recommendation}`,
          "",
          "### RFC 2119 Compliance",
          `- Valid: ${result.rfcCompliance.valid}`,
          `- Issues: ${result.rfcCompliance.issues.length}`,
          "",
          "### Critical Placement",
          `- Balanced: ${result.criticalPlacement.balanced}`,
          `- Start directives: ${result.criticalPlacement.startDirectives}`,
          `- End directives: ${result.criticalPlacement.endDirectives}`,
          `- ${result.criticalPlacement.recommendation}`,
          "",
          "### Directives Found",
          ...result.directives.slice(0, 10).map(d => `- Line ${d.line}: ${d.keyword} — ${d.context.substring(0, 60)}`),
          "",
          "### Anti-Patterns",
          ...result.antiPatterns.issues.map(i => `- ⚠️ ${i}`),
          ...result.antiPatterns.suggestions.map(s => `- 💡 ${s}`),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in validate_prompt_standards: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "analyze_prompt",
    "Full prompt analysis: RFC compliance, critical placement, anti-patterns, directives. Returns structured JSON report.",
    {
      text: z.string().describe("Prompt text to analyze."),
    },
    async ({ text }) => {
      const rateLimitHit = checkRateLimit("analyze_prompt");
      if (rateLimitHit) return { content: [{ type: "text", text: rateLimitHit }] };
      try {
        const result = analyzePrompt(text);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in analyze_prompt: ${e.message}` }] };
      }
    }
  );
}
