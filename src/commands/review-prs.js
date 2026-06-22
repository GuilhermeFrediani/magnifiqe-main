/**
 * Stack Perfeita MCP — Review PRs Command
 * Structured PR review with classification, checklist, and security scanning.
 */

import { z } from "zod";
import { scanCode } from "../sast-rules.js";
import { rateLimiter } from "../rate-limiter.js";

// ─── Classification rules ────────────────────────────────────────────────────
// Priority order: blocker (unconditional) → superseded → slop (catch-all).

const CLASSIFICATION_RULES = [
  // ─── Blockers (highest priority) ───────────────────────────────────────
  {
    id: "ci-failing",
    name: "Blocker — CI failing",
    classification: "blocker",
    test: (pr) =>
      pr.ci_status === "failure" || pr.ci_status === "error",
  },
  {
    id: "merge-conflicts",
    name: "Blocker — merge conflicts",
    classification: "blocker",
    test: (pr) => pr.has_merge_conflicts === true,
  },
  {
    id: "security-findings",
    name: "Blocker — security issues",
    classification: "blocker",
    test: (pr) =>
      Array.isArray(pr.sast_findings) &&
      pr.sast_findings.some((f) => f.severity === "critical" || f.severity === "high"),
  },
  // ─── Superseded ────────────────────────────────────────────────────────
  {
    id: "stale-no-activity",
    name: "Superseded — no activity",
    classification: "superseded",
    test: (pr) => {
      if (!pr.updated_at) return false;
      const staleDays = 60;
      const updated = new Date(pr.updated_at);
      const now = new Date();
      const daysSince = (now - updated) / (1000 * 60 * 60 * 24);
      return daysSince > staleDays && (pr.state || "open") === "open";
    },
  },
  {
    id: "duplicate-title",
    name: "Superseded — duplicate",
    classification: "superseded",
    test: (pr) => /\bduplicate\b|\bsupersedes?\b|\breplaced by\b/i.test(pr.title),
  },
  // ─── Slop (lowest priority — catch-all) ────────────────────────────────
  {
    id: "bot-generated",
    name: "Bot-generated slop",
    classification: "slop",
    test: (pr) =>
      /\bbot\b|\bautomated\b|\bdependabot\b|\brenovate\b|\bgenerated\b/i.test(
        pr.title + " " + (pr.body || "")
      ) && (pr.additions || 0) + (pr.deletions || 0) > 500,
  },
  {
    id: "empty-pr",
    name: "Empty or trivial PR",
    classification: "slop",
    test: (pr) => {
      const total = (pr.additions || 0) + (pr.deletions || 0);
      const hasTitle = Boolean(pr.title && pr.title.trim());
      const hasBody = Boolean(pr.body && pr.body.trim());
      return total === 0 && !hasTitle && !hasBody;
    },
  },
];

// ─── Checklist definitions ───────────────────────────────────────────────────

const CHECKLIST = [
  {
    id: "ci_status",
    label: "CI Status",
    check: (pr) => {
      if (!pr.ci_status) return { status: "warn", message: "No CI status reported" };
      if (pr.ci_status === "success") return { status: "pass", message: "CI passing" };
      if (pr.ci_status === "pending" || pr.ci_status === "running")
        return { status: "warn", message: "CI still running" };
      return { status: "fail", message: `CI status: ${pr.ci_status}` };
    },
  },
  {
    id: "merge_conflicts",
    label: "Merge Conflicts",
    check: (pr) => {
      if (pr.has_merge_conflicts === true)
        return { status: "fail", message: "Merge conflicts detected" };
      if (pr.has_merge_conflicts === false)
        return { status: "pass", message: "No merge conflicts" };
      return { status: "warn", message: "Merge conflict status unknown" };
    },
  },
  {
    id: "security_scan",
    label: "Security Pattern Scan",
    check: (pr) => {
      if (!pr.diff_content) {
        return { status: "warn", message: "No diff content provided for security scan" };
      }
      const result = scanCode(pr.diff_content);
      const criticalOrHigh = result.findings.filter(
        (f) => f.severity === "critical" || f.severity === "high"
      );
      if (criticalOrHigh.length > 0) {
        return {
          status: "fail",
          message: `Security scan found ${criticalOrHigh.length} critical/high issue(s)`,
          findings: criticalOrHigh,
        };
      }
      return {
        status: "pass",
        message: `Security scan clean (${result.summary.total} minor finding(s) if any)`,
      };
    },
  },
  {
    id: "code_quality",
    label: "Code Quality",
    check: (pr) => {
      const size = (pr.additions || 0) + (pr.deletions || 0);
      if (size === 0) return { status: "warn", message: "No changes detected" };
      if (size > 1000) return { status: "warn", message: `Large PR: ${size} lines changed` };
      return { status: "pass", message: `Reasonable size: ${size} lines changed` };
    },
  },
  {
    id: "test_coverage",
    label: "Test Coverage",
    check: (pr) => {
      if (pr.has_tests === true)
        return { status: "pass", message: "Tests included" };
      if (pr.has_tests === false)
        return { status: "fail", message: "No tests included" };
      return { status: "warn", message: "Test coverage unknown" };
    },
  },
];

// ─── PR URL parsing ──────────────────────────────────────────────────────────

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)/;

