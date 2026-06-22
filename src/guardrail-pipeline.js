/**
 * Stack Perfeita MCP — Guardrail Pipeline
 * Centralized input/output validation through configurable security rails.
 *
 * Input rails:  injection, pii, length
 * Output rails: quality, safety, schema
 */

import { RESPONSE_STYLE_PATTERNS } from "./config.js";

// ─── Injection Detection ────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  { regex: /ignore\s+(all\s+)?(previous|prior|earlier|above)\s+(instructions?|prompts?|rules?)/i, id: "ignore-instructions", msg: "Attempt to override prior instructions" },
  { regex: /you\s+are\s+now\s+(a|an|the)\s+/i, id: "role-reassignment", msg: "Attempt to reassign AI role" },
  { regex: /system\s*(prompt|message)\s*[:=]/i, id: "system-prompt-ref", msg: "Reference to system prompt injection" },
  { regex: /\b(disregard|forget|override|bypass)\s+(your|all|the|these)\s+(rules?|instructions?|guidelines?|constraints?)/i, id: "bypass-rules", msg: "Attempt to bypass rules or constraints" },
  { regex: /(?:jailbreak|DAN|do\s+anything\s+now)/i, id: "jailbreak-keyword", msg: "Jailbreak keyword detected" },
  { regex: /\bpretend\s+(you\s+)?(are|you're|to\s+be)\s+(?:a|an|not)\s+/i, id: "pretend-role", msg: "Attempt to make AI pretend a different role" },
  { regex: /\bact\s+as\s+(?:if\s+)?(?:you\s+(?:have|had)|there\s+(?:are|is)\s+no)\s+/i, id: "act-as-bypass", msg: "Attempt to bypass restrictions via roleplay" },
  { regex: /\b(encode|decode)\s+(this|the|your)\s+(?:entire|full)?\s*(system|initial)\s+(?:prompt|message|instruction)/i, id: "prompt-exfiltration", msg: "Attempt to exfiltrate system prompt" },
  { regex: /\bwhat\s+(?:is|are|were)\s+your\s+(?:system|initial|original)\s+(?:prompt|message|instructions?)/i, id: "prompt-probe", msg: "Probing for system prompt content" },
];

// ─── PII Detection ──────────────────────────────────────────────────────────

const PII_PATTERNS = [
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, id: "email", msg: "Email address detected" },
  { regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/, id: "phone", msg: "Phone number detected" },
  { regex: /\b\d{3}-\d{2}-\d{4}\b/, id: "ssn", msg: "Social Security Number detected" },
  { regex: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, id: "credit-card", msg: "Credit card number detected" },
];

// ─── Safety / Harmful Content Detection (output) ────────────────────────────

const SAFETY_PATTERNS = [
  { regex: /\b(how\s+to\s+(?:make|build|create)\s+(?:a\s+)?(?:bomb|explosive|weapon|poison|drug))\b/i, id: "harmful-instructions", msg: "Potentially harmful instruction content" },
  { regex: /\b(suicide|self[-\s]?harm)\s+(?:method|technique|instructions?|how\s+to)/i, id: "self-harm-instructions", msg: "Self-harm instruction content" },
  { regex: /\b(hack|exploit|crack)\s+(?:into|a\s+|the\s+)?(?:system|server|network|database)\b/i, id: "unauthorized-access", msg: "Unauthorized access instruction content" },
];

// ─── Length Limits ──────────────────────────────────────────────────────────

const MAX_INPUT_LENGTH = 100_000;

// ─── Rail Runners ───────────────────────────────────────────────────────────

/**
 * Run the injection detection rail.
 */
function runInjectionRail(text) {
  const matches = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.regex.test(text)) {
      matches.push(`[${p.id}] ${p.msg}`);
    }
  }
  return {
    rail: "injection",
    verdict: matches.length > 0 ? "HALT" : "PASS",
    matches,
  };
}

/**
 * Run the PII detection rail.
 */
function runPIIRail(text) {
  const matches = [];
  for (const p of PII_PATTERNS) {
    if (p.regex.test(text)) {
      matches.push(`[${p.id}] ${p.msg}`);
    }
  }
  return {
    rail: "pii",
    verdict: matches.length > 0 ? "WARN" : "PASS",
    matches,
  };
}

/**
 * Run the length rail.
 */
