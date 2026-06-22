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
import { detectTyposquat } from "./typosquat-detect.js";
import { runGuardrailPipeline } from "./guardrail-pipeline.js";
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

function checkBadPatterns(code, lang) {
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

  return { blockers, warnings, advisories, score };
}

function checkFileSize(code) {
  const lineCount = code.split("\n").length;
  let score = 0;
  const warnings = [];
  const advisories = [];

  if (lineCount >= THRESHOLDS.FILE_SIZE_HALT) {
    score += 10;
    warnings.push(`[file-size] ${lineCount} lines — split file or isolate responsibilities`);
  } else if (lineCount >= THRESHOLDS.FILE_SIZE_WARN) {
    score += 5;
    advisories.push(`[file-size] ${lineCount} lines — monitor growth`);
  }

  return { lineCount, score, warnings, advisories };
}

function checkFunctionMetrics(metrics) {
  const warnings = [];
  const advisories = [];
  let score = 0;

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

  return { score, warnings, advisories };
}

function checkNesting(metrics) {
  let score = 0;
  const warnings = [];
  const advisories = [];

  if (metrics.maxNesting >= THRESHOLDS.NESTING_HALT) {
    score += 10;
    warnings.push(`[nesting] ${metrics.maxNesting} levels`);
  } else if (metrics.maxNesting >= THRESHOLDS.NESTING_WARN) {
    score += 5;
    advisories.push(`[nesting] ${metrics.maxNesting} levels`);
  }

  return { score, warnings, advisories };
}

function checkReturnType(metrics, filePath, lang) {
  let score = 0;
  const advisories = [];

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

  return { score, advisories };
}

function checkTestCoverage(code, filePath) {
  let score = 0;
  const advisories = [];

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
    if (hasTests === false && hasExports) {
      score += 5;
      advisories.push(`[tests] No test file found for module "${base}"`);
    }
  }

  return { score, advisories };
}

