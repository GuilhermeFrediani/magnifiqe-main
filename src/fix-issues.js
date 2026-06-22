/**
 * Fix Issues Command
 * Diagnoses GitHub issues and proposes fixes through pattern-based analysis.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Issue type classification ──────────────────────────────────────────────

const ISSUE_TYPE_PATTERNS = {
  security: [
    /vulnerability/i, /injection/i, /xss/i, /csrf/i, /sql.?inject/i,
    /auth.*bypass/i, /privilege.*escalat/i, /exposed?.*key/i, /leak/i,
    /unauthorized/i, /secret/i, /credential/i, /cve-/i, /exploit/i,
    /sanitiz/i, /unsafe/i, /malicious/i,
  ],
  bug: [
    /error/i, /crash/i, /fail/i, /broken/i, /regression/i, /exception/i,
    /null.?pointer/i, /undefined/i, /type.?error/i, /not.?work/i,
    /unexpected/i, /incorrect/i, /wrong/i, /defect/i, /fault/i,
    /dead.?lock/i, /infinite.?loop/i, /memory.?leak/i, /overflow/i,
  ],
  performance: [
    /slow/i, /latency/i, /timeout/i, /oom/i, /out.?of.?memory/i,
    /bottleneck/i, /optimize/i, /cache/i, /throttl/i, /debounce/i,
    /n\+1/i, /load.?time/i, /response.?time/i, /throughput/i,
    /cpu.?spike/i, /disk.?usage/i, /network/i, /efficient/i,
  ],
  feature: [
    /feature.?request/i, /enhancement/i, /add.?support/i, /new.?feature/i,
    /implement/i, /proposed/i, /suggestion/i, /proposal/i, /would.?be.?nice/i,
    /wish.?list/i, /improve/i, /extend/i, /capability/i,
  ],
};

const TYPE_PRIORITY = ["security", "bug", "performance", "feature"];

/**
 * Classify an issue into one of: bug, feature, security, performance.
 * Returns { type, confidence, signals }.
 */
export function classifyIssueType(text) {
  if (!text || typeof text !== "string") {
    return { type: "bug", confidence: 0, signals: [] };
  }

  const scores = {};
  const matched = {};
  for (const type of TYPE_PRIORITY) {
    scores[type] = 0;
    matched[type] = [];
  }

  for (const type of TYPE_PRIORITY) {
    for (const pattern of ISSUE_TYPE_PATTERNS[type]) {
      if (pattern.test(text)) {
        scores[type] += 1;
        matched[type].push(pattern.source.replace(/[\\/]/g, "").replace(/\?/g, ""));
      }
    }
  }

  let bestType = "bug";
  let bestScore = 0;
  for (const type of TYPE_PRIORITY) {
    if (scores[type] > bestScore) {
      bestScore = scores[type];
      bestType = type;
    }
  }

  const totalSignals = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalSignals === 0
    ? 0
    : Math.min(100, Math.round((bestScore / totalSignals) * 100));

  return { type: bestType, confidence, signals: matched[bestType] };
}

// ─── Root cause analysis ────────────────────────────────────────────────────

const ROOT_CAUSE_PATTERNS = [
  { pattern: /race.?condition|concurrent|thread|async.*issue/i, cause: "Race condition or concurrency issue in async execution path" },
  { pattern: /input.?valid|missing.?check|missing.?valid/i, cause: "Missing or insufficient input validation" },
  { pattern: /null|undefined|missing.?field|empty/i, cause: "Null/undefined value not handled — missing null guard" },
  { pattern: /config|env|setting/i, cause: "Configuration or environment variable misconfiguration" },
  { pattern: /depend|package|npm|import|require/i, cause: "Dependency resolution failure or version incompatibility" },
  { pattern: /permission|access|denied|auth/i, cause: "Permission or access control failure" },
  { pattern: /network|connect|timeout|dns/i, cause: "Network connectivity or timeout issue" },
  { pattern: /syntax|parse|format|json/i, cause: "Syntax or data format parsing error" },
  { pattern: /overflow|buffer|memory|heap/i, cause: "Resource exhaustion — buffer, memory, or heap overflow" },
  { pattern: /version|compat|deprecat/i, cause: "Version compatibility or deprecation conflict" },
];

