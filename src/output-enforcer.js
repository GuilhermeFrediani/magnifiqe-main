/**
 * Stack Perfeita MCP — Structured Output Enforcement
 * GAP-3: Forces AI to produce structured, consistent output formats.
 *
 * Tools:
 *   enforce_output_format   — Convert raw output to a specified format
 *   validate_output_structure — Validate output matches expected structure
 *   standardize_response    — Standardize any response to project conventions
 *   format_for_ide          — Adapt output for specific IDE consumption
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Format Schemas ──────────────────────────────────────────────────────────
// Defines structural expectations and validation patterns for each format.

const FORMAT_SCHEMAS = {
  json: {
    name: "JSON",
    validate(text) {
      try {
        const parsed = JSON.parse(text);
        return {
          valid: true,
          issues: [],
          data: parsed,
        };
      } catch (e) {
        return { valid: false, issues: [`Invalid JSON: ${e.message}`] };
      }
    },
    restructure(text) {
      // Attempt to extract key-value pairs from unstructured text
      const lines = text.split("\n").filter((l) => l.trim());
      const obj = {};

      // Try to parse lines as "key: value" or "key = value"
      let extracted = 0;
      for (const line of lines) {
        const match = line.match(/^\s*[-*]?\s*([A-Za-z_][\w\s]*?):\s*(.+)/);
        if (match) {
          const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
          obj[key] = match[2].trim();
          extracted++;
        }
      }

      if (extracted === 0) {
        // Fallback: wrap entire text as a single "content" field
        obj.content = text.trim();
      }

      return JSON.stringify(obj, null, 2);
    },
  },

  markdown: {
    name: "Markdown",
    patterns: {
      heading: /^#{1,6}\s+/m,
      codeBlock: /^```/m,
      bulletList: /^[\s]*[-*]\s+/m,
    },
    restructure(text) {
      const lines = text.split("\n");
      const result = [];
      let lastWasBlank = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip consecutive blank lines
        if (!trimmed) {
          if (!lastWasBlank) {
            result.push("");
            lastWasBlank = true;
          }
          continue;
        }
        lastWasBlank = false;

        // If line looks like a section title but lacks heading syntax
        if (/^[A-Z][A-Za-z\s]{2,30}$/.test(trimmed) && i + 1 < lines.length) {
          result.push(`## ${trimmed}`);
        } else {
          result.push(line);
        }
      }

      return result.join("\n").trim();
    },
  },

  checklist: {
    name: "Checklist",
    patterns: {
      item: /^[\s]*[-*]\s*\[[ x]\]/m,
    },
    restructure(text) {
      const lines = text.split("\n").filter((l) => l.trim());
      const items = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Already a checklist item
        if (/^[-*]\s*\[[ x]\]\s+/.test(trimmed)) {
          items.push(trimmed);
          continue;
        }
        // Bullet or numbered list — convert to checklist
        const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
        if (bulletMatch) {
          items.push(`- [ ] ${bulletMatch[1]}`);
          continue;
        }
        const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
        if (numMatch) {
          items.push(`- [ ] ${numMatch[1]}`);
          continue;
        }
        // Plain sentence — convert to checklist item
        if (trimmed.length > 3) {
          items.push(`- [ ] ${trimmed}`);
        }
      }

      return items.join("\n");
    },
  },

  table: {
    name: "Table",
    restructure(text) {
      const lines = text.split("\n").filter((l) => l.trim());
      const rows = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Already a table row
        if (/^\|.+\|$/.test(trimmed)) {
          rows.push(trimmed);
          continue;
        }
        // Tab-separated or comma-separated data
        if (/\t/.test(trimmed) || /,/.test(trimmed)) {
          const delimiter = /\t/.test(trimmed) ? "\t" : ",";
          const cells = trimmed.split(delimiter).map((c) => c.trim());
          rows.push(`| ${cells.join(" | ")} |`);
          continue;
        }
        // Key: value pairs — convert to two-column table
        const kvMatch = trimmed.match(/^(.+?):\s*(.+)/);
        if (kvMatch) {
          rows.push(`| ${kvMatch[1].trim()} | ${kvMatch[2].trim()} |`);
          continue;
        }
        // Plain text — add as single-cell row
        rows.push(`| ${trimmed} |`);
      }

      if (rows.length === 0) return "| |";

      // Insert separator after first row (header)
      const header = rows[0];
      const separatorCols = (header.match(/\|/g) || []).length - 1;
      const separator = `| ${Array(separatorCols).fill("---").join(" | ")} |`;

      return [rows[0], separator, ...rows.slice(1)].join("\n");
    },
  },

  summary: {
    name: "Summary",
    restructure(text) {
      const lines = text.split("\n").filter((l) => l.trim());
      const result = ["## Summary", ""];

      // Extract first sentence as overview
      const firstSentence = text.match(/^[^.!?]*[.!?]/);
      if (firstSentence) {
        result.push(firstSentence[0].trim());
        result.push("");
      }

      // Key points from bullet items
      const bullets = lines.filter((l) => /^[\s]*[-*]\s+/.test(l.trim()));
      if (bullets.length > 0) {
        result.push("### Key Points");
        result.push("");
        for (const b of bullets.slice(0, 10)) {
          result.push(b.trim());
        }
        result.push("");
      }

      // Deductions from numbered lists
      const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l.trim()));
      if (numbered.length > 0) {
        result.push("### Details");
        result.push("");
        for (const n of numbered.slice(0, 10)) {
          result.push(n.trim());
        }
      }

      return result.join("\n");
    },
  },

  "code-review": {
    name: "Code Review",
    restructure(text) {
      const lines = text.split("\n").filter((l) => l.trim());
      const result = ["## Code Review", ""];

      // Detect file references
      const fileRefs = lines.filter((l) => /\.[a-z]{1,5}[:\s]|`[^`]+\.[a-z]{1,5}`|\/[a-z]+\/[a-z]+\//i.test(l));
      if (fileRefs.length > 0) {
        result.push("### Files Reviewed");
        for (const f of fileRefs.slice(0, 10)) {
          result.push(f.trim());
        }
        result.push("");
      }

      // Detect issue-like lines (contain words like "error", "warning", "fix", "issue", "bug", "problem")
      const issuePatterns = /\b(error|warning|issue|bug|problem|fix|refactor|improve|missing|incorrect|wrong|vulnerable|risk|blocker)\b/i;
      const issueLines = lines.filter((l) => issuePatterns.test(l));
      if (issueLines.length > 0) {
        result.push("### Issues Found");
        for (const issue of issueLines) {
          result.push(`- ${issue.trim()}`);
        }
        result.push("");
      }

      // Detect recommendation-like lines (contain "should", "recommend", "consider", "could", "better")
      const recPatterns = /\b(should|recommend|consider|could|better|prefer|best practice|suggestion)\b/i;
      const recLines = lines.filter((l) => recPatterns.test(l) && !issuePatterns.test(l));
      if (recLines.length > 0) {
        result.push("### Recommendations");
        for (const rec of recLines) {
          result.push(`- ${rec.trim()}`);
        }
      }

      return result.join("\n");
    },
  },

  "bug-report": {
    name: "Bug Report",
    restructure(text) {
      const lines = text.split("\n").filter((l) => l.trim());
      const sections = ["## Bug Report", ""];

      // Classify each line into a category
      const categories = {
        description: [],
        steps: [],
        expected: [],
        actual: [],
        environment: [],
      };

      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        const content = line.trim();

        if (/\b(expect|should|wanted|correct)\b/.test(lower)) {
          categories.expected.push(content);
        } else if (/\b(actual|got|result|observed|happens)\b/.test(lower)) {
          categories.actual.push(content);
        } else if (/\b(step|reproduc|navigate|click|open|run|execute|how to)\b/.test(lower)) {
          categories.steps.push(content);
        } else if (/\b(os|version|browser|node|npm|env|system)\b/.test(lower)) {
          categories.environment.push(content);
        } else if (/\b(error|bug|fail|crash|issue|problem|broken)\b/.test(lower)) {
          categories.description.push(content);
        } else {
          // Default to description
          categories.description.push(content);
        }
      }

      if (categories.description.length > 0) {
        sections.push("### Description");
        for (const d of categories.description) sections.push(d);
        sections.push("");
      }

      if (categories.steps.length > 0) {
        sections.push("### Steps to Reproduce");
        let stepNum = 1;
        for (const s of categories.steps) {
          sections.push(`${stepNum}. ${s}`);
          stepNum++;
        }
        sections.push("");
      }

      if (categories.expected.length > 0) {
        sections.push("### Expected Behavior");
        for (const e of categories.expected) sections.push(e);
        sections.push("");
      }

      if (categories.actual.length > 0) {
        sections.push("### Actual Behavior");
        for (const a of categories.actual) sections.push(a);
        sections.push("");
      }

      if (categories.environment.length > 0) {
        sections.push("### Environment");
        for (const env of categories.environment) sections.push(env);
      }

      return sections.join("\n");
    },
  },

  "test-report": {
    name: "Test Report",
    restructure(text) {
      const lines = text.split("\n").filter((l) => l.trim());
      const sections = ["## Test Report", ""];

      const results = [];
      const coverage = [];
      const failures = [];
      const passes = [];
      let totalTests = 0;
      let passedTests = 0;
      let failedTests = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();

        // Detect test results (pass/fail/skip)
        if (/\b(pass|ok|✓|✔|passed)\b/.test(lower) && /\b(test|spec|case|assertion)\b/.test(lower)) {
          passes.push(trimmed);
          passedTests++;
          totalTests++;
          continue;
        }
        if (/\b(fail|✗|✘|error|fail|failed)\b/.test(lower) && /\b(test|spec|case|assertion)\b/.test(lower)) {
          failures.push(trimmed);
          failedTests++;
          totalTests++;
          continue;
        }

        // Detect coverage info
        if (/\b(coverage|cover|%|percent)\b/.test(lower)) {
          coverage.push(trimmed);
          continue;
        }

        // Detect summary numbers
        const numMatch = trimmed.match(/(\d+)\s*(tests?|specs?|assertions?)/i);
        if (numMatch) {
          totalTests = Math.max(totalTests, parseInt(numMatch[1], 10));
        }

        results.push(trimmed);
      }

      // Summary section
      sections.push("### Summary");
      if (totalTests > 0) {
        const status = failedTests === 0 ? "ALL PASSED" : `${failedTests} FAILED`;
        sections.push(`- Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests} — ${status}`);
      } else {
        // Infer from counts
        sections.push(`- Passed: ${passes.length} | Failed: ${failures.length}`);
      }
      sections.push("");

      // Failed tests (prominent)
      if (failures.length > 0) {
        sections.push("### Failures");
        for (const f of failures) sections.push(`- ${f}`);
        sections.push("");
      }

      // Passed tests
      if (passes.length > 0) {
        sections.push("### Passed");
        for (const p of passes.slice(0, 20)) sections.push(`- ${p}`);
        if (passes.length > 20) sections.push(`- ... and ${passes.length - 20} more`);
        sections.push("");
      }

      // Coverage
      if (coverage.length > 0) {
        sections.push("### Coverage");
        for (const c of coverage) sections.push(c);
      }

      // Remaining lines that didn't categorize
      if (results.length > 0) {
        if (coverage.length === 0) {
          sections.push("### Details");
          for (const r of results.slice(0, 15)) sections.push(r);
        }
      }

      return sections.join("\n");
    },
  },
};

// ─── IDE Preferences ─────────────────────────────────────────────────────────
// Formatting preferences per IDE target.

const IDE_PREFERENCES = {
  cursor: {
    markdown: true,
    codeBlocks: true,
    links: true,
    maxLineLength: 120,
    emoji: true,
    headings: "atx",
  },
  windsurf: {
    markdown: true,
    codeBlocks: true,
    links: true,
    maxLineLength: 100,
    emoji: true,
    headings: "atx",
  },
  copilot: {
    markdown: false,
    codeBlocks: true,
    links: false,
    maxLineLength: 80,
    emoji: false,
    headings: "plain",
  },
  "claude-code": {
    markdown: true,
    codeBlocks: true,
    links: true,
    maxLineLength: 100,
    emoji: false,
    headings: "atx",
  },
  generic: {
    markdown: false,
    codeBlocks: true,
    links: false,
    maxLineLength: 80,
    emoji: false,
    headings: "plain",
  },
};

// ─── Standardization rules ───────────────────────────────────────────────────

const FILLER_PATTERNS = [
  /\b(this is|here is|the following is|below is)\b/gi,
  /\b(I'm going to|I will|I would like to|let me)\b/gi,
  /\b(in order to|for the purpose of|with regard to)\b/gi,
  /\b(basically|essentially|actually|literally)\b/gi,
  /\b(you know|as you can see|needless to say|obviously)\b/gi,
  /\b(at the end of the day|all things considered|it goes without saying)\b/gi,
  /\b(hopefully|fortunately|unfortunately|interestingly)\b/gi,
  /\b(a bit|a little|kind of|sort of|more or less)\b/gi,
  /\b(please note that|it should be mentioned that|it is worth noting)\b/gi,
  /\b(depending on the|in terms of|with respect to|in the context of)\b/gi,
];

const CONTEXT_PATTERNS = {
  completion: {
    markers: /\b(done|complete|finished|implemented|added|fixed|created|updated)\b/i,
    opener: null,
    closer: null,
  },
  error: {
    markers: /\b(error|fail|exception|crash|broken|abort)\b/i,
    opener: null,
    closer: null,
  },
  question: {
    markers: /\?$/,
    opener: null,
    closer: null,
  },
  proposal: {
    markers: /\b(propos|suggest|recommend|plan|approach|design|architecture)\b/i,
    opener: null,
    closer: null,
  },
};

// ─── Helper functions ────────────────────────────────────────────────────────

/**
 * Count words in a text string.
 */
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract section headers from markdown or plain text.
 */
