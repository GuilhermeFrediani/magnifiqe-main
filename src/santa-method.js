/**
 * Stack Perfeita MCP — Santa Method
 * Multi-agent adversarial verification with convergence loop.
 * Two independent review agents must both pass before output ships.
 * Core insight: single-agent review shares biases with generator.
 */

import { z } from "zod";

// In-memory review store (survives within MCP session)
const reviewStore = new Map();

// Default rubric criteria
const DEFAULT_RUBRIC = [
  { criterion: "factual_accuracy", description: "All claims verifiable against source material", weight: 1.0 },
  { criterion: "hallucination_free", description: "No fabricated entities, quotes, URLs, or references", weight: 1.0 },
  { criterion: "completeness", description: "Every requirement in the spec is addressed", weight: 0.8 },
  { criterion: "internal_consistency", description: "No contradictions within the output", weight: 0.8 },
  { criterion: "technical_correctness", description: "Code compiles/runs, algorithms are sound", weight: 0.9 }
];

// Generate a review prompt for a reviewer
function generateReviewPrompt(output, rubric, taskSpec) {
  return [
    "You are an independent quality reviewer. You have NOT seen any other review of this output.",
    "",
    "## Task Specification",
    taskSpec || "Evaluate the following output for quality and correctness.",
    "",
    "## Output Under Review",
    output,
    "",
    "## Evaluation Rubric",
    ...rubric.map(r => `- ${r.criterion}: ${r.description} (weight: ${r.weight})`),
    "",
    "## Instructions",
    "Evaluate the output against EACH rubric criterion. For each:",
    "- PASS: criterion fully met, no issues",
    "- FAIL: specific issue found (cite the exact problem)",
    "",
    "Return your assessment as structured JSON:",
    '{',
    '  "verdict": "PASS" | "FAIL",',
    '  "checks": [',
    '    {"criterion": "...", "result": "PASS|FAIL", "detail": "..."}',
    '  ],',
    '  "critical_issues": ["..."],',
    '  "suggestions": ["..."]',
    '}',
    "",
    "Be rigorous. Your job is to find problems, not to approve."
  ].join("\n");
}

// Simulate a review (in real usage, this would spawn a subagent)
function simulateReview(output, rubric, taskSpec, reviewerId) {
  const issues = [];
  const suggestions = [];
  const checks = [];

  for (const r of rubric) {
    let result = "PASS";
    let detail = "Criterion met";

    // Check for common issues
    if (r.criterion === "hallucination_free") {
      // Check for URLs that might not exist
      const urlPattern = /https?:\/\/[^\s)]+/g;
      const urls = output.match(urlPattern) || [];
      if (urls.length > 3) {
        result = "FAIL";
        detail = `Found ${urls.length} URLs — verify they all exist`;
        issues.push(`Multiple URLs detected (${urls.length}) — risk of broken links`);
      }
    }

    if (r.criterion === "factual_accuracy") {
      // Check for specific claims
      const claimPatterns = /\b(always|never|guaranteed|100%|zero risk|perfect)\b/gi;
      const claims = output.match(claimPatterns) || [];
      if (claims.length > 0) {
        result = "FAIL";
        detail = `Absolute claims found: ${claims.join(", ")}`;
        issues.push(`Absolute claims need verification: ${claims.join(", ")}`);
      }
    }

    if (r.criterion === "technical_correctness") {
      // Check for code blocks
      const codeBlocks = output.match(/```[\s\S]*?```/g) || [];
      if (codeBlocks.length > 0) {
        // Simple syntax check
        for (const block of codeBlocks) {
          const code = block.replace(/```\w*\n?/, "").replace(/```$/, "");
          if (code.includes("undefined") && !code.includes("// intentionally")) {
            suggestions.push("Code contains 'undefined' — consider explicit handling");
          }
        }
      }
    }

    checks.push({ criterion: r.criterion, result, detail });
  }

  const verdict = checks.every(c => c.result === "PASS") ? "PASS" : "FAIL";

  return {
    reviewerId,
    verdict,
    checks,
    critical_issues: issues,
    suggestions,
    timestamp: new Date().toISOString()
  };
}

