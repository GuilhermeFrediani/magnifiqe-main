/**
 * Stack Perfeita MCP — Failure Classifier
 * Proactive diagnostic framework that categorizes errors into structured
 * buckets with evidence, confidence scoring, and actionable next steps.
 */

import { z } from "zod";

// ─── Failure Classes & Patterns ──────────────────────────────────────────────

const FAILURE_CLASSES = {
  dependency: {
    label: "dependency",
    patterns: [
      /cannot find module/i,
      /module not found/i,
      /ERR_MODULE_NOT_FOUND/i,
      /ERR_REQUIRE_ESM/i,
      /ERR_UNKNOWN_FILE_EXTENSION/i,
      /SyntaxError: .+ is not exported from/i,
      /SyntaxError: .+ does not provide an export named/i,
      /failed to resolve import/i,
      /unresolved external/i,
      /Missing specifier/i,
      /bare specifier/i,
    ],
    signals: [
      "import",
      "require",
      "module",
      "export",
      "specifier",
      "resolv",
      "pkg",
      "node_modules",
    ],
    verdict: "HALT",
    next_command: "Run `npm install` or check import paths in the failing file.",
  },
  validation: {
    label: "validation",
    patterns: [
      /validation/i,
      /schema.*fail/i,
      /invalid.*input/i,
      /type.*mismatch/i,
      /expected.*but got/i,
      /must be.*string/i,
      /must be.*number/i,
      /constraint.*violation/i,
      /lint.*error/i,
      /eslint/i,
      /prettier/i,
      /code.*quality/i,
      /pattern.*match/i,
      /regex.*fail/i,
    ],
    signals: [
      "validation",
      "schema",
      "invalid",
      "constraint",
      "lint",
      "eslint",
      "prettier",
      "pattern",
      "regex",
      "mismatch",
    ],
    verdict: "WARN",
    next_command:
      "Fix the validation error, then re-run the operation that triggered it.",
  },
  compression: {
    label: "compression",
    patterns: [
      /compress/i,
      /CCR/i,
      /decompress/i,
      /pipeline.*fail/i,
      /store.*error/i,
      /store.*miss/i,
      /ccr.*error/i,
      /content.*compress/i,
    ],
    signals: [
      "compress",
      "decompress",
      "CCR",
      "pipeline",
      "store",
      "content",
    ],
    verdict: "WARN",
    next_command:
      "Check the CCR pipeline inputs and store state. Retry with raw content.",
  },
  memory: {
    label: "memory",
    patterns: [
      /session.*memory/i,
      /observation.*save/i,
      /observation.*load/i,
      /memory.*error/i,
      /memory.*corrupt/i,
      /json.*parse.*fail/i,
      /ENOENT.*session/i,
      /ENOENT.*memory/i,
      /readFile.*memory/i,
      /writeFile.*memory/i,
    ],
    signals: [
      "memory",
      "observation",
      "session",
      "json",
      "parse",
      "persist",
    ],
    verdict: "WARN",
    next_command:
      "Check session_memory.json integrity. Reset memory state if corrupt.",
  },
  state: {
    label: "state",
    patterns: [
      /project.*state/i,
      /state.*corrupt/i,
      /checkpoint.*fail/i,
      /snapshot.*error/i,
      /ENOENT.*state/i,
      /task_runtime/i,
      /stale.*state/i,
      /state.*mismatch/i,
    ],
    signals: [
      "state",
      "checkpoint",
      "snapshot",
      "corrupt",
      "runtime",
      "stale",
    ],
    verdict: "WARN",
    next_command:
      "Reset project state with a clean checkpoint. Verify task_runtime.json.",
  },
  tool: {
    label: "tool",
    patterns: [
      /ENOENT/i,
      /EACCES/i,
      /EPERM/i,
      /EISDIR/i,
      /ENOTDIR/i,
      /EMFILE/i,
      /ENOENT: no such file/i,
      /file not found/i,
      /no such file/i,
      /permission denied/i,
      /tool.*fail/i,
      /tool.*error/i,
      /timeout/i,
      /timed out/i,
      /rate.?limit/i,
      /429/,
      /too many requests/i,
      /ECONNREFUSED/i,
      /command failed/i,
    ],
    signals: [
      "file",
      "ENOENT",
      "EACCES",
      "permission",
      "timeout",
      "rate",
      "limit",
      "429",
      "command",
    ],
    verdict: "WARN",
    next_command:
      "Verify the file path exists and is accessible. Check tool permissions.",
  },
  hallucination: {
    label: "hallucination",
    patterns: [
      /does not exist/i,
      /no such file.*referenced/i,
      /symbol.*not found/i,
      /undefined.*variable/i,
      /not defined/i,
      /ReferenceError/i,
      /hallucin/i,
      /nonexistent.*file/i,
      /nonexistent.*symbol/i,
      /phantom/i,
      /imaginary/i,
    ],
    signals: [
      "does not exist",
      "not found",
      "ReferenceError",
      "undefined",
      "hallucin",
      "phantom",
    ],
    verdict: "HALT",
    next_command:
      "Verify the referenced file/symbol actually exists before proceeding.",
  },
  network: {
    label: "network",
    patterns: [
      /fetch.*fail/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /network.*error/i,
      /connection.*refused/i,
      /connection.*reset/i,
      /socket hang up/i,
      /ENOTFOUND/i,
      /DNS/i,
      /HTTP.*[45]\d\d/i,
      /api.*fail/i,
      /upstream.*error/i,
      /bad gateway/i,
      /service unavailable/i,
    ],
    signals: [
      "fetch",
      "connect",
      "network",
      "socket",
      "DNS",
      "HTTP",
      "api",
      "upstream",
      "gateway",
    ],
    verdict: "WARN",
    next_command:
      "Check network connectivity and API endpoint availability. Retry later.",
  },
  config: {
    label: "config",
    patterns: [
      /config.*missing/i,
      /config.*invalid/i,
      /missing.*config/i,
      /ENOENT.*config/i,
      /ENOENT.*\.json/i,
      /ENOENT.*\.env/i,
      /missing.*key/i,
      /missing.*env/i,
      /environment.*variable/i,
      /no.*configuration/i,
      /invalid.*path/i,
      /path.*invalid/i,
    ],
    signals: [
      "config",
      "env",
      "key",
      "setting",
      "path",
      ".json",
      ".env",
    ],
    verdict: "WARN",
    next_command:
      "Verify configuration files exist and required environment variables are set.",
  },
};

