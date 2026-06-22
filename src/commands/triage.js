/**
 * Stack Perfeita MCP — Issue Triage Tool
 * Classifies and labels GitHub issues by priority, type, scope, and status.
 */

import { z } from "zod";
import { rateLimiter } from "../rate-limiter.js";

// ─── Label Taxonomy ──────────────────────────────────────────────────────────

const PRIORITY_LABELS = ["P0-critical", "P1-high", "P2-medium", "P3-low"];
const TYPE_LABELS = ["bug", "feature", "security", "performance", "documentation"];
const SCOPE_LABELS = ["frontend", "backend", "infra", "tooling", "docs"];
const STATUS_LABELS = ["needs-triage", "confirmed", "wontfix", "duplicate"];


// ─── Keyword Patterns ────────────────────────────────────────────────────────

const PRIORITY_PATTERNS = [
  {
    label: "P0-critical",
    patterns: [
      /\b(critical|urgent|emergency|outage|down|production down|data loss|security breach|exploit|zero.?day)\b/i,
      /\b(p0|sev.?0|severity.?0|blocker)\b/i,
      /\b(all (users|services) affected|complete (shutdown|failure))\b/i,
    ],
  },
  {
    label: "P1-high",
    patterns: [
      /\b(high priority|important|significant|major|breaking)\b/i,
      /\b(p1|sev.?1|severity.?1)\b/i,
      /\b(workaround (not available|unknown|complex))\b/i,
      /\b(degraded|partially down|service (impact|disruption))\b/i,
    ],
  },
  {
    label: "P2-medium",
    patterns: [
      /\b(medium priority|moderate|intermittent|annoying)\b/i,
      /\b(p2|sev.?2|severity.?2)\b/i,
      /\b(workaround (available|exists|simple))\b/i,
    ],
  },
  {
    label: "P3-low",
    patterns: [
      /\b(low priority|minor|cosmetic|nice.?to.?have|wishlist|enhancement|trivial)\b/i,
      /\b(p3|sev.?3|severity.?3)\b/i,
      /\b(typo|formatting|whitespace|color|style)\b/i,
    ],
  },
];

