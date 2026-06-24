/**
 * Stack Perfeita MCP — Prompt Optimizer
 * Analyzes raw prompts, detects project context, identifies gaps,
 * and outputs optimized prompts ready to paste.
 */

import { z } from "zod";

// Intent classification
const INTENT_PATTERNS = [
  { intent: "new_feature", signals: ["build", "create", "add", "implement", "develop", "make"] },
  { intent: "bug_fix", signals: ["fix", "broken", "not working", "error", "bug", "issue"] },
  { intent: "refactor", signals: ["refactor", "clean up", "restructure", "improve", "optimize"] },
  { intent: "research", signals: ["how to", "what is", "explore", "investigate", "understand"] },
  { intent: "testing", signals: ["test", "coverage", "verify", "validate", "check"] },
  { intent: "review", signals: ["review", "audit", "check", "analyze", "inspect"] },
  { intent: "documentation", signals: ["document", "update docs", "readme", "comment"] },
  { intent: "infrastructure", signals: ["deploy", "ci", "docker", "database", "server", "config"] },
  { intent: "design", signals: ["design", "architecture", "plan", "structure", "organize"] }
];

// Scope estimation
function estimateScope(prompt) {
  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  const hasMultiple = /\b(and|also|additionally|plus|then|after|finally)\b/i.test(prompt);
  const hasCrossDomain = /\b(frontend|backend|api|database|deploy|test|security)\b/i.test(prompt);

  if (wordCount > 100 || (hasMultiple && hasCrossDomain)) return { level: "EPIC", label: "Multi-session, architectural" };
  if (wordCount > 50 || hasCrossDomain) return { level: "HIGH", label: "Cross-domain, 5+ files" };
  if (wordCount > 20 || hasMultiple) return { level: "MEDIUM", label: "Multiple components" };
  if (wordCount > 10) return { level: "LOW", label: "Single component" };
  return { level: "TRIVIAL", label: "Single file, <50 lines" };
}

// Detect tech stack
function detectTechStack(prompt) {
  const stacks = [];
  if (/\b(node|npm|express|fastify|next\.?js|react|vue|angular)\b/i.test(prompt)) stacks.push("JavaScript/TypeScript");
  if (/\b(python|django|flask|fastapi|pip|uv)\b/i.test(prompt)) stacks.push("Python");
  if (/\b(go|golang|gin|fiber)\b/i.test(prompt)) stacks.push("Go");
  if (/\b(rust|cargo|tokio)\b/i.test(prompt)) stacks.push("Rust");
  if (/\b(java|spring|gradle|maven)\b/i.test(prompt)) stacks.push("Java");
  if (/\b(kotlin|ktor)\b/i.test(prompt)) stacks.push("Kotlin");
  if (/\b(swift|swiftui|ios)\b/i.test(prompt)) stacks.push("Swift");
  if (/\b(csharp|\.net|dotnet)\b/i.test(prompt)) stacks.push("C#");
  return stacks.length > 0 ? stacks : ["Unknown"];
}

// Detect missing context
function detectMissingContext(prompt) {
  const missing = [];
  if (!/\b(test|spec|coverage)\b/i.test(prompt)) missing.push("Testing expectations");
  if (!/\b(error|exception|handle|fail)\b/i.test(prompt)) missing.push("Error handling");
  if (!/\b(security|auth|validate|sanitiz)\b/i.test(prompt)) missing.push("Security requirements");
  if (!/\b(deploy|ci|cd|pipeline)\b/i.test(prompt)) missing.push("Deployment strategy");
  if (!/\b(performance|latency|optimize)\b/i.test(prompt)) missing.push("Performance constraints");
  return missing;
}