// ─── Classification Engine ───────────────────────────────────────────────────

/**
 * Score a string against a set of regex patterns.
 * Returns the number of matches (0 = no match).
 */
function scorePatterns(text, patterns) {
  let hits = 0;
  for (const pat of patterns) {
    if (pat.test(text)) hits++;
  }
  return hits;
}

/**
 * Score a string against signal keywords.
 * Returns count of signals found in the text (case-insensitive).
 */
function scoreSignals(text, signals) {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const sig of signals) {
    if (lower.includes(sig.toLowerCase())) hits++;
  }
  return hits;
}

/**
 * Classify an error message into a structured failure verdict.
 *
 * @param {string} errorMessage - The error message or stack trace
 * @param {string} [context=""] - Additional context about what was being done
 * @returns {object} Verdict object matching the output contract
 */
export function classifyFailure(errorMessage, context = "") {
  if (!errorMessage || errorMessage.trim() === "") {
    return {
      verdict: "WARN",
      failure_class: "unknown",
      evidence: ["Empty error message provided"],
      strongest_signal: "empty_input",
      likely_cause: "No error information available to classify",
      next_command: "Provide the actual error message or stack trace.",
      ruled_out: [],
      safe_to_continue: true,
    };
  }

  const combined = errorMessage + " " + context;
  const scored = [];

  for (const [className, config] of Object.entries(FAILURE_CLASSES)) {
    const patternHits = scorePatterns(combined, config.patterns);
    const signalHits = scoreSignals(combined, config.signals);

    // Combined confidence: patterns weighted 3x, signals weighted 1x
    const confidence = patternHits * 3 + signalHits;

    if (confidence > 0) {
      scored.push({
        className,
        confidence,
        patternHits,
        signalHits,
        config,
      });
    }
  }

  // Sort by confidence descending
  scored.sort((a, b) => b.confidence - a.confidence);

  // If nothing matched, return unknown
  if (scored.length === 0) {
    return {
      verdict: "WARN",
      failure_class: "unknown",
      evidence: [`No patterns matched: "${errorMessage.slice(0, 200)}"`],
      strongest_signal: "no_match",
      likely_cause: "Error does not match any known failure class",
      next_command:
        "Manually inspect the error and add a new pattern if this recurs.",
      ruled_out: [],
      safe_to_continue: true,
    };
  }

  const best = scored[0];
  const ruledOut = scored.slice(1).map((s) => s.className);

  // Build evidence list
  const evidence = [];
  if (best.patternHits > 0) {
    evidence.push(
      `Pattern match (${best.patternHits} hit${best.patternHits > 1 ? "s" : ""})`
    );
  }
  if (best.signalHits > 0) {
    evidence.push(
      `Signal match (${best.signalHits} keyword${best.signalHits > 1 ? "s" : ""})`
    );
  }
  evidence.push(
    `Confidence: ${best.confidence} (patterns: ${best.patternHits}×3=${best.patternHits * 3}, signals: ${best.signalHits})`
  );

  // Extract strongest matching pattern description
  let strongestSignal = "none";
  for (const pat of best.config.patterns) {
    if (pat.test(combined)) {
      strongestSignal = pat.source;
      break;
    }
  }

  // Determine safe_to_continue: only HALT if verdict is HALT
  const safeToContinue = best.config.verdict !== "HALT";

  return {
    verdict: best.config.verdict,
    failure_class: best.config.label,
    evidence,
    strongest_signal: strongestSignal,
    likely_cause: describeCause(best.config.label, errorMessage),
    next_command: best.config.next_command,
    ruled_out: ruledOut,
    safe_to_continue: safeToContinue,
  };
}

