/**
 * @module prompt-standards
 * RFC 2119 prompt conventions and density rules.
 * Based on the OMP System Prompts pattern:
 * Dense, imperative, RFC-keyed. Tags carry semantics.
 */

// ─── RFC 2119 Keywords ───────────────────────────────────────────────────────

/** RFC 2119 keyword definitions with aliases. */
const RFC_KEYWORDS = {
  MUST: { meaning: "Absolute requirement", aliases: ["REQUIRED", "shall", "shall not negated"] },
  NEVER: { meaning: "Absolute prohibition", alias_of: "MUST NOT" },
  SHOULD: { meaning: "Strong preference; deviation allowed with known tradeoffs", aliases: ["RECOMMENDED"] },
  AVOID: { meaning: "Strong discouragement", alias_of: "SHOULD NOT" },
  MAY: { meaning: "Truly optional", aliases: ["OPTIONAL"] },
};

/** Non-compliant patterns that should be replaced with RFC keywords. */
const NON_COMPLIANT_PATTERNS = [
  { regex: /\byou should\b/gi, suggestion: "SHOULD", reason: "lowercase 'should'" },
  { regex: /\byou must\b/gi, suggestion: "MUST", reason: "lowercase 'must'" },
  { regex: /\byou never\b/gi, suggestion: "NEVER", reason: "lowercase 'never'" },
  { regex: /\bdo not\b/gi, suggestion: "NEVER", reason: "'do not' → NEVER" },
  { regex: /\bdon'?t\b/gi, suggestion: "NEVER", reason: "'don't' → NEVER" },
  { regex: /\btry not to\b/gi, suggestion: "AVOID", reason: "'try not to' → AVOID" },
  { regex: /\bprefer\b/gi, suggestion: "SHOULD", reason: "'prefer' → SHOULD" },
  { regex: /\bit'?s best to\b/gi, suggestion: "SHOULD", reason: "'it's best to' → SHOULD" },
  { regex: /\bmake sure\b/gi, suggestion: "MUST", reason: "'make sure' → MUST" },
  { regex: /\bensure\b/gi, suggestion: "MUST", reason: "'ensure' → MUST" },
  { regex: /\balways\b/gi, suggestion: "MUST", reason: "'always' → MUST" },
  { regex: /\bnever\b(?![\s]*[A-Z])/gi, suggestion: "NEVER", reason: "lowercase 'never'" },
  { regex: /\bcan\b/gi, suggestion: "MAY", reason: "'can' → MAY (when optional)" },
  { regex: /\byou could\b/gi, suggestion: "MAY", reason: "'you could' → MAY" },
];

// ─── Tag Definitions ─────────────────────────────────────────────────────────

/** Valid structural tags with their purposes. */

/** Ornamental tags that MUST NOT be used. */
const ORNAMENTAL_TAGS = [
  "<north-star>", "<stance>", "<protocol>", "<directives>",
  "<strengths>", "<values>", "<mission>", "<vision>",
  "<philosophy>", "<principles>", "<guidelines>",
];

// ─── Density Rules ───────────────────────────────────────────────────────────

/** Maximum words per tactical bullet. */
const DENSITY_MAX_WORDS = 12;

/** Minimum meaningful content per bullet. */

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Validate RFC 2119 compliance in a prompt.
 * @param {string} text - The prompt text to validate
 * @returns {{ valid: boolean, issues: Array, score: number }}
 */
export function validatePromptStandards(text) {
  if (!text || typeof text !== "string") {
    return { valid: true, issues: [], score: 100 };
  }

  const issues = [];

  // Check for non-compliant keywords
  for (const pattern of NON_COMPLIANT_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.regex, "gi"));
    for (const match of matches) {
      issues.push({
        type: "keyword",
        severity: "warning",
        line: text.substring(0, match.index).split("\n").length,
        message: `${pattern.reason} — use ${pattern.suggestion} instead`,
        original: match[0],
        suggestion: pattern.suggestion,
      });
    }
  }

  // Check for ornamental tags
  for (const tag of ORNAMENTAL_TAGS) {
    if (text.toLowerCase().includes(tag.toLowerCase())) {
      issues.push({
        type: "tag",
        severity: "warning",
        message: `Ornamental tag ${tag} detected — tags carry semantics; ornament dilutes them`,
        original: tag,
      });
    }
  }

  // Check for lowercase RFC keywords that should be uppercase
  const lowercaseKeywords = text.match(/\b(should|must|never|avoid|may|required|recommended|optional)\b/gi);
  if (lowercaseKeywords) {
    for (const kw of lowercaseKeywords) {
      if (kw === kw.toLowerCase() && RFC_KEYWORDS[kw.toUpperCase()]) {
        issues.push({
          type: "case",
          severity: "info",
          message: `RFC keyword '${kw}' should be uppercase: ${kw.toUpperCase()}`,
          original: kw,
          suggestion: kw.toUpperCase(),
        });
      }
    }
  }

  // Calculate score (100 = perfect, deductions for issues)
  const deductions = issues.filter((i) => i.severity === "warning").length * 5 +
    issues.filter((i) => i.severity === "info").length * 1;
  const score = Math.max(0, 100 - deductions);

  return {
    valid: issues.filter((i) => i.severity === "warning").length === 0,
    issues,
    score,
  };
}