export function registerPromptOptimizerTools(server) {
  server.tool(
    "prompt_optimize",
    "Analyzes a raw prompt and produces an optimized version. Detects intent, scope, tech stack, and missing context. Returns a structured analysis with an optimized prompt ready to paste. Does NOT execute the task — advisory only.",
    {
      prompt: z.string().describe("The raw prompt to analyze and optimize"),
      language: z.string().optional().describe("Response language (default: same as input)")
    },
    async ({ prompt, language }) => {
      // Phase 1: Intent detection
      const intents = INTENT_PATTERNS.filter(p =>
        p.signals.some(s => prompt.toLowerCase().includes(s))
      );
      const primaryIntent = intents.length > 0 ? intents[0].intent : "general";

      // Phase 2: Scope assessment
      const scope = estimateScope(prompt);

      // Phase 3: Tech stack detection
      const techStack = detectTechStack(prompt);

      // Phase 4: Missing context
      const missing = detectMissingContext(prompt);

      // Phase 5: Generate optimized prompt
      const optimized = [
        `## Context`,
        `Tech stack: ${techStack.join(", ")}`,
        `Intent: ${primaryIntent.replace(/_/g, " ")}`,
        `Scope: ${scope.level} — ${scope.label}`,
        "",
        `## Task`,
        prompt.trim(),
        "",
        missing.length > 0 ? `## Requirements (auto-detected)\n${missing.map(m => `- ${m}`).join("\n")}` : "",
        "",
        `## Verification`,
        `- [ ] All tests pass`,
        `- [ ] No lint errors`,
        `- [ ] Code follows project conventions`
      ].filter(Boolean).join("\n");

      // Phase 6: Workflow recommendation
      const workflows = {
        new_feature: "Plan → Implement (TDD) → Review → Verify → Commit",
        bug_fix: "Reproduce → Write failing test → Fix → Verify → Commit",
        refactor: "Understand → Plan → Refactor → Test → Review → Commit",
        research: "Search existing → Analyze → Document findings",
        testing: "Define criteria → Write tests → Implement → Verify coverage",
        review: "Read code → Check patterns → Identify issues → Suggest fixes",
        documentation: "Read code → Identify gaps → Write docs → Review",
        infrastructure: "Plan → Implement → Test → Deploy → Monitor",
        design: "Research → Design → Review → Implement"
      };

      const report = [
        "PROMPT OPTIMIZER ANALYSIS",
        "═══════════════════════════════════════",
        "",
        "### Diagnosis",
        `Intent: ${primaryIntent.replace(/_/g, " ")}`,
        `Scope: ${scope.level} — ${scope.label}`,
        `Tech stack: ${techStack.join(", ")}`,
        `Missing context: ${missing.length > 0 ? missing.join(", ") : "None detected"}`,
        "",
        "### Optimized Prompt",
        "```",
        optimized,
        "```",
        "",
        "### Workflow",
        workflows[primaryIntent] || "Plan → Implement → Review → Verify → Commit",
        "",
        "### Recommendations",
        ...[
          scope.level === "HIGH" || scope.level === "EPIC" ? "Consider using /plan before implementing" : null,
          missing.includes("Testing expectations") ? "Add test criteria to ensure quality" : null,
          missing.includes("Error handling") ? "Specify error handling strategy" : null,
          techStack.includes("Unknown") ? "Specify tech stack for better optimization" : null
        ].filter(Boolean).map(r => `- ${r}`),
        "",
        "═══════════════════════════════════════"
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "prompt_diagnose",
    "Quick diagnosis of a prompt without generating optimized version. Shows intent, scope, and gaps in a compact format.",
    {
      prompt: z.string().describe("The prompt to diagnose")
    },
    async ({ prompt }) => {
      const intents = INTENT_PATTERNS.filter(p =>
        p.signals.some(s => prompt.toLowerCase().includes(s))
      );
      const primaryIntent = intents.length > 0 ? intents[0].intent : "general";
      const scope = estimateScope(prompt);
      const techStack = detectTechStack(prompt);
      const missing = detectMissingContext(prompt);

      const report = [
        `Intent: ${primaryIntent.replace(/_/g, " ")}`,
        `Scope: ${scope.level}`,
        `Tech: ${techStack.join(", ")}`,
        `Gaps: ${missing.length > 0 ? missing.join(", ") : "none"}`
      ].join(" | ");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