function buildCodeValidationReport({ code, filePath }) {
  const lang = inferCodeLang(code, filePath);

  const patterns = checkBadPatterns(code, lang);
  const fileSize = checkFileSize(code);
  const metrics = analyzeCodeMetrics(code);
  const funcMetrics = checkFunctionMetrics(metrics);
  const nesting = checkNesting(metrics);
  const returnType = checkReturnType(metrics, filePath, lang);
  const tests = checkTestCoverage(code, filePath);

  const blockers = patterns.blockers;
  const warnings = [...patterns.warnings, ...fileSize.warnings, ...funcMetrics.warnings, ...nesting.warnings];
  const advisories = [...patterns.advisories, ...fileSize.advisories, ...funcMetrics.advisories, ...nesting.advisories, ...returnType.advisories, ...tests.advisories];
  const score = Math.min(
    patterns.score + fileSize.score + funcMetrics.score + nesting.score + returnType.score + tests.score,
    100
  );

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
    lineCount: fileSize.lineCount,
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

      try {
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
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — dependency_validate failed: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "detect_typosquat",
    "Detects typosquatting in npm package names using Levenshtein distance and metadata heuristics",
    { packageName: z.string().describe("npm package name to check") },
    async ({ packageName }) => {
      const rateLimitHit = rateLimiter.check("detect_typosquat");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const report = detectTyposquat(packageName);
        const sections = [
          `VERDICT: ${report.verdict}`,
          `- Package: ${report.package}`,
          `- Candidates found: ${report.candidates.length}`,
          ``,
          report.recommendation,
        ];

        if (report.candidates.length > 0) {
          sections.push('', 'Top candidates:');
          report.candidates.slice(0, 5).forEach(c => {
            sections.push(`  - ${c.name} (distance: ${c.distance}, method: ${c.method}, risk: ${c.risk})`);
          });
        }

        return {
          content: [{ type: "text", text: sections.join("\n") }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — detect_typosquat failed: ${e.message}` }] };
      }
    }
  );
  server.tool(
    "validate_input_schema",
    "Validates tool input against JSON Schema patterns for security. Detects SQL injection, XSS, command injection, path traversal, and hardcoded secrets in input values. Enforces additionalProperties: false when a schema is provided.",
    {
      toolName: z.string().describe("Name of the tool being validated."),
      input: z.any().describe("The input object to validate."),
      schema: z.object({
        type: z.string().optional(),
        properties: z.record(z.any()).optional(),
        required: z.array(z.string()).optional(),
      }).optional().describe("Optional JSON Schema to validate input shape against."),
    },
    async ({ toolName, input, schema }) => {
      const rateLimitHit = rateLimiter.check("validate_input_schema");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const findings = [];
      let verdict = "PASS";

      // ─── Security pattern scan across all string values ─────────────────────
      const SECURITY_PATTERNS = [
        // SQL Injection
        { regex: /SELECT\s+.*\s+FROM/i,       id: "sql-select-from",  msg: "SQL SELECT FROM — potential SQL injection" },
        { regex: /INSERT\s+INTO/i,             id: "sql-insert-into",  msg: "SQL INSERT INTO — potential SQL injection" },
        { regex: /DROP\s+TABLE/i,             id: "sql-drop-table",   msg: "SQL DROP TABLE — destructive SQL operation" },
        { regex: /UNION\s+SELECT/i,           id: "sql-union-select", msg: "SQL UNION SELECT — classic SQL injection vector" },
        // XSS
        { regex: /<script[\s>]/i,             id: "xss-script-tag",   msg: "<script> tag — potential XSS vector" },
        { regex: /javascript\s*:/i,           id: "xss-javascript",   msg: "javascript: URI — potential XSS vector" },
        { regex: /onerror\s*=/i,              id: "xss-onerror",      msg: "onerror attribute — potential XSS event handler" },
        { regex: /onload\s*=/i,               id: "xss-onload",       msg: "onload attribute — potential XSS event handler" },
        // Command Injection
        { regex: /\bexec\s*\(/,               id: "cmd-exec",         msg: "exec() — command injection risk" },
        { regex: /\bspawn\s*\(/,              id: "cmd-spawn",        msg: "spawn() — validate input before spawning process" },
        { regex: /\bsystem\s*\(/,             id: "cmd-system",       msg: "system() — command injection risk" },
        // Path Traversal
        { regex: /\.\.\//,                    id: "path-traversal",   msg: "Path traversal (../) detected" },
        { regex: /\.\.\\/,                    id: "path-traversal-w", msg: "Path traversal (..\\) detected" },
        { regex: /\/etc\/passwd/i,            id: "path-etc-passwd",  msg: "Reference to /etc/passwd — sensitive system file" },
        // Hardcoded Secrets
        { regex: /password\s*=\s*['"]/i,      id: "secret-password",  msg: "Hardcoded password detected" },
        { regex: /api[_-]?key\s*=\s*['"]/i,  id: "secret-api-key",   msg: "Hardcoded API key detected" },
        { regex: /secret\s*=\s*['"]/i,        id: "secret-generic",   msg: "Hardcoded secret detected" },
      ];

      // Recursively extract all string values from the input
      function collectStrings(obj, path) {
        const strings = [];
        if (obj === null || obj === undefined) return strings;
        if (typeof obj === "string") {
          strings.push({ value: obj, path });
          return strings;
        }
        if (Array.isArray(obj)) {
          obj.forEach((item, i) => strings.push(...collectStrings(item, `${path}[${i}]`)));
          return strings;
        }
        if (typeof obj === "object") {
          for (const [key, val] of Object.entries(obj)) {
            strings.push(...collectStrings(val, path ? `${path}.${key}` : key));
          }
        }
        return strings;
      }

      const stringValues = collectStrings(input, "");
      for (const { value, path: fieldPath } of stringValues) {
        for (const pattern of SECURITY_PATTERNS) {
          if (pattern.regex.test(value)) {
            findings.push({
              field: fieldPath || "(root)",
              patternId: pattern.id,
              message: pattern.msg,
            });
          }
        }
      }

      if (findings.length > 0) verdict = "HALT";

      // ─── Schema validation ──────────────────────────────────────────────────
      const schemaIssues = [];
      if (schema) {
        const expectedProps = schema.properties ? Object.keys(schema.properties) : [];
        const requiredFields = schema.required || [];

        if (schema.type === "object" && typeof input === "object" && input !== null && !Array.isArray(input)) {
          // Check required fields
          for (const req of requiredFields) {
            if (!(req in input)) {
              schemaIssues.push(`Missing required field: "${req}"`);
            }
          }

          // Enforce additionalProperties: false
          if (expectedProps.length > 0) {
            const extraKeys = Object.keys(input).filter((k) => !expectedProps.includes(k));
            if (extraKeys.length > 0) {
              schemaIssues.push(`additionalProperties rejected: ${extraKeys.join(", ")}`);
            }
          }

          // Type check against schema
          for (const [prop, propSchema] of Object.entries(schema.properties || {})) {
            if (prop in input && propSchema.type) {
              const actual = Array.isArray(input[prop]) ? "array" : typeof input[prop];
              if (actual !== propSchema.type) {
                schemaIssues.push(`Field "${prop}" expected type "${propSchema.type}", got "${actual}"`);
              }
            }
          }
        }
      }

      if (schemaIssues.length > 0 && verdict !== "HALT") verdict = "WARN";

      // ─── Build report ───────────────────────────────────────────────────────
      const sections = [
        `VALIDATE_INPUT_SCHEMA: ${verdict}`,
        `- Tool: ${toolName}`,
        `- Input fields scanned: ${stringValues.length}`,
      ];

      if (findings.length > 0) {
        sections.push(`- Security findings (${findings.length}):`);
        findings.forEach((f) => sections.push(`  - [${f.patternId}] ${f.field}: ${f.message}`));
      } else {
        sections.push("- Security findings: none");
      }

      if (schemaIssues.length > 0) {
        sections.push(`- Schema issues (${schemaIssues.length}):`);
        schemaIssues.forEach((issue) => sections.push(`  - ${issue}`));
      } else if (schema) {
        sections.push("- Schema validation: PASS");
      }

      if (verdict === "HALT") {
        sections.push("", "Security threat detected in input. Review and sanitize before proceeding.");
      } else if (verdict === "WARN") {
        sections.push("", "Schema issues found. Fix input shape before proceeding.");
      }

      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    }
  );
  server.tool(
    "guardrail_pipeline",
    "Runs centralized input/output validation through configurable security rails",
    {
      text: z.string().describe("Text to validate through the guardrail pipeline."),
      direction: z.enum(['input', 'output']).default('input').describe("Whether to run input rails (injection, pii, length) or output rails (quality, safety, schema)."),
      rails: z.array(z.string()).optional().describe("Override default rails. Input: ['injection', 'pii', 'length']. Output: ['quality', 'safety', 'schema']."),
    },
    async ({ text, direction, rails }) => {
      const rateLimitHit = rateLimiter.check("guardrail_pipeline");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const result = await runGuardrailPipeline(text, { direction, rails });

      const sections = [
        `GUARDRAIL VERDICT: ${result.verdict}`,
        `- Direction: ${direction}`,
        `- Rails run: ${result.rails.length}/${result.total_rails}`,
        `- Passed: ${result.passed}`,
      ];

      for (const r of result.rails) {
        const icon = r.verdict === "PASS" ? "✓" : r.verdict === "HALT" ? "✗" : "⚠";
        sections.push(`\n${icon} ${r.rail}: ${r.verdict}`);
        for (const m of r.matches) {
          sections.push(`  - ${m}`);
        }
      }

      if (result.verdict === "HALT") {
        sections.push("", "Pipeline halted. Address blocking issues before proceeding.");
      } else if (result.verdict === "WARN") {
        sections.push("", "Warnings detected. Review recommended.");
      }

      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    }
  );
}

export { buildCodeValidationReport };