function extractSections(text) {
  const sections = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      sections.push(headingMatch[1].trim().toLowerCase());
      continue;
    }
    // Detect ALL CAPS lines as section headers
    const capsMatch = line.match(/^([A-Z][A-Z\s]{3,})$/);
    if (capsMatch) {
      sections.push(capsMatch[1].trim().toLowerCase());
    }
  }

  return sections;
}

/**
 * Detect orphaned content: lines that are not inside any section
 * and are not part of a list or code block.
 */
function detectOrphanedContent(text) {
  const lines = text.split("\n");
  const orphans = [];
  let inCodeBlock = false;
  let hasSections = false;
  let hasAnyContent = false;

  // Check if there are any sections at all
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) || /^[A-Z][A-Z\s]{3,}$/.test(line.trim())) {
      hasSections = true;
    }
  }

  if (!hasSections) return [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code blocks
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Blank lines
    if (!trimmed) continue;

    // Section headers
    if (/^#{1,6}\s+/.test(trimmed) || /^[A-Z][A-Z\s]{3,}$/.test(trimmed)) continue;

    // List items
    if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) continue;

    // Table rows
    if (/^\|/.test(trimmed)) continue;

    // Check if this is before any section header (orphaned preamble)
    let beforeAnySection = true;
    for (let j = 0; j < i; j++) {
      if (/^#{1,6}\s+/.test(lines[j].trim()) || /^[A-Z][A-Z\s]{3,}$/.test(lines[j].trim())) {
        beforeAnySection = false;
        break;
      }
    }

    if (beforeAnySection && hasSections) {
      hasAnyContent = true;
      orphans.push({ line: i + 1, text: trimmed });
    }
  }

  return orphans;
}