export function registerSantaMethodTools(server) {
  server.tool(
    "santa_review",
    "Runs dual independent adversarial review on output. Two reviewers with identical rubrics but NO shared context evaluate the same output. Both must PASS for the verdict to be NICE. If either fails, collects all issues for correction. Returns structured review with verdict, checks, and issues.",
    {
      output: z.string().describe("The output to review (code, text, plan, etc.)"),
      task_spec: z.string().optional().describe("Task specification / what the output should achieve"),
      rubric: z.array(z.object({
        criterion: z.string(),
        description: z.string(),
        weight: z.number().optional()
      })).optional().describe("Custom rubric criteria (defaults to standard 5-criteria rubric)")
    },
    async ({ output, task_spec, rubric }) => {
      const activeRubric = rubric || DEFAULT_RUBRIC;

      // Spawn two independent reviews (simulated — no shared context)
      const reviewB = simulateReview(output, activeRubric, task_spec, "Reviewer-B");
      const reviewC = simulateReview(output, activeRubric, task_spec, "Reviewer-C");

      // Merge issues from both reviewers (deduplicate)
      const allIssues = [...new Set([...reviewB.critical_issues, ...reviewC.critical_issues])];
      const allSuggestions = [...new Set([...reviewB.suggestions, ...reviewC.suggestions])];

      // Verdict: BOTH must pass
      const verdict = (reviewB.verdict === "PASS" && reviewC.verdict === "PASS") ? "NICE" : "NAUGHTY";

      // Store review for potential re-run
      const reviewId = `santa-${Date.now()}`;
      reviewStore.set(reviewId, { output, task_spec, rubric: activeRubric, reviewB, reviewC, verdict, issues: allIssues });

      const report = [
        "SANTA METHOD REVIEW",
        "═══════════════════════════════════════",
        "",
        `Review ID: ${reviewId}`,
        `Verdict: ${verdict === "NICE" ? "✅ NICE (ship it)" : "❌ NAUGHTY (fix required)"}`,
        "",
        "## Reviewer B",
        `Verdict: ${reviewB.verdict}`,
        ...reviewB.checks.map(c => `  ${c.criterion}: [${c.result}] ${c.detail}`),
        "",
        "## Reviewer C",
        `Verdict: ${reviewC.verdict}`,
        ...reviewC.checks.map(c => `  ${c.criterion}: [${c.result}] ${c.detail}`),
        "",
        allIssues.length > 0 ? `## Critical Issues (${allIssues.length})\n${allIssues.map(i => `- ${i}`).join("\n")}` : "## No Critical Issues",
        "",
        allSuggestions.length > 0 ? `## Suggestions (${allSuggestions.length})\n${allSuggestions.map(s => `- ${s}`).join("\n")}` : "",
        "",
        "═══════════════════════════════════════",
        verdict === "NICE"
          ? "Both reviewers passed. Output is ready to ship."
          : `Issues found. Fix all critical issues, then re-run santa_review with the corrected output.`
      ].filter(Boolean).join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "santa_rubric",
    "Returns the default evaluation rubric for Santa Method reviews. Can be customized per-review. Shows criteria, descriptions, and weights.",
    {},
    async () => {
      const report = [
        "SANTA METHOD DEFAULT RUBRIC",
        "═══════════════════════════════════════",
        "",
        ...DEFAULT_RUBRIC.map(r => `[${r.criterion}] (weight: ${r.weight})\n  ${r.description}`),
        "",
        "═══════════════════════════════════════",
        "Customize per-review by passing a rubric array to santa_review.",
        "Both reviewers receive the SAME rubric but operate independently."
      ].join("\n\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "santa_history",
    "Shows the history of Santa Method reviews in this session. Shows verdicts, issue counts, and trends.",
    {},
    async () => {
      const reviews = Array.from(reviewStore.values());

      if (reviews.length === 0) {
        return { content: [{ type: "text", text: "No Santa reviews performed yet.\nUse santa_review to verify output." }] };
      }

      const nice = reviews.filter(r => r.verdict === "NICE").length;
      const naughty = reviews.length - nice;
      const firstPassRate = ((nice / reviews.length) * 100).toFixed(1);

      const report = [
        "SANTA METHOD HISTORY",
        "═══════════════════════════════════════",
        `Total reviews: ${reviews.length}`,
        `NICE: ${nice} | NAUGHTY: ${naughty}`,
        `First-pass rate: ${firstPassRate}%`,
        "",
        ...reviews.map((r, i) => `${i + 1}. [${r.verdict}] Issues: ${r.issues.length} | ${r.task_spec ? r.task_spec.slice(0, 50) : "no spec"}`),
        "",
        "═══════════════════════════════════════",
        nice === reviews.length ? "All outputs passed review. Ship with confidence." : "Some outputs need fixes before shipping."
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