function parsePrUrl(url) {
  const m = url.match(GITHUB_URL_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: parseInt(m[3], 10) };
}

// ─── Classification engine ───────────────────────────────────────────────────

function classifyPR(pr) {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.test(pr)) {
      return { classification: rule.classification, matchedRule: rule.id, ruleName: rule.name };
    }
  }
  return { classification: "worthy", matchedRule: null, ruleName: "No issues found" };
}

// ─── Verdict derivation ──────────────────────────────────────────────────────

function deriveVerdict(classification, checklistResults) {
  const fails = checklistResults.filter((r) => r.status === "fail");
  const warns = checklistResults.filter((r) => r.status === "warn");

  if (classification === "slop" || classification === "blocker" || fails.length > 0) {
    return "HALT";
  }
  if (classification === "superseded" || warns.length > 0) {
    return "WARN";
  }
  return "PASS";
}

// ─── Merge-ready check ──────────────────────────────────────────────────────

function isMergeReady(verdict, checklistResults) {
  if (verdict !== "PASS") return false;
  return checklistResults.every((r) => r.status === "pass");
}

// ─── Recommendation engine ──────────────────────────────────────────────────

function buildRecommendation(classification, verdict, checklistResults) {
  const parts = [];

  if (classification === "slop") {
    parts.push("PR appears to be low-quality or automated. Consider closing without merge.");
  } else if (classification === "superseded") {
    parts.push("PR appears superseded by another change. Verify before proceeding.");
  } else if (classification === "blocker") {
    parts.push("PR has merge blockers that must be resolved first.");
  } else {
    parts.push("PR is a worthy contribution ready for review.");
  }

  const failItems = checklistResults.filter((r) => r.status === "fail");
  for (const item of failItems) {
    parts.push(`- ${item.label}: ${item.message}`);
  }

  if (verdict === "HALT" && classification === "worthy") {
    parts.push("Resolve all failing checks before merging.");
  } else if (verdict === "WARN") {
    parts.push("Review warnings before merging.");
  }

  return parts.join(" ");
}

// ─── Main review function ────────────────────────────────────────────────────

export function reviewPR(pr) {
  // Parse PR URL if provided
  let parsed = null;
  if (pr.pr_url) {
    parsed = parsePrUrl(pr.pr_url);
  }

  // Resolve repo and number
  const repo = parsed ? `${parsed.owner}/${parsed.repo}` : (pr.repo || "unknown");
  const number = parsed ? parsed.number : (pr.pr_number || null);

  if (!number && !pr.pr_url && !pr.pr_number) {
    return {
      error: "No PR identifier provided. Supply pr_url or pr_number.",
      verdict: "HALT",
      classification: "slop",
      issues: [{ rule: "MISSING_PR_INFO", message: "No PR identifier provided" }],
      recommendation: "Provide a valid PR URL or number.",
      merge_ready: false,
    };
  }

  // Run checklist
  const checklistResults = CHECKLIST.map((item) => ({
    id: item.id,
    label: item.label,
    ...item.check(pr),
  }));

  // Classify
  const { classification, matchedRule, ruleName } = classifyPR(pr);

  // Collect issues from checklist failures
  const issues = checklistResults
    .filter((r) => r.status === "fail")
    .map((r) => ({ rule: r.id, message: r.message, findings: r.findings }));

  // Add classification as an issue if non-worthy
  if (classification !== "worthy") {
    issues.push({ rule: matchedRule, message: ruleName });
  }

  const verdict = deriveVerdict(classification, checklistResults);
  const mergeReady = isMergeReady(verdict, checklistResults);
  const recommendation = buildRecommendation(classification, verdict, checklistResults);

  return {
    repo,
    pr_number: number,
    verdict,
    classification,
    issues,
    recommendation,
    merge_ready: mergeReady,
    checklist: checklistResults,
  };
}

// ─── Tool registration ──────────────────────────────────────────────────────

export function registerReviewPRTools(server) {
  server.tool(
    "review_pr",
    "Reviews a PR with structured classification and feedback",
    {
      pr_url: z.string().optional().describe("GitHub PR URL (e.g. https://github.com/owner/repo/pull/123)"),
      pr_number: z.number().optional().describe("PR number (requires repo)"),
      repo: z.string().optional().describe("Repository in owner/repo format"),
      diff_content: z.string().optional().describe("PR diff content for security scanning"),
      ci_status: z.string().optional().describe("CI status: success, failure, pending, running, error"),
      has_merge_conflicts: z.boolean().optional().describe("Whether the PR has merge conflicts"),
      has_tests: z.boolean().optional().describe("Whether the PR includes tests"),
      additions: z.number().optional().describe("Number of lines added"),
      deletions: z.number().optional().describe("Number of lines deleted"),
      title: z.string().optional().describe("PR title"),
      body: z.string().optional().describe("PR description/body"),
      state: z.string().optional().describe("PR state: open, closed"),
      updated_at: z.string().optional().describe("Last updated ISO timestamp"),
    },
    async (params) => {
      const rateLimitHit = rateLimiter.check("review_pr");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = reviewPR(params);
        const text = JSON.stringify(result, null, 2);
        return {
          content: [{ type: "text", text }],
          reviewReport: result,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in review_pr: ${e.message}` }],
        };
      }
    }
  );
}