function runLengthRail(text) {
  if (text.length > MAX_INPUT_LENGTH) {
    return {
      rail: "length",
      verdict: "HALT",
      matches: [`[too-long] Input is ${text.length} chars (max ${MAX_INPUT_LENGTH})`],
    };
  }
  return { rail: "length", verdict: "PASS", matches: [] };
}

/**
 * Run the quality rail (output) — reuses RESPONSE_STYLE_PATTERNS from config.
 */
function runQualityRail(text) {
  const blockerHits = [];
  const warningHits = [];

  for (const pattern of RESPONSE_STYLE_PATTERNS) {
    if (pattern.regex.test(text)) {
      const entry = `[${pattern.id}] ${pattern.msg}`;
      if (pattern.severity === "blocker") blockerHits.push(entry);
      else if (pattern.severity === "warning") warningHits.push(entry);
    }
  }

  const matches = [...blockerHits, ...warningHits];
  const verdict = blockerHits.length > 0 ? "HALT" : matches.length > 0 ? "WARN" : "PASS";

  return {
    rail: "quality",
    verdict,
    matches,
  };
}

/**
 * Run the safety rail (output) — checks for harmful content.
 */
function runSafetyRail(text) {
  const matches = [];
  for (const p of SAFETY_PATTERNS) {
    if (p.regex.test(text)) {
      matches.push(`[${p.id}] ${p.msg}`);
    }
  }
  return {
    rail: "safety",
    verdict: matches.length > 0 ? "HALT" : "PASS",
    matches,
  };
}

/**
 * Run the schema rail (output) — validates JSON structure.
 */
function runSchemaRail(text, options = {}) {
  const { expectedKeys, minLength } = options;
  const matches = [];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      rail: "schema",
      verdict: "WARN",
      matches: ["[not-json] Output is not valid JSON"],
    };
  }

  if (expectedKeys && typeof parsed !== "object") {
    return {
      rail: "schema",
      verdict: "HALT",
      matches: [`[not-object] Expected JSON object but got ${Array.isArray(parsed) ? "array" : typeof parsed}`],
    };
  }

  if (expectedKeys && typeof parsed === "object" && parsed !== null) {
    for (const key of expectedKeys) {
      if (!(key in parsed)) {
        matches.push(`[missing-key] Expected key "${key}" not found in output`);
      }
    }
  }

  if (minLength !== undefined && text.length < minLength) {
    matches.push(`[too-short] Output is ${text.length} chars (minimum ${minLength})`);
  }

  return {
    rail: "schema",
    verdict: matches.some(m => m.includes("[missing-key]")) ? "HALT" : matches.length > 0 ? "WARN" : "PASS",
    matches,
  };
}

// ─── Pipeline Runner ────────────────────────────────────────────────────────

const INPUT_RAILS = {
  injection: runInjectionRail,
  pii: runPIIRail,
  length: runLengthRail,
};

const OUTPUT_RAILS = {
  quality: runQualityRail,
  safety: runSafetyRail,
  schema: runSchemaRail,
};

/**
 * Run a single rail by name on the given text.
 */
export async function runRail(railName, text, options = {}) {
  const fn = INPUT_RAILS[railName] || OUTPUT_RAILS[railName];
  if (!fn) {
    return { rail: railName, verdict: "WARN", matches: [`[unknown-rail] Rail "${railName}" not recognized`] };
  }
  if (railName === "schema") return fn(text, options);
  return fn(text);
}

/**
 * Run the guardrail pipeline on text.
 */
export async function runGuardrailPipeline(text, opts = {}) {
  const { direction = "input", rails, schemaOptions = {} } = opts;

  const defaultRails = direction === "output"
    ? ["quality", "safety", "schema"]
    : ["injection", "pii", "length"];
  const railsToRun = rails || defaultRails;

  const results = [];
  for (const rail of railsToRun) {
    const result = await runRail(rail, text, rail === "schema" ? schemaOptions : {});
    results.push(result);
    if (result.verdict === "HALT") break;
  }

  return {
    verdict: results.some(r => r.verdict === "HALT") ? "HALT"
      : results.some(r => r.verdict === "WARN") ? "WARN"
      : "PASS",
    rails: results,
    total_rails: railsToRun.length,
    passed: results.filter(r => r.verdict === "PASS").length,
  };
}

export { runInjectionRail, runPIIRail, runLengthRail, runQualityRail, runSafetyRail, runSchemaRail };