/**
 * Wrap text to a given line length, preserving markdown syntax.
 */
function wrapText(text, maxLen) {
  const lines = text.split("\n");
  const result = [];

  for (const line of lines) {
    // Don't wrap headings, code blocks, lists, tables, or blank lines
    if (
      /^#{1,6}\s/.test(line) ||
      /^```/.test(line) ||
      /^[-*]\s/.test(line) ||
      /^\d+[.)]\s/.test(line) ||
      /^\|/.test(line) ||
      !line.trim()
    ) {
      result.push(line);
      continue;
    }

    if (line.length <= maxLen) {
      result.push(line);
      continue;
    }

    // Word-wrap
    const words = line.split(/\s+/);
    let currentLine = "";
    for (const word of words) {
      if (currentLine.length + word.length + 1 > maxLen && currentLine.length > 0) {
        result.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }
    if (currentLine) result.push(currentLine);
  }

  return result.join("\n");
}

/**
 * Strip markdown formatting to plain text.
 */
function stripMarkdown(text) {
  let result = text;
  // Remove heading markers
  result = result.replace(/^#{1,6}\s+/gm, "");
  // Remove bold/italic
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  // Remove links, keep text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove images
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "[$1]");
  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, "");
  return result;
}

/**
 * Detect which sections of a bug report / structured doc are missing.
 */
function detectMissingSections(text, format) {
  const schema = FORMAT_SCHEMAS[format];
  if (!schema || !schema.restructure) return [];

  const lower = text.toLowerCase();
  const missing = [];

  if (format === "bug-report") {
    const required = [
      { key: "description", patterns: /\b(description|what happened|overview)\b/i },
      { key: "steps to reproduce", patterns: /\b(step|reproduc|how to)\b/i },
      { key: "expected behavior", patterns: /\b(expect|should|wanted)\b/i },
      { key: "actual behavior", patterns: /\b(actual|got|result|observed)\b/i },
    ];
    for (const { key, patterns } of required) {
      if (!patterns.test(text)) {
        missing.push(`Missing section: ${key}`);
      }
    }
  }

  if (format === "code-review") {
    const required = [
      { key: "files reviewed", patterns: /\b(file|source|module)\b.*\b(review|checked|read)\b/i },
      { key: "issues", patterns: /\b(issue|error|warning|bug|problem)\b/i },
    ];
    for (const { key, patterns } of required) {
      if (!patterns.test(text)) {
        missing.push(`Missing section: ${key}`);
      }
    }
  }

  if (format === "test-report") {
    const required = [
      { key: "summary", patterns: /\b(summary|total|result)\b/i },
      { key: "test results", patterns: /\b(pass|fail|ok|skip)\b/i },
    ];
    for (const { key, patterns } of required) {
      if (!patterns.test(text)) {
        missing.push(`Missing section: ${key}`);
      }
    }
  }

  return missing;
}

/**
 * Score text for standardization compliance.
 */
function scoreStandardization(text, context) {
  let score = 10;
  const issues = [];
  const suggestions = [];

  const wc = wordCount(text);

  // Word count bounds by context
  const WC_LIMITS = {
    completion: { min: 3, max: 200 },
    error: { min: 3, max: 150 },
    question: { min: 2, max: 100 },
    proposal: { min: 10, max: 400 },
  };
  const limits = WC_LIMITS[context] || WC_LIMITS.completion;

  if (wc > limits.max) {
    score -= 2;
    issues.push(`Word count ${wc} exceeds ${context} limit of ${limits.max}`);
    suggestions.push("Trim verbose explanations; lead with the answer.");
  }
  if (wc < limits.min && wc > 0) {
    score -= 1;
    issues.push(`Word count ${wc} is below minimum ${limits.min} for ${context}`);
    suggestions.push("Add必要的 detail to make the response actionable.");
  }

  // Filler detection
  let fillerCount = 0;
  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern) || [];
    fillerCount += matches.length;
  }
  if (fillerCount > 0) {
    score -= Math.min(3, fillerCount);
    issues.push(`${fillerCount} filler phrase(s) detected`);
    suggestions.push("Remove filler — state the fact directly.");
  }

  // Process narration detection
  const narrationPatterns = /\b(I'm going to analyze|Let me look at|I'll start by|First, I'll|Now I will)\b/gi;
  const narrationMatches = text.match(narrationPatterns) || [];
  if (narrationMatches.length > 0) {
    score -= Math.min(2, narrationMatches.length);
    issues.push(`${narrationMatches.length} process narration(s) detected`);
    suggestions.push("Don't narrate your process; show the result.");
  }

  // Evidence-first check: for completion/error, the key fact should be in the first line
  if (context === "completion" || context === "error") {
    const firstLine = text.split("\n")[0].trim();
    const hasImmediateAnswer = /\b(done|fixed|pass|fail|error|halt|warn|created|added|removed)\b/i.test(firstLine);
    if (!hasImmediateAnswer && wc > 15) {
      score -= 1;
      issues.push("Key fact not in first line");
      suggestions.push("Lead with the outcome, then explain if needed.");
    }
  }

  // Check for orphaned content (no structure)
  const hasStructure = /^#{1,6}\s+/m.test(text) || /^[-*]\s+/m.test(text) || /^\d+[.)]\s+/m.test(text);
  if (!hasStructure && wc > 30) {
    score -= 1;
    issues.push("Long response without structural formatting");
    suggestions.push("Add headings or bullet points for scannability.");
  }

  return {
    score: Math.max(0, Math.min(10, score)),
    issues,
    suggestions,
  };
}

// ─── Tool Registration ───────────────────────────────────────────────────────

/**
 * Register structured output enforcement tools on the MCP server.
 * Tools: enforce_output_format, validate_output_structure,
 *        standardize_response, format_for_ide
 */
export function registerOutputEnforcerTools(server) {
  // ── enforce_output_format ──────────────────────────────────────────────
  server.tool(
    "enforce_output_format",
    "Takes raw AI output and converts it to a specified structured format (json, markdown, checklist, table, summary, code-review, bug-report, test-report). Returns the restructured output and a list of changes made.",
    {
      text: z.string().describe("Raw AI output text to convert."),
      format: z
        .enum(["json", "markdown", "checklist", "table", "summary", "code-review", "bug-report", "test-report"])
        .describe("Target output format."),
    },
    async ({ text, format }) => {
      const rateLimitHit = rateLimiter.check("enforce_output_format");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      if (!text || !text.trim()) {
        return {
          content: [{ type: "text", text: "HALT — Empty input. Provide text to format." }],
        };
      }

      const schema = FORMAT_SCHEMAS[format];
      if (!schema) {
        return {
          content: [{ type: "text", text: `HALT — Unknown format "${format}". Supported: ${Object.keys(FORMAT_SCHEMAS).join(", ")}` }],
        };
      }

      const changes = [];

      // Check if already in target format
      if (format === "json") {
        const check = schema.validate(text);
        if (check.valid) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                formatted: text,
                format: "json",
                changes_made: ["Input was already valid JSON — no changes made."],
              }, null, 2),
            }],
          };
        }
      }

      // Detect current format of input
      const hasHeadings = /^#{1,6}\s+/m.test(text);
      const hasBullets = /^[-*]\s+/m.test(text);
      const hasCheckboxes = /^[-*]\s*\[[ x]\]/m.test(text);
      const hasTable = /^\|.+\|$/m.test(text);
      const hasJson = /^\s*[\[{]/.test(text.trim()) && /[\]}]\s*$/.test(text.trim());

      if (hasHeadings) changes.push("Detected existing markdown headings");
      if (hasBullets) changes.push("Detected existing bullet list");
      if (hasCheckboxes) changes.push("Detected existing checkbox list");
      if (hasTable) changes.push("Detected existing table structure");
      if (hasJson) changes.push("Detected JSON-like input");

      // Apply restructure
      let formatted;
      if (format === "json" && hasJson) {
        try {
          formatted = JSON.stringify(JSON.parse(text), null, 2);
          changes.push("Re-indented existing JSON");
        } catch {
          formatted = schema.restructure(text);
          changes.push("Extracted key-value pairs from unstructured text into JSON");
        }
      } else {
        formatted = schema.restructure(text);
        if (formatted !== text) {
          changes.push(`Restructured text into ${schema.name} format`);
        }

        // Additional format-specific fixes
        if (format === "markdown") {
          if (!hasHeadings && text.split("\n").filter((l) => l.trim()).length > 5) {
            changes.push("Added section headings for multi-paragraph content");
          }
        }

        if (format === "checklist") {
          const originalBullets = text.match(/^[-*]\s+(?![[\]])/gm) || [];
          if (originalBullets.length > 0) {
            changes.push(`Converted ${originalBullets.length} plain bullet(s) to checkbox items`);
          }
          const numbered = text.match(/^\d+[.)]\s+/gm) || [];
          if (numbered.length > 0) {
            changes.push(`Converted ${numbered.length} numbered item(s) to checkbox items`);
          }
        }
      }

      // Trailing newline normalization
      if (formatted !== formatted.trimEnd()) {
        formatted = formatted.trimEnd();
        changes.push("Normalized trailing whitespace");
      }

      if (changes.length === 0) {
        changes.push("No structural changes needed — output was already in target format");
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            formatted,
            format,
            changes_made: changes,
          }, null, 2),
        }],
      };
    }
  );

  // ── validate_output_structure ──────────────────────────────────────────
  server.tool(
    "validate_output_structure",
    "Validates whether output matches an expected structure. Checks for required sections, proper formatting, and orphaned content. Returns validity, issues found, and suggestions for improvement.",
    {
      text: z.string().describe("Output text to validate."),
      expected_format: z.string().describe('Expected format: "json", "markdown", "checklist", "table", "summary", "code-review", "bug-report", or "test-report".'),
      required_sections: z.array(z.string()).optional().describe("Optional list of section names that must be present."),
    },
    async ({ text, expected_format, required_sections }) => {
      const rateLimitHit = rateLimiter.check("validate_output_structure");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      if (!text || !text.trim()) {
        return {
          content: [{ type: "text", text: JSON.stringify({ valid: false, issues: ["Empty input"], suggestions: ["Provide text to validate."] }) }],
        };
      }

      const issues = [];
      const suggestions = [];

      // ─── Format-specific validation ───────────────────────────────────────
      if (expected_format === "json") {
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed !== "object" || parsed === null) {
            issues.push("JSON root must be an object or array");
          }
        } catch (e) {
          issues.push(`Invalid JSON: ${e.message}`);
          suggestions.push("Parse and fix JSON syntax errors before submission.");
        }
      }

      if (expected_format === "markdown") {
        if (!/^#{1,6}\s+/m.test(text)) {
          issues.push("No markdown headings found — markdown format typically uses # headings");
          suggestions.push("Add a top-level heading (# Title) to start the document.");
        }
        // Check for unclosed code blocks
        const codeBlockCount = (text.match(/^```/gm) || []).length;
        if (codeBlockCount % 2 !== 0) {
          issues.push(`Odd number of code block fences (${codeBlockCount}) — likely unclosed code block`);
          suggestions.push("Ensure every ``` opening has a matching ``` closing.");
        }
      }

      if (expected_format === "checklist") {
        const checklistItems = (text.match(/^[-*]\s*\[[ x]\]/gm) || []).length;
        if (checklistItems === 0) {
          issues.push("No checklist items found (expected - [ ] or - [x] format)");
          suggestions.push("Convert list items to checkbox format: - [ ] item");
        }
      }

      if (expected_format === "table") {
        const tableRows = (text.match(/^\|.+\|$/gm) || []).length;
        if (tableRows < 2) {
          issues.push("Incomplete table — expected at least header + separator + 1 data row");
          suggestions.push("Ensure table has header, separator (| --- |), and data rows.");
        }
        // Check column count consistency
        const columnCounts = (text.match(/^\|.+\|$/gm) || []).map((r) => (r.match(/\|/g) || []).length);
        const unique = [...new Set(columnCounts)];
        if (unique.length > 1) {
          issues.push(`Inconsistent column counts: [${unique.join(", ")}]`);
          suggestions.push("Ensure all rows have the same number of columns.");
        }
      }

      // ─── Missing required sections ────────────────────────────────────────
      if (required_sections && required_sections.length > 0) {
        const sections = extractSections(text);
        for (const required of required_sections) {
          const reqLower = required.toLowerCase();
          const found = sections.some((s) => s.includes(reqLower) || reqLower.includes(s));
          if (!found) {
            // Also check raw text for the section keyword
            const textLower = text.toLowerCase();
            if (!textLower.includes(reqLower)) {
              issues.push(`Missing required section: "${required}"`);
              suggestions.push(`Add a section titled "${required}".`);
            }
          }
        }
      }

      // ─── Known format section checks ──────────────────────────────────────
      const formatMissing = detectMissingSections(text, expected_format);
      for (const m of formatMissing) {
        issues.push(m);
      }

      // ─── Orphaned content detection ───────────────────────────────────────
      const orphans = detectOrphanedContent(text);
      if (orphans.length > 0) {
        issues.push(`${orphans.length} orphaned line(s) before first section header`);
        suggestions.push("Move preamble content into a section or remove it.");
      }

      // ─── Structural consistency ───────────────────────────────────────────
      // Check for mixed heading styles (atx vs underline)
      const hasAtxHeadings = /^#{1,6}\s+/m.test(text);
      const hasUnderlineHeadings = /^[-=]{3,}\s*$/m.test(text);
      if (hasAtxHeadings && hasUnderlineHeadings) {
        issues.push("Mixed heading styles (ATX # and underline ===)");
        suggestions.push("Use one consistent heading style throughout.");
      }

      // ─── General quality signals ──────────────────────────────────────────
      const wc = wordCount(text);
      if (wc > 500) {
        suggestions.push("Consider compressing — long output reduces scannability.");
      }

      // ─── Verdict ──────────────────────────────────────────────────────────
      const valid = issues.length === 0;

      const result = {
        valid,
        issues: issues.length > 0 ? issues : ["No issues found"],
        suggestions: suggestions.length > 0 ? suggestions : ["Structure looks good."],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── standardize_response ───────────────────────────────────────────────
  server.tool(
    "standardize_response",
    "Takes any response and standardizes it to project conventions: concise, evidence-first, no filler. Returns the standardized text with word count comparison.",
    {
      text: z.string().describe("Response text to standardize."),
      context: z
        .enum(["completion", "error", "question", "proposal"])
        .describe("Response context — determines which conventions to apply."),
    },
    async ({ text, context }) => {
      const rateLimitHit = rateLimiter.check("standardize_response");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      if (!text || !text.trim()) {
        return {
          content: [{ type: "text", text: "HALT — Empty input. Provide text to standardize." }],
        };
      }

      const wcBefore = wordCount(text);
      let standardized = text;
      const changes = [];

      // ─── Step 1: Remove filler phrases ────────────────────────────────────
      let cleaned = standardized;
      for (const pattern of FILLER_PATTERNS) {
        const before = cleaned;
        cleaned = cleaned.replace(pattern, "");
        if (cleaned !== before) {
          const count = (before.match(pattern) || []).length;
          changes.push(`Removed ${count} filler phrase(s) matching "${pattern.source.slice(0, 40)}..."`);
        }
      }
      standardized = cleaned;

      // ─── Step 2: Remove process narration ─────────────────────────────────
      const narrationPatterns = [
        /^[\s]*(I'?m going to [^.!?]+[.!?])\s*/gim,
        /^[\s]*(Let me [^.!?]+[.!?])\s*/gim,
        /^[\s]*(I will [^.!?]+[.!?])\s*/gim,
        /^[\s]*(First,? I'?ll [^.!?]+[.!?])\s*/gim,
        /^[\s]*(Now I will [^.!?]+[.!?])\s*/gim,
      ];
      for (const pattern of narrationPatterns) {
        const before = standardized;
        standardized = standardized.replace(pattern, "");
        if (standardized !== before) {
          changes.push("Removed process narration");
        }
      }

      // ─── Step 3: Collapse excessive blank lines ───────────────────────────
      const beforeBlank = standardized;
      standardized = standardized.replace(/\n{3,}/g, "\n\n");
      if (standardized !== beforeBlank) {
        changes.push("Collapsed excessive blank lines");
      }

      // ─── Step 4: Context-specific formatting ──────────────────────────────
      if (context === "completion") {
        // For completions, ensure the verdict/result is on the first non-empty line
        const lines = standardized.split("\n");
        const nonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
        if (nonEmptyIdx >= 0) {
          const firstLine = lines[nonEmptyIdx];
          const hasVerdict = /\b(done|complete|pass|fail|halt|warn|created|added|fixed|removed|implemented|updated)\b/i.test(firstLine);
          if (!hasVerdict && wcBefore > 20) {
            // Try to extract the verdict and move it to the front
            const verdictLine = lines.find((l) => /\b(done|complete|pass|fail|halt|warn|created|added|fixed|removed|implemented|updated)\b/i.test(l));
            if (verdictLine && verdictLine !== firstLine) {
              lines.splice(lines.indexOf(verdictLine), 1);
              lines.splice(nonEmptyIdx, 0, verdictLine);
              standardized = lines.join("\n");
              changes.push("Moved verdict to first line (evidence-first)");
            }
          }
        }
      }

      if (context === "error") {
        // Ensure error has a HALT or error marker in first line
        const lines = standardized.split("\n");
        const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
        if (firstNonEmpty >= 0) {
          const firstLine = lines[firstNonEmpty];
          const hasErrorMarker = /\b(halt|error|fail|exception|broken)\b/i.test(firstLine);
          if (!hasErrorMarker) {
            standardized = `HALT — ${firstLine}\n` + lines.filter((_, i) => i !== firstNonEmpty).join("\n");
            changes.push("Added HALT prefix to error response");
          }
        }
      }

      if (context === "question") {
        // Ensure questions end with a question mark
        const trimmed = standardized.trimEnd();
        if (trimmed.length > 0 && !/[?]/.test(trimmed.slice(-1))) {
          // Find the last sentence
          const lastSentence = trimmed.match(/[^.!?]+[.!?]*$/);
          if (lastSentence && /\b(what|how|why|which|where|when|who|is|are|do|does|can|could|should|would|will)\b/i.test(lastSentence[0])) {
            standardized = trimmed + "?";
            changes.push("Added trailing question mark");
          }
        }
      }

      if (context === "proposal") {
        // Ensure proposal has a clear structure: summary → approach → tradeoffs
        const hasSummary = /\b(summary|overview|tldr|short version)\b/i.test(standardized);
        const hasApproach = /\b(approach|plan|design|solution|implementation)\b/i.test(standardized);
        const hasTradeoffs = /\b(tradeoff|trade-off|alternative|pros and cons|downside|limitation)\b/i.test(standardized);

        if (!hasSummary && wcBefore > 30) {
          standardized = `**Summary:** ${standardized.split("\n")[0].trim()}\n\n${standardized}`;
          changes.push("Added summary label to opening line");
        }
        if (!hasApproach && wcBefore > 50) {
          changes.push("Suggestion: Add an 'Approach' section to structure the proposal");
        }
        if (!hasTradeoffs && wcBefore > 50) {
          changes.push("Suggestion: Add a 'Tradeoffs' section for completeness");
        }
      }

      // ─── Step 5: Trim trailing whitespace ─────────────────────────────────
      standardized = standardized.trimEnd();

      const wcAfter = wordCount(standardized);

      const result = {
        standardized,
        word_count_before: wcBefore,
        word_count_after: wcAfter,
      };

      if (changes.length > 0) {
        result.changes_applied = changes;
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ── format_for_ide ─────────────────────────────────────────────────────
  server.tool(
    "format_for_ide",
    "Formats output for specific IDE consumption. Adapts markdown, code blocks, and structure for the target IDE's rendering capabilities. Returns the adapted output and a list of adaptations made.",
    {
      text: z.string().describe("Output text to adapt for IDE."),
      ide: z
        .enum(["cursor", "windsurf", "copilot", "claude-code", "generic"])
        .describe("Target IDE."),
    },
    async ({ text, ide }) => {
      const rateLimitHit = rateLimiter.check("format_for_ide");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      if (!text || !text.trim()) {
        return {
          content: [{ type: "text", text: "HALT — Empty input. Provide text to format." }],
        };
      }

      const prefs = IDE_PREFERENCES[ide];
      if (!prefs) {
        return {
          content: [{ type: "text", text: `HALT — Unknown IDE "${ide}". Supported: ${Object.keys(IDE_PREFERENCES).join(", ")}` }],
        };
      }

      let formatted = text;
      const adaptations = [];

      // ─── Strip markdown if IDE doesn't support it ────────────────────────
      if (!prefs.markdown) {
        const before = formatted;
        formatted = stripMarkdown(formatted);
        if (formatted !== before) {
          adaptations.push("Stripped markdown formatting (headings, bold, links) for plain-text IDE");
        }
      }

      // ─── Strip links if IDE doesn't support them ─────────────────────────
      if (!prefs.links && prefs.markdown) {
        const before = formatted;
        formatted = formatted.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        if (formatted !== before) {
          adaptations.push("Converted links to plain text labels (IDE does not render links)");
        }
      }

      // ─── Strip emoji if IDE doesn't support them ─────────────────────────
      if (!prefs.emoji) {
        const before = formatted;
        // eslint-disable-next-line no-control-regex
        formatted = formatted.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "");
        if (formatted !== before) {
          adaptations.push("Removed emoji characters (IDE does not render emoji)");
        }
      }

      // ─── Line length adaptation ───────────────────────────────────────────
      if (prefs.maxLineLength && prefs.maxLineLength < 200) {
        const before = formatted;
        formatted = wrapText(formatted, prefs.maxLineLength);
        if (formatted !== before) {
          adaptations.push(`Wrapped lines to max ${prefs.maxLineLength} characters`);
        }
      }

      // ─── Heading style adaptation ─────────────────────────────────────────
      if (prefs.headings === "plain" && !prefs.markdown) {
        const before = formatted;
        // Convert ATX headings to uppercase plain text
        formatted = formatted.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, title) => {
          return title.toUpperCase();
        });
        if (formatted !== before) {
          adaptations.push("Converted markdown headings to plain uppercase text");
        }
      }

      // ─── IDE-specific code block handling ─────────────────────────────────
      if (!prefs.codeBlocks) {
        // Some minimal environments can't render code blocks
        const before = formatted;
        formatted = formatted.replace(/^```\w*\n([\s\S]*?)^```/gm, (_, code) => {
          return code.split("\n").map((l) => `  ${l}`).join("\n");
        });
        if (formatted !== before) {
          adaptations.push("Replaced fenced code blocks with indented code");
        }
      }

      // ─── Copilot-specific: flatten structure for inline suggestions ──────
      if (ide === "copilot") {
        const before = formatted;
        // Copilot works best with shorter, flatter responses
        // Remove section dividers
        formatted = formatted.replace(/^[-=_]{3,}$/gm, "");
        // Remove empty markdown elements
        formatted = formatted.replace(/\*\*\*/g, "");
        if (formatted !== before) {
          adaptations.push("Flattened structure for Copilot inline suggestion mode");
        }
      }

      // ─── Claude Code specific: add thinking markers ──────────────────────
      if (ide === "claude-code") {
        const before = formatted;
        // Ensure code blocks have language tags for syntax highlighting
        formatted = formatted.replace(/^```\s*$/gm, "```text");
        if (formatted !== before) {
          adaptations.push("Added language tags to unlabeled code blocks for syntax highlighting");
        }
      }

      // ─── Final normalization ──────────────────────────────────────────────
      formatted = formatted.replace(/\n{3,}/g, "\n\n").trimEnd();

      if (adaptations.length === 0) {
        adaptations.push("No adaptations needed — output is already compatible with target IDE");
      }

      const result = {
        formatted,
        ide,
        adaptations,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