/**
 * Enforce density rules on text — shorten bullets to max words.
 * @param {string} text
 * @param {number} [maxWords=DENSITY_MAX_WORDS]
 * @returns {{ text: string, trimmed: number }}
 */
export function enforceDensity(text, maxWords = DENSITY_MAX_WORDS) {
  if (!text) return { text: "", trimmed: 0 };

  const lines = text.split("\n");
  let trimmed = 0;

  const result = lines.map((line) => {
    const trimmed_line = line.trim();
    // Only process bullet points (lines starting with - or *)
    if (/^\s*[-*]\s/.test(trimmed_line)) {
      const words = trimmed_line.replace(/^\s*[-*]\s*/, "").split(/\s+/);
      if (words.length > maxWords) {
        trimmed++;
        // Keep first maxWords words
        return trimmed_line.replace(/^\s*[-*]\s*/, "- ") + words.slice(0, maxWords).join(" ") + "…";
      }
    }
    return line;
  });

  return { text: result.join("\n"), trimmed };
}

/**
 * Extract prescriptive directives from text.
 * @param {string} text
 * @returns {Array<{ keyword: string, context: string, line: number }>}
 */
export function extractDirectives(text) {
  if (!text) return [];

  const directives = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match RFC keywords in uppercase
    const matches = line.matchAll(/\b(MUST|NEVER|SHOULD|AVOID|MAY|REQUIRED|RECOMMENDED|OPTIONAL)\b/g);
    for (const match of matches) {
      directives.push({
        keyword: match[1],
        context: line.trim().substring(0, 100),
        line: i + 1,
      });
    }
  }

  return directives;
}

/**
 * Check if critical rules appear at START and END of prompt.
 * @param {string} text
 * @returns {{ balanced: boolean, startDirectives: number, endDirectives: number }}
 */
export function checkCriticalPlacement(text) {
  if (!text) return { balanced: true, startDirectives: 0, endDirectives: 0 };

  const lines = text.split("\n").filter((l) => l.trim());
  const totalLines = lines.length;

  // First 20% and last 20% of prompt
  const startEnd = Math.max(1, Math.floor(totalLines * 0.2));
  const startLines = lines.slice(0, startEnd).join("\n");
  const endLines = lines.slice(-startEnd).join("\n");

  const startDirectives = (startLines.match(/\b(MUST|NEVER|SHOULD|AVOID)\b/g) || []).length;
  const endDirectives = (endLines.match(/\b(MUST|NEVER|SHOULD|AVOID)\b/g) || []).length;

  return {
    balanced: startDirectives > 0 && endDirectives > 0,
    startDirectives,
    endDirectives,
    recommendation: startDirectives === 0
      ? "Add critical constraints at START"
      : endDirectives === 0
        ? "Add critical constraints at END"
        : "Good — critical rules at both edges",
  };
}

/**
 * Analyze a prompt for common anti-patterns.
 * @param {string} text
 * @returns {{ issues: Array, suggestions: Array }}
 */
export function analyzeAntiPatterns(text) {
  if (!text) return { issues: [], suggestions: [] };

  const issues = [];
  const suggestions = [];

  // Politeness padding
  if (/\b(?:would you|could you|please|kindly|be so kind)\b/i.test(text)) {
    issues.push("Politeness padding detected — adds perplexity, reduces accuracy");
    suggestions.push("Remove polite phrases; use direct imperative voice");
  }

  // Hedging
  if (/\b(?:might want to|consider|perhaps|it seems like|maybe)\b/i.test(text)) {
    issues.push("Hedging detected — reduces actionability");
    suggestions.push("Replace with direct statements: 'MUST', 'SHOULD', 'NEVER'");
  }

  // Closing summaries
  if (/\b(?:in conclusion|to summarize|in summary|to wrap up)\b/i.test(text)) {
    issues.push("Closing summary detected — wastes tokens");
    suggestions.push("Remove; put critical rules at END instead");
  }

  // Time estimates
  if (/\b(?:will take|approximately|estimated|roughly)\s+\d+\s+(?:minutes?|hours?|days?)\b/i.test(text)) {
    issues.push("Time estimate detected — almost always wrong");
    suggestions.push("Remove time estimates; focus on concrete steps");
  }

  // Self-critique
  if (/\b(?:review your work|check your output|validate your response)\b/i.test(text)) {
    issues.push("Self-critique instruction detected — detection is the bottleneck, not correction");
    suggestions.push("Use external validation: tests, lint, typecheck");
  }

  return { issues, suggestions };
}

/**
 * Full prompt analysis — combines all checks.
 * @param {string} text
 * @returns {object}
 */
export function analyzePrompt(text) {
  const standards = validatePromptStandards(text);
  const placement = checkCriticalPlacement(text);
  const antiPatterns = analyzeAntiPatterns(text);
  const directives = extractDirectives(text);

  return {
    score: standards.score,
    rfcCompliance: standards,
    criticalPlacement: placement,
    antiPatterns,
    directives,
    totalIssues: standards.issues.length + antiPatterns.issues.length,
    recommendation: standards.score >= 80 && placement.balanced
      ? "Prompt meets standards"
      : "Prompt needs improvement — see issues",
  };
}