export function analyzeRootCause(text) {
  if (!text || typeof text !== "string") {
    return { cause: "Unable to determine root cause — no issue text provided", patterns: [] };
  }

  const matches = [];
  for (const { pattern, cause } of ROOT_CAUSE_PATTERNS) {
    if (pattern.test(text)) {
      matches.push({ cause, pattern: pattern.source.replace(/[\\/]/g, "").replace(/\?/g, "") });
    }
  }

  if (matches.length === 0) {
    return { cause: "No clear root cause detected — manual investigation required", patterns: [] };
  }

  return { cause: matches[0].cause, patterns: matches.map((m) => m.cause) };
}

// ─── Affected files detection ───────────────────────────────────────────────

const FILE_REFERENCE_PATTERN = /(?:src|lib|test|spec|bin|scripts|config)\/[\w\-./]+\.(?:js|ts|mjs|cjs|json|yml|yaml|md)/g;

export function detectAffectedFiles(text) {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(FILE_REFERENCE_PATTERN);
  return [...new Set(matches || [])];
}

// ─── Fix proposal generation ────────────────────────────────────────────────

const FIX_TEMPLATES = {
  security: [
    "Sanitize and validate all user inputs before processing",
    "Use parameterized queries to prevent injection attacks",
    "Implement proper authentication and authorization checks",
    "Rotate exposed credentials and revoke compromised tokens",
    "Apply output encoding to prevent XSS",
  ],
  bug: [
    "Add null/undefined guard before accessing the property",
    "Fix off-by-one error in boundary condition check",
    "Ensure error is caught and handled gracefully",
    "Verify type compatibility at the function boundary",
    "Check for and handle edge case with empty input",
  ],
  performance: [
    "Add caching layer for repeated expensive computations",
    "Use pagination or streaming for large data sets",
    "Replace synchronous I/O with async alternatives",
    "Optimize query to reduce N+1 database calls",
    "Implement connection pooling for resource reuse",
  ],
  feature: [
    "Design API surface and implement core logic",
    "Add input validation and error handling",
    "Write unit and integration tests",
    "Update documentation and type definitions",
    "Add configuration options with sensible defaults",
  ],
};

export function generateFixProposal(type, rootCause, text) {
  const templates = FIX_TEMPLATES[type] || FIX_TEMPLATES.bug;
  const suggestions = [];

  // Pick primary suggestion based on root cause match
  if (rootCause) {
    for (const tpl of templates) {
      const keywords = tpl.toLowerCase().split(/\s+/).slice(0, 3);
      if (keywords.some((kw) => rootCause.toLowerCase().includes(kw))) {
        suggestions.push(tpl);
        break;
      }
    }
  }

  // Add first template as fallback if no match
  if (suggestions.length === 0) {
    suggestions.push(templates[0]);
  }

  // Add context-specific advice from issue text
  if (text) {
    if (/test|spec|assert/i.test(text)) {
      suggestions.push("Add regression test to prevent recurrence");
    }
    if (/error|exception|throw/i.test(text)) {
      suggestions.push("Add proper error boundary and logging");
    }
    if (/depend|upgrade|version/i.test(text)) {
      suggestions.push("Pin dependency versions and update lockfile");
    }
  }

  return suggestions.join("; ");
}

// ─── Next steps generation ──────────────────────────────────────────────────

export function generateNextSteps(type, confidence) {
  const steps = [];

  if (confidence < 50) {
    steps.push("Gather more details about the issue — reproduce steps, expected vs actual behavior");
  }

  steps.push("Review affected files for the identified root cause");
  steps.push("Implement proposed fix in a feature branch");

  if (type === "security") {
    steps.push("Run security audit after applying fix");
    steps.push("Verify no similar vulnerabilities exist elsewhere");
  } else if (type === "bug") {
    steps.push("Write regression test before applying fix");
    steps.push("Run full test suite to verify no regressions");
  } else if (type === "performance") {
    steps.push("Benchmark before and after the fix");
    steps.push("Profile memory and CPU usage around affected code");
  } else {
    steps.push("Write unit tests for new functionality");
    steps.push("Update documentation if API surface changes");
  }

  return steps;
}

// ─── Issue parsing ──────────────────────────────────────────────────────────

const GITHUB_URL_PATTERN = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;

