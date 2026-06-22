# src/caveman.js

- kind: js
- lines: 235
- bytes: 9492

## Summary
Stack Perfeita MCP — Caveman tools Output budget enforcement, caveman mode validation, and auto-validation chain.

## Imports
- `zod`
- `fs`
- `crypto`
- `child_process`
- `./helpers.js`
- `./rate-limiter.js`
- `./config.js`

## Exports
- `registerCavemanTools`

## Source
```js
/**
 * Stack Perfeita MCP — Caveman tools
 * Output budget enforcement, caveman mode validation, and auto-validation chain.
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { validateAbsolutePath } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";
import { PROJECT_ROOT } from "./config.js";

// ─── Caveman budgets ────────────────────────────────────────────────────────
const CAVEMAN_BUDGETS = {
  simple: { maxWords: 30, maxLines: 10, maxCodeLines: 50, maxExplanations: 0 },
  moderate: { maxWords: 80, maxLines: 20, maxCodeLines: 100, maxExplanations: 1 },
  complex: { maxWords: 200, maxLines: 50, maxCodeLines: 200, maxExplanations: 3 },
};

/**
 * Register caveman mode tools on the MCP server.
 * Tools: validate_caveman_output, caveman_budget, auto_validate_output
 */
export function registerCavemanTools(server) {
  // ── validate_caveman_output ────────────────────────────────────────────
  server.tool(
    "validate_caveman_output",
    "Enforces Caveman Mode: ultra-compact output. Checks word count, explanation count, code comments, and output length. Returns HALT/WARN/PASS with a caveman score 0-10.",
    {
      text: z.string().describe("Output text to validate for caveman mode compliance."),
      task_complexity: z.enum(["simple", "moderate", "complex"]).default("simple").describe("Task complexity level."),
    },
    async ({ text, task_complexity }) => {
      const rateLimitHit = rateLimiter.check("validate_caveman_output");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const lines = text.split("\n").filter((l) => l.trim());
      const wordCount = text.trim().split(/\s+/).length;
      const codeLines = lines.filter((l) => /^\s*(function|const|let|var|class|def|if|for|while|return|import|export|from|async|await)\b/.test(l)).length;

      // Count explanation patterns
      const explanationPatterns = [
        /\b(this is|here is|the reason|because|in order to|the purpose|basically|essentially)\b/gi,
        /\b(I'm going to|let me|I will|we need to|you should)\b/gi,
      ];
      let explanationCount = 0;
      for (const pattern of explanationPatterns) {
        const matches = text.match(pattern) || [];
        explanationCount += matches.length;
      }

      const budget = CAVEMAN_BUDGETS[task_complexity];

      let score = 10;
      const issues = [];

      if (wordCount > budget.maxWords) {
        score -= 3;
        issues.push(`Word count ${wordCount} exceeds budget ${budget.maxWords}`);
      }
      if (lines.length > budget.maxLines) {
        score -= 2;
        issues.push(`Line count ${lines.length} exceeds budget ${budget.maxLines}`);
      }
      if (codeLines > budget.maxCodeLines) {
        score -= 2;
        issues.push(`Code lines ${codeLines} exceeds budget ${budget.maxCodeLines}`);
      }
      if (explanationCount > budget.maxExplanations) {
        score -= 3;
        issues.push(`Explanation count ${explanationCount} exceeds budget ${budget.maxExplanations}`);
      }

      score = Math.max(0, Math.min(10, score));

      let verdict = "PASS";
      if (score < 5) verdict = "HALT";
      else if (score < 8) verdict = "WARN";

      const resultLines = [
        `CAVEMAN SCORE: ${score}/10 (${verdict})`,
        `- Task complexity: ${task_complexity}`,
        `- Words: ${wordCount}/${budget.maxWords}`,
        `- Lines: ${lines.length}/${budget.maxLines}`,
        `- Code lines: ${codeLines}/${budget.maxCodeLines}`,
        `- Explanations: ${explanationCount}/${budget.maxExplanations}`,
      ];

      if (issues.length > 0) {
        resultLines.push("", "Issues:", ...issues.map((i) => `  - ${i}`));
      }

      if (verdict === "HALT") {
        resultLines.push("", "HALT — Output is too verbose for Caveman Mode. Remove explanations and reduce to essentials.");
      } else if (verdict === "WARN") {
        resultLines.push("", "WARN — Output is borderline. Consider trimming further.");
      }

      return { content: [{ type: "text", text: resultLines.join("\n") }] };
    }
  );

  // ── caveman_budget ──────────────────────────────────────────────────────
  server.tool(
    "caveman_budget",
    "Returns the current Caveman Mode budget limits based on task complexity. Use to check what's allowed before generating output.",
    {
      task_complexity: z.enum(["simple", "moderate", "complex"]).default("simple").describe("Task complexity level."),
    },
    async ({ task_complexity }) => {
      const budget = CAVEMAN_BUDGETS[task_complexity];

      const lines = [
        `CAVEMAN BUDGET — ${task_complexity}`,
        `- Max words: ${budget.maxWords}`,
        `- Max lines: ${budget.maxLines}`,
        `- Max code lines: ${budget.maxCodeLines}`,
        `- Max explanations: ${budget.maxExplanations}`,
        "",
        "Rules:",
        "- Code only, no prose unless explaining a non-obvious decision",
        "- No process narration (I'm going to, let me, etc.)",
        "- No motivational filler",
        "- If > 1 explanation needed, task is too complex for simple mode",
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── auto_validate_output ───────────────────────────────────────────────
  server.tool(
    "auto_validate_output",
    "Chain validation: checks code quality, verifies file on disk, and optionally runs tests. Returns a consolidated PASS/FAIL report. Use before claiming task completion.",
    {
      file_path: z.string().describe("Absolute path to the modified file."),
      code: z.string().describe("Code content to validate."),
      test_command: z.string().optional().describe("Optional test command to run after validation."),
    },
    async ({ file_path, code, test_command }) => {
      const rateLimitHit = rateLimiter.check("auto_validate_output");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const results = [];
      let overallPass = true;

      // Step 1: Check file exists
      try {
        const absPath = validateAbsolutePath(file_path);
        if (existsSync(absPath)) {
          const diskContent = readFileSync(absPath, "utf-8");
          const hash = createHash("sha256").update(diskContent).digest("hex").slice(0, 16);
          results.push(`FILE SYNC: PASS — ${absPath} (hash: ${hash}, ${diskContent.split("\n").length} lines)`);
        } else {
          results.push(`FILE SYNC: FAIL — File not found: ${absPath}`);
          overallPass = false;
        }
      } catch (e) {
        results.push(`FILE SYNC: FAIL — ${e.message}`);
        overallPass = false;
      }

      // Step 2: Check code quality (basic checks)
      const hasAny = /:\\s*any\\b/.test(code);
      const hasEval = /\\beval\\b/.test(code);
      const hasEmptyCatch = /catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}/.test(code);
      const hasVar = /\\bvar\\b/.test(code);

      const codeIssues = [];
      if (hasAny) codeIssues.push("TypeScript 'any' type detected");
      if (hasEval) codeIssues.push("eval() usage detected");
      if (hasEmptyCatch) codeIssues.push("Empty catch block detected");
      if (hasVar) codeIssues.push("'var' usage detected (prefer const/let)");

      if (codeIssues.length > 0) {
        results.push(`CODE QUALITY: WARN — ${codeIssues.length} issue(s): ${codeIssues.join(", ")}`);
      } else {
        results.push("CODE QUALITY: PASS — No blocker patterns detected");
      }

      // Step 3: Run tests if provided
      if (test_command) {
        try {
          let output = "";
          let exitCode = 0;
          try {
            output = execSync(test_command, {
              cwd: PROJECT_ROOT,
              timeout: 30000,
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
              windowsHide: true,
            });
          } catch (e) {
            output = (e.stdout || "") + "\n" + (e.stderr || "");
            exitCode = e.status || 1;
          }

          const failMatch = output.match(/# fail (\\d+)/);
          const failCount = failMatch ? parseInt(failMatch[1]) : 0;

          if (failCount > 0 || exitCode !== 0) {
            results.push(`TESTS: FAIL — ${failCount} test(s) failed (exit code: ${exitCode})`);
            overallPass = false;
          } else {
            results.push("TESTS: PASS — All tests passed");
          }
        } catch (e) {
          results.push(`TESTS: FAIL — Error running tests: ${e.message}`);
          overallPass = false;
        }
      }

      const verdict = overallPass ? "PASS" : "FAIL";
      const lines = [
        `AUTO VALIDATE: ${verdict}`,
        `- File: ${file_path}`,
        "",
        ...results,
      ];

      if (!overallPass) {
        lines.push("", "Fix issues before claiming completion.");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

```