/**
 * Generate a human-readable cause description for a failure class.
 */
function describeCause(failureClass, message) {
  const snippet = message.slice(0, 120).replace(/\s+/g, " ");
  switch (failureClass) {
    case "dependency":
      return `Missing or unresolvable module dependency: ${snippet}`;
    case "validation":
      return `Input or code validation failed: ${snippet}`;
    case "compression":
      return `Compression pipeline error: ${snippet}`;
    case "memory":
      return `Memory/observation persistence failure: ${snippet}`;
    case "state":
      return `Project state inconsistency detected: ${snippet}`;
    case "tool":
      return `Tool or filesystem operation failed: ${snippet}`;
    case "hallucination":
      return `Reference to non-existent file or symbol: ${snippet}`;
    case "network":
      return `Network or API connectivity issue: ${snippet}`;
    case "config":
      return `Configuration missing or invalid: ${snippet}`;
    default:
      return `Unclassified failure: ${snippet}`;
  }
}

// ─── Tool Registration ───────────────────────────────────────────────────────

/**
 * Register the classify_failure tool on the MCP server.
 */
export function registerFailureClassifierTools(server) {
  server.tool(
    "classify_failure",
    "Classifies failures into structured categories with evidence and next actions",
    {
      error: z
        .string()
        .describe("Error message or stack trace"),
      context: z
        .string()
        .optional()
        .describe("Additional context about what was being done"),
    },
    async ({ error, context }) => {
      const result = classifyFailure(error, context || "");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
