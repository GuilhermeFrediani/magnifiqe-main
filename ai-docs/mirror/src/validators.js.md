# src/validators.js

- kind: js
- lines: 326
- bytes: 12112

## Summary
Stack Perfeita MCP — Validator tools validate_bad_code, validate_response_style, validate_git_commit, dependency_validate.

## Imports
- `zod`
- `fs`
- `path`
- `./config.js`
- `./helpers.js`
- `./rate-limiter.js`
- `./code-reading.js`
- `./dependency-resolution.js`

## Exports
- `analyzeResponseStyle`
- `registerValidatorsTools`
- `buildCodeValidationReport`

## Source
```js
/**
 * Stack Perfeita MCP — Validator tools
 * validate_bad_code, validate_response_style, validate_git_commit, dependency_validate.
 */

import { z } from "zod";
import { existsSync } from "fs";
import { dirname, join, basename, extname } from "path";
import { BAD_PATTERNS, RESPONSE_STYLE_PATTERNS } from "./config.js";
import { readFile, validateAbsolutePath } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";
import { analyzeCodeMetrics } from "./code-reading.js";
import { validateFileDependencies } from "./dependency-resolution.js";
const THRESHOLDS = {
  FUNC_SIZE_WARN: 50,
  FUNC_SIZE_HALT: 100,
  FILE_SIZE_WARN: 300,
  FILE_SIZE_HALT: 500,
  COMPLEXITY_WARN: 10,
  COMPLEXITY_HALT: 20,
  NESTING_WARN: 4,
  NESTING_HALT: 6,
};

const SCORE_PASS_MAX = 20;
const SCORE_WARN_MAX = 50;

function inferCodeLang(code, filePath) {
  const ext = (filePath ? extname(filePath).toLowerCase() : "");
  if ([".ts", ".tsx"].includes(ext)) return "ts";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "js";
  if (ext === ".py") return "py";

  if (/^\s*(from\s+\w+\s+import|import\s+\w+|def\s+\w+\(|class\s+\w+\s*[:(])/m.test(code)) return "py";
  if (/\binterface\s+\w+|\btype\s+\w+\s*=|:\s*[A-Z][A-Za-z0-9_<>,[]\s|]+|as\s+const\b/.test(code)) return "ts";
  return "js";
}

function severityScore(severity) {
  if (severity === "blocker") return 20;
  if (severity === "warning") return 8;
  return 3;
}

function formatBucket(title, items) {
  if (items.length === 0) return `- ${title}: none`;
  return [`- ${title} (${items.length}):`, ...items.map((item) => `  - ${item}`)].join("\n");
}

export function analyzeResponseStyle(text, mode = "adaptive") {
  const blockerHits = [];
  const warningHits = [];
  const advisoryHits = [];

  for (const pattern of RESPONSE_STYLE_PATTERNS) {
    if (pattern.regex.test(text)) {
      const line = `[${pattern.id}] ${pattern.msg}`;
      if (pattern.severity === "blocker") blockerHits.push(line);
      else if (pattern.severity === "warning") warningHits.push(line);
      else advisoryHits.push(line);
    }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (mode === "caveman" && wordCount > 120) {
    warningHits.push(`[verbosity] ${wordCount} words — too verbose for Caveman Mode`);
  } else if (mode === "adaptive" && wordCount > 220) {
    advisoryHits.push(`[verbosity] ${wordCount} words — consider compaction or tighter summary`);
  }

  let verdict = "PASS";
  if (blockerHits.length > 0) verdict = "HALT";
  else if (warningHits.length > 0 || advisoryHits.length > 0) verdict = "WARN";

  return {
    verdict,
    wordCount,
    blockers: blockerHits,
    warnings: warningHits,
    advisories: advisoryHits,
  };
}

function buildCodeValidationReport({ code, filePath }) {
  const lang = inferCodeLang(code, filePath);
  const blockers = [];
  const warnings = [];
  const advisories = [];
  let score = 0;

  for (const pattern of BAD_PATTERNS) {
    if (pattern.lang && pattern.lang !== lang) continue;
    if (!pattern.regex.test(code)) continue;

    const line = `[${pattern.id}] ${pattern.msg}`;
    score += severityScore(pattern.severity);

    if (pattern.severity === "blocker") blockers.push(line);
    else if (pattern.severity === "warning") warnings.push(line);
    else advisories.push(line);
  }

  const lineCount = code.split("\n").length;
  if (lineCount >= THRESHOLDS.FILE_SIZE_HALT) {
    score += 10;
    warnings.push(`[file-size] ${lineCount} lines — split file or isolate responsibilities`);
  } else if (lineCount >= THRESHOLDS.FILE_SIZE_WARN) {
    score += 5;
    advisories.push(`[file-size] ${lineCount} lines — monitor growth`);
  }

  const metrics = analyzeCodeMetrics(code);
  const largeFunctions = metrics.functions.filter((fn) => fn.lines >= THRESHOLDS.FUNC_SIZE_WARN);
  for (const fn of largeFunctions) {
    if (fn.lines >= THRESHOLDS.FUNC_SIZE_HALT) {
      score += 10;
      warnings.push(`[function-size] ${fn.name}: ${fn.lines} lines`);
    } else {
      score += 5;
      advisories.push(`[function-size] ${fn.name}: ${fn.lines} lines`);
    }
  }

  const complexFunctions = metrics.functions.filter((fn) => fn.complexity >= THRESHOLDS.COMPLEXITY_WARN);
  for (const fn of complexFunctions) {
    if (fn.complexity >= THRESHOLDS.COMPLEXITY_HALT) {
      score += 15;
      warnings.push(`[complexity] ${fn.name}: ${fn.complexity}`);
    } else {
      score += 5;
      advisories.push(`[complexity] ${fn.name}: ${fn.complexity}`);
    }
  }

  if (metrics.maxNesting >= THRESHOLDS.NESTING_HALT) {
    score += 10;
    warnings.push(`[nesting] ${metrics.maxNesting} levels`);
  } else if (metrics.maxNesting >= THRESHOLDS.NESTING_WARN) {
    score += 5;
    advisories.push(`[nesting] ${metrics.maxNesting} levels`);
  }

  const isTypeScript = filePath ? /\.(ts|tsx)$/.test(filePath) : lang === "ts";
  if (isTypeScript) {
    const untypedFunctions = metrics.functions.filter(
      (fn) => !fn.hasReturnType && fn.name !== "<arrow>" && fn.name !== "<anonymous>"
    );
    if (untypedFunctions.length > 0 && untypedFunctions.length <= 5) {
      score += 3;
      advisories.push(`[return-type] Missing explicit return type: ${untypedFunctions.map((fn) => fn.name).join(", ")}`);
    }
  }

  if (filePath) {
    const TEST_EXTS = [".js", ".ts", ".mjs", ".cjs"];
    const base = basename(filePath).replace(/\.(js|ts|jsx|tsx|mjs|cjs)$/, "");
    const testDirs = [
      dirname(filePath),
      join(dirname(filePath), "..", "test"),
      join(dirname(filePath), "..", "tests"),
      join(dirname(filePath), "..", "__tests__"),
    ];
    const hasTests = testDirs.some((dir) =>
      TEST_EXTS.some((ext) => existsSync(join(dir, `${base}.test${ext}`)))
    );
    const hasExports = /export\s+(function|const|class|default)|module\.exports/.test(code);
    if (hasExports && !hasTests) {
      score += 5;
      advisories.push(`[tests] No test file found for module "${base}"`);
    }
  }

  score = Math.min(score, 100);

  let verdict;
  if (blockers.length > 0) verdict = "HALT";
  else if (score <= SCORE_PASS_MAX) verdict = "PASS";
  else if (score <= SCORE_WARN_MAX) verdict = "WARN";
  else verdict = "HALT";

  return {
    lang,
    score,
    verdict,
    blockers,
    warnings,
    advisories,
    metrics,
    lineCount,
  };
}

export function registerValidatorsTools(server) {
  server.tool(
    "validate_bad_code",
    "Checks code against strong signals (blockers), structural warnings, and style advisories. Uses regex + AST metrics. Returns risk score 0-100 with PASS/WARN/HALT. Best used before shipping code or claiming success.",
    {
      code: z.string().describe("Code snippet to validate (JavaScript/TypeScript/Python)."),
      file_path: z.string().optional().describe("Absolute path to the source file. Helps detect TypeScript and missing test files."),
    },
    async ({ code, file_path }) => {
      const rateLimitHit = rateLimiter.check("validate_bad_code");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const report = buildCodeValidationReport({ code, filePath: file_path });
      const sections = [
        `RISK SCORE: ${report.score}/100 (${report.verdict})`,
        `- Language guess: ${report.lang}`,
        `- Lines: ${report.lineCount}`,
        formatBucket("BLOCKERS", report.blockers),
        formatBucket("WARNINGS", report.warnings),
        formatBucket("ADVISORIES", report.advisories),
      ];

      if (report.verdict === "HALT") {
        sections.push("", "Fix blockers first. If blockers are empty, reduce warnings before proceeding.");
      } else if (report.verdict === "WARN") {
        sections.push("", "Warnings do not block by themselves, but they should be reviewed before merge.");
      }

      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    }
  );

  server.tool(
    "validate_response_style",
    "Checks whether a natural-language response contains excitation tokens, hesitation filler, or overly verbose prose. Use before long explanatory answers. Mode 'caveman' enforces a tighter verbosity budget.",
    {
      text: z.string().describe("Draft response text to validate."),
      mode: z.enum(["adaptive", "caveman"]).default("adaptive").describe("adaptive = concise but normal. caveman = ultra-compact output mode."),
    },
    async ({ text, mode }) => {
      const rateLimitHit = rateLimiter.check("validate_response_style");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const report = analyzeResponseStyle(text, mode);
      const body = [
        `STYLE CHECK: ${report.verdict}`,
        `- Mode: ${mode}`,
        `- Word count: ${report.wordCount}`,
        formatBucket("BLOCKERS", report.blockers),
        formatBucket("WARNINGS", report.warnings),
        formatBucket("ADVISORIES", report.advisories),
      ];

      if (report.verdict === "HALT") {
        body.push("", "Remove filler/process narration before sending this answer.");
      }

      return {
        content: [{ type: "text", text: body.join("\n") }],
      };
    }
  );

  server.tool(
    "validate_git_commit",
    "Validates a git commit message against conventional commit standards. Checks format, length, type, and scope.",
    { message: z.string().describe("Git commit message to validate.") },
    async ({ message }) => {
      const rateLimitHit = rateLimiter.check("validate_git_commit");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      const commitRegex = /^(feat|fix|docs|style|refactor|perf|test|chore)(\([^)]+\))?:\s.+/;

      if (commitRegex.test(message)) {
        return {
          content: [{ type: "text", text: "PASS — Valid Conventional Commits format." }],
        };
      }

      return {
        content: [{ type: "text", text: "HALT — Invalid format. Will be: type(scope): description. Valid types: feat, fix, docs, style, refactor, perf, test, chore." }],
      };
    }
  );

  server.tool(
    "dependency_validate",
    "Fast-path validator for imports and asset references. Checks relative imports, workspace packages, package exports, node_modules, tsconfig/jsconfig aliases, Vite aliases, and local HTML assets. Use to catch hallucinated references before claiming a module exists.",
    { file_path: z.string().describe("Absolute path to the file to validate dependencies for.") },
    async ({ file_path }) => {
      const rateLimitHit = rateLimiter.check("dependency_validate");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const absPath = validateAbsolutePath(file_path);
      if (!existsSync(absPath)) {
        return { content: [{ type: "text", text: `HALT — File does not exist: ${absPath}` }] };
      }

      const content = readFile(absPath);
      if (!content) {
        return { content: [{ type: "text", text: `HALT — Cannot read file: ${absPath}` }] };
      }

      const report = validateFileDependencies(absPath, content);
      if (!report.ok) {
        return {
          content: [{
            type: "text",
            text: `HALT — ${report.missing.length} missing reference(s):\n\n${report.missing.map((item) => `- ${item.label} [via=${item.via}]`).join("\n")}\n\nChecked: relative paths, workspace packages (${report.stats.workspaces}), package exports, node_modules, tsconfig/jsconfig + Vite aliases (${report.stats.aliases}), baseUrl roots (${report.stats.baseDirs}), Node built-ins, HTML assets.`,
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `PASS — All imports and local asset references resolved. Checked: relative paths, workspace packages (${report.stats.workspaces}), package exports, node_modules, tsconfig/jsconfig + Vite aliases (${report.stats.aliases}), baseUrl roots (${report.stats.baseDirs}), Node built-ins, HTML assets.`,
        }],
      };
    }
  );
}

export { buildCodeValidationReport };

```