export function parseIssueInput(input) {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Issue must be a non-empty string" };
  }

  const trimmed = input.trim();

  // Check for GitHub URL
  const urlMatch = trimmed.match(GITHUB_URL_PATTERN);
  if (urlMatch) {
    return {
      valid: true,
      number: parseInt(urlMatch[3], 10),
      owner: urlMatch[1],
      repo: urlMatch[2],
      source: "url",
    };
  }

  // Check for plain issue number
  const numMatch = trimmed.match(/^#?(\d+)$/);
  if (numMatch) {
    return {
      valid: true,
      number: parseInt(numMatch[1], 10),
      owner: null,
      repo: null,
      source: "number",
    };
  }

  return {
    valid: false,
    error: `Invalid issue format: "${trimmed}". Provide a GitHub issue URL or a number (e.g. "42" or "#42").`,
  };
}

// ─── Verdict determination ──────────────────────────────────────────────────

export function determineVerdict(type, confidence) {
  if (type === "security" && confidence >= 60) return "HALT";
  if (type === "security") return "WARN";
  if (type === "bug" && confidence >= 70) return "WARN";
  if (type === "performance" && confidence >= 50) return "WARN";
  return "PASS";
}

// ─── Main analysis pipeline ─────────────────────────────────────────────────

export function analyzeIssue(issueText, issueInput) {
  const parsed = parseIssueInput(issueInput);

  if (!parsed.valid) {
    return {
      verdict: "HALT",
      issue_type: "unknown",
      root_cause: parsed.error,
      affected_files: [],
      proposed_fix: "Cannot analyze — invalid issue input",
      confidence: 0,
      next_steps: ["Provide a valid issue number or GitHub URL"],
    };
  }

  const classification = classifyIssueType(issueText);
  const rootCause = analyzeRootCause(issueText);
  const affectedFiles = detectAffectedFiles(issueText);
  const proposedFix = generateFixProposal(classification.type, rootCause.cause, issueText);
  const nextSteps = generateNextSteps(classification.type, classification.confidence);
  const verdict = determineVerdict(classification.type, classification.confidence);

  return {
    verdict,
    issue_type: classification.type,
    root_cause: rootCause.cause,
    affected_files: affectedFiles,
    proposed_fix: proposedFix,
    confidence: classification.confidence,
    next_steps: nextSteps,
  };
}

// ─── Tool registration ──────────────────────────────────────────────────────

export function registerFixIssueTools(server) {
  server.tool(
    "fix_issue",
    "Diagnoses and proposes fixes for GitHub issues. Parses issue number or URL, classifies type, identifies root cause, and suggests fix.",
    {
      issue: z.string().describe("Issue number or URL"),
      repo: z.string().optional().describe("Repository in owner/repo format"),
    },
    async ({ issue, repo }) => {
      const rateLimitHit = rateLimiter.check("fix_issue");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const parsed = parseIssueInput(issue);

        if (!parsed.valid) {
          return {
            content: [{ type: "text", text: `HALT — ${parsed.error}` }],
          };
        }

        // Use provided repo or derive from URL
        const repoStr = repo || (parsed.owner && parsed.repo ? `${parsed.owner}/${parsed.repo}` : null);

        // In a full implementation, we would fetch the issue from GitHub API here.
        // For now, analyze the issue text provided or fall back to metadata.
        const issueText = issue;
        const result = analyzeIssue(issueText, issue);

        const sections = [
          `FIX ISSUE: ${result.verdict}`,
          `- Issue: #${parsed.number}${repoStr ? ` (${repoStr})` : ""}`,
          `- Type: ${result.issue_type}`,
          `- Confidence: ${result.confidence}%`,
          `- Root cause: ${result.root_cause}`,
        ];

        if (result.affected_files.length > 0) {
          sections.push(`- Affected files: ${result.affected_files.join(", ")}`);
        }

        sections.push(`- Proposed fix: ${result.proposed_fix}`);

        if (result.next_steps.length > 0) {
          sections.push("", "Next steps:");
          result.next_steps.forEach((step, i) => {
            sections.push(`  ${i + 1}. ${step}`);
          });
        }

        if (result.verdict === "HALT") {
          sections.push("", "Action required before proceeding.");
        }

        return {
          content: [{ type: "text", text: sections.join("\n") }],
          fixReport: result,
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in fix_issue: ${e.message}` }] };
      }
    }
  );
}
