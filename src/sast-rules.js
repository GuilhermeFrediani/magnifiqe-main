/**
 * Stack Perfeita MCP — Custom SAST Rules
 * AST-based security pattern matching with structured vulnerability detection.
 *
 * Rule categories ported from Anthropic Semgrep patterns:
 *   SQL Injection, XSS, Command Injection, Path Traversal,
 *   Hardcoded Secrets, Weak Crypto, Insecure Deserialization.
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { safeResolvePath } from "./helpers.js";
import { PROJECT_ROOT } from "./config.js";

// ─── SAST Rule Definitions ──────────────────────────────────────────────────
// Rules are defined in sast-rules-data.js with string patterns.
// We compile them to RegExp at load time for performance.

import { SAST_RULES_RAW } from "./sast-rules-data.js";

const SAST_RULES = SAST_RULES_RAW.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.pattern, rule.flags || ""),
}));

// ─── Rule Registry ──────────────────────────────────────────────────────────

const RULES_BY_ID = new Map(SAST_RULES.map((r) => [r.id, r]));
const RULES_BY_CATEGORY = new Map();
for (const rule of SAST_RULES) {
  if (!RULES_BY_CATEGORY.has(rule.category)) RULES_BY_CATEGORY.set(rule.category, []);
  RULES_BY_CATEGORY.get(rule.category).push(rule);
}

const CATEGORIES = [...RULES_BY_CATEGORY.keys()];
/**
 * Clear rule caches. Call during cleanup or testing to free memory.
 */
export function clearRulesCache() {
  RULES_BY_ID.clear();
  RULES_BY_CATEGORY.clear();
}

// ─── Binary file detection ──────────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

function isBinaryFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  try {
    const buf = readFileSync(filePath);
    const checkLen = Math.min(buf.length, 512);
    for (let i = 0; i < checkLen; i++) {
      if (buf[i] === 0) return true;
    }
  } catch {
    return false;
  }
  return false;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

/**
 * Scan source code against SAST rules.
 *
 * @param {string} code - source code to scan
 * @param {string} [filePath] - optional file path for language inference
 * @param {string[]} [ruleIds] - optional filter to specific rule IDs
 * @returns {object} structured scan result
 */
function scanCode(code, filePath, ruleIds) {
  if (typeof code !== "string" || code.length === 0) {
    return {
      findings: [],
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      scanned: false,
      reason: code === undefined || code === null ? "no content" : "empty file",
    };
  }

  // Infer language from extension
  const ext = filePath ? extname(filePath).toLowerCase() : "";
  let lang = "js";
  if ([".ts", ".tsx"].includes(ext)) lang = "ts";
  else if ([".jsx", ".tsx"].includes(ext)) lang = "jsx";

  // Filter rules by requested IDs
  let rules = SAST_RULES;
  if (Array.isArray(ruleIds)) {
    const idSet = new Set(ruleIds);
    rules = SAST_RULES.filter((r) => idSet.has(r.id));
  }

  const findings = [];
  const lines = code.split("\n");

  for (const rule of rules) {
    // Skip rules that don't match this language
    if (rule.language && rule.language.length > 0 && !rule.language.includes(lang)) {
      continue;
    }

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      if (rule.regex.test(line)) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          severity: rule.severity,
          line: lineNum + 1,
          column: 1,
          message: rule.description,
          code: line.trim(),
          fix: rule.fix,
          references: rule.references,
        });
      }
    }
  }

  const summary = { total: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (summary[f.severity] !== undefined) summary[f.severity]++;
  }

  return { findings, summary, scanned: true, ruleCount: rules.length };
}

/**
 * Scan a file on disk.
 *
 * @param {string} filePath
 * @param {string[]} [ruleIds]
 * @returns {object}
 */
function scanFile(filePath, ruleIds) {
  let resolved;
  try {
    resolved = safeResolvePath(PROJECT_ROOT, filePath);
  } catch {
    return { findings: [], summary: { total: 0 }, scanned: false, reason: "path traversal rejected" };
  }

  if (!existsSync(resolved)) {
    return { findings: [], summary: { total: 0 }, scanned: false, reason: "file not found" };
  }

  if (isBinaryFile(resolved)) {
    return { findings: [], summary: { total: 0 }, scanned: false, reason: "binary file" };
  }

  let code;
  try {
    code = readFileSync(resolved, "utf-8");
  } catch {
    return { findings: [], summary: { total: 0 }, scanned: false, reason: "read error" };
  }

  return scanCode(code, resolved, ruleIds);
}

// ─── Rule Format Validation ─────────────────────────────────────────────────

const RULE_SCHEMA = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  pattern: z.string().min(1),
  regex: z.instanceof(RegExp),
  language: z.array(z.string()),
  fix: z.string().min(1),
  references: z.array(z.string()),
  description: z.string().min(1),
});

function validateRule(rule) {
  const result = RULE_SCHEMA.safeParse(rule);
  return { valid: result.success, errors: result.success ? [] : result.error.issues };
}

function validateAllRules() {
  const results = SAST_RULES.map((r) => ({ id: r.id, ...validateRule(r) }));
  const invalid = results.filter((r) => !r.valid);
  return { total: SAST_RULES.length, valid: SAST_RULES.length - invalid.length, invalid };
}

// ─── MCP Tool Registration ──────────────────────────────────────────────────

export function registerSastRulesTools(server) {
  server.tool(
    "scan_sast_rules",
    "Runs custom SAST security rules against source code. Detects SQL injection, XSS, command injection, path traversal, hardcoded secrets, weak crypto, and insecure deserialization.",
    {
      path: z.string().describe("File or directory path to scan (relative to project root or absolute)."),
      rules: z.array(z.string()).optional().describe("Optional list of rule IDs to apply (default: all rules)."),
    },
    async ({ path, rules }) => {
      const resolvedPath = resolve(PROJECT_ROOT, path);

      if (!existsSync(resolvedPath)) {
        return { content: [{ type: "text", text: `HALT — Path not found: ${path}` }] };
      }

      const scanResult = scanFile(resolvedPath, rules);
      const output = {
        path,
        ...scanResult,
        rulesAvailable: SAST_RULES.length,
        categories: CATEGORIES,
      };

      return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
    }
  );

  server.tool(
    "sast_list_rules",
    "Lists all available SAST rules, optionally filtered by category.",
    {
      category: z.string().optional().describe("Filter rules by category name."),
    },
    async ({ category }) => {
      let rules = SAST_RULES;
      if (category) {
        rules = RULES_BY_CATEGORY.get(category) || [];
      }

      const output = rules.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        severity: r.severity,
        pattern: r.pattern,
        fix: r.fix,
        references: r.references,
      }));

      return { content: [{ type: "text", text: JSON.stringify({ rules: output, total: output.length }, null, 2) }] };
    }
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  SAST_RULES,
  RULES_BY_ID,
  RULES_BY_CATEGORY,
  CATEGORIES,
  scanCode,
  scanFile,
  validateRule,
  validateAllRules,
  isBinaryFile,
};