const TYPE_PATTERNS = [
  {
    label: "bug",
    patterns: [
      /\b(bug|error|crash|exception|fail|broken|doesn'?t work|not working|regression|wrong|incorrect|unexpected)\b/i,
      /\b(steps? to reproduce|repro|reproduce|expected behavior|actual behavior)\b/i,
      /\b(stack trace|traceback|error log)\b/i,
    ],
  },
  {
    label: "feature",
    patterns: [
      /\b(feature|request|enhancement|add support|would be (nice|great|useful)|proposal|rfc)\b/i,
      /\b(can you (add|implement|support|include))\b/i,
      /\b(it'?d be (nice|great) if|wish (there was|i could|list))\b/i,
    ],
  },
  {
    label: "security",
    patterns: [
      /\b(security|vulnerability|cve|exploit|xss|sqli|injection|auth|token leak|credential|secret exposed)\b/i,
      /\b(owasp|penetration|pentest|audit finding|security review)\b/i,
    ],
  },
  {
    label: "performance",
    patterns: [
      /\b(performance|slow|latency|memory (leak|usage)|cpu|bottleneck|optimization|timeout|timeout)\b/i,
      /\b(load time|response time|tTFB|ttfb|throughput|degraded perf)\b/i,
    ],
  },
  {
    label: "documentation",
    patterns: [
      /\b(documentation|docs|readme|typo in docs|outdated (docs|documentation)|missing docs|api docs)\b/i,
      /\b(example|tutorial|how.?to|guide|instructions|comment)\b/i,
    ],
  },
];

const SCOPE_PATTERNS = [
  {
    label: "frontend",
    patterns: [
      /\b(frontend|front.?end|ui|ux|css|html|dom|browser|render|layout|responsive|mobile|viewport)\b/i,
      /\b(react|vue|angular|svelte|tailwind|styled.?component|component|button|form|modal|dialog)\b/i,
    ],
  },
  {
    label: "backend",
    patterns: [
      /\b(backend|back.?end|api|server|endpoint|route|handler|database|db|query|migration|orm)\b/i,
      /\b(auth|authentication|authorization|middleware|controller|service layer)\b/i,
    ],
  },
  {
    label: "infra",
    patterns: [
      /\b(infra|infrastructure|deploy|ci\/?cd|docker|kubernetes|k8s|aws|gcp|azure|terraform|nginx|load.?balanc)\b/i,
      /\b(server|hosting|dns|ssl|tls|certificate|monitoring|alerting|logging|observability)\b/i,
    ],
  },
  {
    label: "tooling",
    patterns: [
      /\b(tooling|tool|cli|linter|formatter|eslint|prettier|jest|vitest|mocha|build|bundler|webpack|vite)\b/i,
      /\b(dev.?tool|devex|developer.?experience|workflow|ide|editor)\b/i,
    ],
  },
  {
    label: "docs",
    patterns: [
      /\b(readme|changelog|documentation|doc site|jsdoc|typedoc|swagger|openapi)\b/i,
    ],
  },
];

// ─── Classification Engine ───────────────────────────────────────────────────

/**
 * Count how many pattern groups match the text and return matches with details.
 * @param {string} text - Combined title + body text
 * @param {Array<{label: string, patterns: RegExp[]}>} taxonomy
 * @returns {Array<{label: string, matchCount: number, matchedPatterns: string[]}>}
 */
function classifyMatches(text, taxonomy) {
  const results = [];
  for (const { label, patterns } of taxonomy) {
    const matchedPatterns = [];
    for (const pat of patterns) {
      if (pat.test(text)) matchedPatterns.push(pat.source);
    }
    if (matchedPatterns.length > 0) {
      results.push({ label, matchCount: matchedPatterns.length, matchedPatterns });
    }
  }
  // Sort by match count descending — strongest signal first
  results.sort((a, b) => b.matchCount - a.matchCount);
  return results;
}

/**
 * Calculate confidence score for a match based on pattern count and text length.
 * @param {number} matchCount - Number of patterns that matched
 * @param {number} totalPatterns - Total patterns available for this label
 * @param {number} textLength - Length of text being classified
 * @returns {number} Confidence between 0 and 1
 */
function computeConfidence(matchCount, totalPatterns, textLength) {
  const patternStrength = Math.min(matchCount / totalPatterns, 1);
  const textRichness = Math.min(textLength / 200, 1); // Longer text = more signal
  // Weight: 70% pattern strength, 30% text richness
  const raw = 0.7 * patternStrength + 0.3 * textRichness;
  return Math.round(Math.max(0.3, Math.min(raw, 0.99)) * 100) / 100;
}

/**
 * Determine priority from urgency/impact signals in text.
 * Falls back to P2-medium when no strong signal found.
 */
function classifyPriority(text, typeMatches) {
  const matches = classifyMatches(text, PRIORITY_PATTERNS);
  if (matches.length > 0) {
    const best = matches[0];
    const totalPatterns = PRIORITY_PATTERNS.find(p => p.label === best.label).patterns.length;
    return {
      label: best.label,
      confidence: computeConfidence(best.matchCount, totalPatterns, text.length),
      reason: `Matched ${best.matchCount} priority signal(s) in text`,
    };
  }

  // Fallback: infer from type signals
  const topType = typeMatches[0]?.label;
  if (topType === "security") return { label: "P1-high", confidence: 0.6, reason: "Security issues default to high priority" };
  if (topType === "bug") return { label: "P2-medium", confidence: 0.5, reason: "Unspecified bug defaults to medium priority" };
  if (topType === "performance") return { label: "P2-medium", confidence: 0.5, reason: "Performance issues default to medium priority" };

  return { label: "P2-medium", confidence: 0.3, reason: "No priority signals detected; defaulting to medium" };
}

/**
 * Determine issue type from content patterns.
 */
function classifyType(text) {
  const matches = classifyMatches(text, TYPE_PATTERNS);
  if (matches.length === 0) {
    return { label: "bug", confidence: 0.3, reason: "No type signals detected; defaulting to bug" };
  }
  const best = matches[0];
  const totalPatterns = TYPE_PATTERNS.find(p => p.label === best.label).patterns.length;
  return {
    label: best.label,
    confidence: computeConfidence(best.matchCount, totalPatterns, text.length),
    reason: `Matched ${best.matchCount} type signal(s) in text`,
  };
}

/**
 * Determine scope from content patterns.
 * Returns all matching scopes.
 */
function classifyScope(text) {
  const matches = classifyMatches(text, SCOPE_PATTERNS);
  if (matches.length === 0) {
    return [{ label: "backend", confidence: 0.2, reason: "No scope signals detected; defaulting to backend" }];
  }
  return matches.map(m => {
    const totalPatterns = SCOPE_PATTERNS.find(p => p.label === m.label).patterns.length;
    return {
      label: m.label,
      confidence: computeConfidence(m.matchCount, totalPatterns, text.length),
      reason: `Matched ${m.matchCount} scope signal(s) in text`,
    };
  });
}

// ─── Main Triage Logic ───────────────────────────────────────────────────────

/**
 * Triage an issue and return structured label suggestions.
 * @param {string} title - Issue title
 * @param {string} [body=""] - Issue body/description
 * @param {string[]} [existingLabels=[]] - Labels already applied
 * @returns {object} Triage result with suggested labels, missing labels, and notes
 */
export function triageIssue(title, body = "", existingLabels = []) {
  const text = `${title} ${body}`.trim();
  const normalizedExisting = existingLabels.map(l => l.toLowerCase().trim());

  // Empty title is a hard error
  if (!title || !title.trim()) {
    return {
      verdict: "WARN",
      suggested_labels: [],
      existing_labels: normalizedExisting,
      missing_labels: [],
      triage_notes: "Cannot triage: issue title is empty. Provide a descriptive title to enable classification.",
    };
  }

  const typeResult = classifyType(text);
  const priorityResult = classifyPriority(text, [typeResult]);
  const scopeResults = classifyScope(text);

  // Build suggested labels list
  const suggested = [];

  // Priority
  suggested.push({
    label: priorityResult.label,
    confidence: priorityResult.confidence,
    reason: priorityResult.reason,
  });

  // Type
  suggested.push({
    label: typeResult.label,
    confidence: typeResult.confidence,
    reason: typeResult.reason,
  });

  // Scope (top match only for primary, others as additional)
  if (scopeResults.length > 0) {
    suggested.push({
      label: scopeResults[0].label,
      confidence: scopeResults[0].confidence,
      reason: scopeResults[0].reason,
    });
  }

  // Status: always suggest needs-triage if not already present
  if (!normalizedExisting.includes("needs-triage") && !normalizedExisting.includes("confirmed")) {
    suggested.push({
      label: "needs-triage",
      confidence: 0.9,
      reason: "Issue has not been triaged yet",
    });
  }

  // Find missing labels (suggested but not already applied)
  const missing = suggested
    .filter(s => !normalizedExisting.includes(s.label.toLowerCase()))
    .map(s => s.label);

  // Determine verdict
  const highConfidenceCount = suggested.filter(s => s.confidence >= 0.7).length;
  let verdict;
  if (highConfidenceCount >= 2) {
    verdict = "PASS";
  } else if (highConfidenceCount >= 1) {
    verdict = "WARN";
  } else {
    verdict = "WARN";
  }

  // Build triage notes
  const notes = [];
  if (body && body.trim().length > 0) {
    notes.push("Issue has body text — classification based on title + body.");
  } else {
    notes.push("No body text — classification based on title only. Adding details would improve accuracy.");
  }
  if (typeResult.confidence < 0.4) {
    notes.push("Low confidence type classification. Consider adding clearer type indicators.");
  }
  if (priorityResult.confidence < 0.4) {
    notes.push("Low confidence priority classification. Consider adding severity/urgency indicators.");
  }
  if (missing.length > 0) {
    notes.push(`Suggested labels to add: ${missing.join(", ")}.`);
  }

  return {
    verdict,
    suggested_labels: suggested,
    existing_labels: normalizedExisting,
    missing_labels: missing,
    triage_notes: notes.join(" "),
  };
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerTriageTools(server) {
  server.tool(
    "triage_issue",
    "Classifies and suggests labels for GitHub issues based on title, body, and existing labels. Returns priority (P0-P3), type, scope, and status labels with confidence scores.",
    {
      title: z.string().describe("Issue title"),
      body: z.string().optional().describe("Issue body or description"),
      labels: z.array(z.string()).optional().describe("Labels already applied to the issue"),
    },
    async ({ title, body, labels }) => {
      const rateLimitHit = rateLimiter.check("triage_issue");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const result = triageIssue(title, body || "", labels || []);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
