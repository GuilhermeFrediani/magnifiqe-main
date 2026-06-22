/**
 * Stack Perfeita MCP — Output Format Standardization (GAP-10)
 * Standardized output formats by task type.
 * Provides templates, validation, and context-aware transformation.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const TASK_TYPES = ["bug_fix", "feature", "refactor", "review", "docs", "test", "deploy"];
const FORMATS = ["detailed", "concise", "summary"];
const CONTEXTS = ["pr_description", "commit_message", "code_review", "documentation", "slack", "email", "ticket"];

/**
 * Task-specific output templates with sections, required fields, and examples.
 */
const OUTPUT_TEMPLATES = {
  bug_fix: {
    sections: ["Description", "Root Cause", "Fix", "Tests", "Verification"],
    required_fields: ["Description", "Root Cause", "Fix"],
    examples: [
      "Fix null pointer exception in user authentication flow",
      "Resolve race condition in concurrent file uploads",
      "Fix memory leak in WebSocket connection handling"
    ],
    format_rules: {
      detailed: "Include all 5 sections with code snippets and stack traces",
      concise: "3 sections: Description, Fix, Tests",
      summary: "1-2 sentence overview of the issue and resolution"
    }
  },
  feature: {
    sections: ["Requirements", "Implementation", "API Changes", "Documentation", "Testing"],
    required_fields: ["Requirements", "Implementation"],
    examples: [
      "Add user profile customization with avatar upload",
      "Implement real-time notifications via WebSocket",
      "Add batch export functionality for reports"
    ],
    format_rules: {
      detailed: "Full specification with API docs and test cases",
      concise: "Requirements and implementation summary",
      summary: "Feature description in 1-2 sentences"
    }
  },
  refactor: {
    sections: ["Current State", "Proposed Changes", "Benefits", "Risks", "Migration"],
    required_fields: ["Current State", "Proposed Changes", "Benefits"],
    examples: [
      "Refactor authentication module to use JWT tokens",
      "Extract common validation logic into shared utilities",
      "Migrate from callbacks to async/await patterns"
    ],
    format_rules: {
      detailed: "Before/after code comparison with migration guide",
      concise: "Changes and benefits only",
      summary: "High-level refactor description"
    }
  },
  review: {
    sections: ["Summary", "Strengths", "Issues", "Recommendations", "Decision"],
    required_fields: ["Summary", "Issues", "Decision"],
    examples: [
      "Review pull request #142: Add caching layer",
      "Code review for database migration scripts",
      "Architecture review for new microservice"
    ],
    format_rules: {
      detailed: "Line-by-line feedback with code suggestions",
      concise: "Key issues and approval status",
      summary: "Approve/request changes with top 3 issues"
    }
  },
  docs: {
    sections: ["Overview", "Prerequisites", "Steps", "Examples", "Troubleshooting"],
    required_fields: ["Overview", "Steps"],
    examples: [
      "API endpoint documentation for /users",
      "Setup guide for local development environment",
      "Troubleshooting common deployment errors"
    ],
    format_rules: {
      detailed: "Complete guide with examples and edge cases",
      concise: "Core steps without examples",
      summary: "1-paragraph overview"
    }
  },
  test: {
    sections: ["Test Plan", "Test Cases", "Expected Results", "Coverage", "Notes"],
    required_fields: ["Test Plan", "Test Cases"],
    examples: [
      "Unit tests for payment processing module",
      "Integration tests for user registration flow",
      "Load testing plan for API endpoints"
    ],
    format_rules: {
      detailed: "Full test matrix with edge cases",
      concise: "Key test scenarios",
      summary: "Test coverage summary"
    }
  },
  deploy: {
    sections: ["Change Summary", "Prerequisites", "Deployment Steps", "Rollback Plan", "Verification"],
    required_fields: ["Change Summary", "Deployment Steps", "Rollback Plan"],
    examples: [
      "Deploy v2.3.1 to production environment",
      "Database migration for user schema changes",
      "Hotfix deployment for critical security patch"
    ],
    format_rules: {
      detailed: "Step-by-step with rollback procedures",
      concise: "Steps and rollback only",
      summary: "Deployment scope and risk level"
    }
  }
};

/**
 * Context-specific formatting rules.
 */
const CONTEXT_FORMATS = {
  pr_description: {
    max_length: 4000,
    structure: ["summary", "changes", "testing", "screenshots"],
    conventions: [
      "Use markdown formatting",
      "Start with a summary line",
      "Link related issues",
      "Include before/after if visual changes"
    ],
    template: "## Summary\n{summary}\n\n## Changes\n{changes}\n\n## Testing\n{testing}\n\n## Related Issues\n{issues}"
  },
  commit_message: {
    max_length: 72,
    structure: ["type", "scope", "subject"],
    conventions: [
      "Follow Conventional Commits format",
      "Subject line ≤50 chars",
      "Body wraps at 72 chars",
      "Use imperative mood"
    ],
    template: "{type}({scope}): {subject}"
  },
  code_review: {
    max_length: 2000,
    structure: ["summary", "issues", "suggestions", "decision"],
    conventions: [
      "Be constructive and specific",
      "Reference line numbers",
      "Distinguish blockers from nitpicks",
      "End with clear decision"
    ],
    template: "## Summary\n{summary}\n\n## Issues\n{issues}\n\n## Suggestions\n{suggestions}\n\n## Decision\n{decision}"
  },
  documentation: {
    max_length: 10000,
    structure: ["title", "overview", "content", "examples", "references"],
    conventions: [
      "Use markdown with headers",
      "Include code examples",
      "Add prerequisites section",
      "Cross-reference related docs"
    ],
    template: "# {title}\n\n## Overview\n{overview}\n\n## Content\n{content}\n\n## Examples\n{examples}\n\n## References\n{references}"
  },
  slack: {
    max_length: 4000,
    structure: ["headline", "details", "action_items"],
    conventions: [
      "Use Slack mrkdwn formatting",
      "Keep it scannable",
      "Use bullet points",
      "@mention relevant people"
    ],
    template: "*{headline}*\n\n{details}\n\n• Action Items:\n{action_items}"
  },
  email: {
    max_length: 6000,
    structure: ["subject", "greeting", "body", "closing", "signature"],
    conventions: [
      "Professional tone",
      "Clear subject line",
      "Paragraphs for readability",
      "Call to action in closing"
    ],
    template: "Subject: {subject}\n\n{greeting}\n\n{body}\n\n{closing}\n\n{signature}"
  },
  ticket: {
    max_length: 3000,
    structure: ["title", "description", "acceptance_criteria", "priority"],
    conventions: [
      "Clear, actionable title",
      "Steps to reproduce if bug",
      "Definition of done",
      "Priority and labels"
    ],
    template: "## {title}\n\n**Description:** {description}\n\n**Acceptance Criteria:**\n{acceptance_criteria}\n\n**Priority:** {priority}"
  }
};

// ─── Formatting Engine ──────────────────────────────────────────────────────

/**
 * Format content according to task type and detail level.
 */
function formatByTaskType(content, taskType, format) {
  const template = OUTPUT_TEMPLATES[taskType];
  if (!template) throw new Error(`Unknown task type: ${taskType}`);

  const sections = template.sections;
  const formatRules = template.format_rules[format];
  let formatted = "";
  let templateUsed = "";

  switch (format) {
    case "detailed":
      formatted = formatDetailed(content, taskType, sections);
      templateUsed = `detailed_${taskType}`;
      break;
    case "concise":
      formatted = formatConcise(content, taskType, template.required_fields);
      templateUsed = `concise_${taskType}`;
      break;
    case "summary":
      formatted = formatSummary(content, taskType);
      templateUsed = `summary_${taskType}`;
      break;
    default:
      throw new Error(`Unknown format: ${format}`);
  }

  return { formatted, template_used: templateUsed };
}

/**
 * Format content in detailed mode with all sections.
 */
function formatDetailed(content, taskType, sections) {
  const lines = content.split("\n").filter(l => l.trim());
  const result = [`# ${taskType.replace("_", " ").toUpperCase()} Report\n`];

  sections.forEach((section, idx) => {
    result.push(`## ${section}\n`);
    if (idx < lines.length) {
      result.push(lines[idx] + "\n");
    } else {
      result.push(`[Section: ${section}]\n`);
    }
  });

  return result.join("\n");
}

/**
 * Format content in concise mode with required fields only.
 */
function formatConcise(content, taskType, requiredFields) {
  const lines = content.split("\n").filter(l => l.trim());
  const result = [`### ${taskType.replace("_", " ").toUpperCase()}\n`];

  requiredFields.forEach((field, idx) => {
    result.push(`**${field}:** ${idx < lines.length ? lines[idx] : "[Not provided]"}\n`);
  });

  return result.join("\n");
}

/**
 * Format content in summary mode.
 */
function formatSummary(content, taskType) {
  const firstLine = content.split("\n").filter(l => l.trim())[0] || content.slice(0, 200);
  return `**${taskType.replace("_", " ").toUpperCase()}:** ${firstLine}\n`;
}

/**
 * Transform content for a specific consumption context.
 */
function adaptToContext(content, context) {
  const formatConfig = CONTEXT_FORMATS[context];
  if (!formatConfig) throw new Error(`Unknown context: ${context}`);

  let adapted = content;
  const changes = [];

  // Truncate if exceeds max length
  if (adapted.length > formatConfig.max_length) {
    adapted = adapted.slice(0, formatConfig.max_length - 20) + "\n\n[Truncated]";
    changes.push(`Truncated to ${formatConfig.max_length} chars`);
  }

  // Apply context-specific transformations
  switch (context) {
    case "pr_description":
      adapted = toPRDescription(adapted);
      changes.push("Formatted as PR description");
      break;
    case "commit_message":
      adapted = toCommitMessage(adapted);
      changes.push("Formatted as commit message");
      break;
    case "code_review":
      adapted = toCodeReview(adapted);
      changes.push("Formatted as code review");
      break;
    case "documentation":
      adapted = toDocumentation(adapted);
      changes.push("Formatted as documentation");
      break;
    case "slack":
      adapted = toSlack(adapted);
      changes.push("Formatted for Slack");
      break;
    case "email":
      adapted = toEmail(adapted);
      changes.push("Formatted as email");
      break;
    case "ticket":
      adapted = toTicket(adapted);
      changes.push("Formatted as ticket");
      break;
  }

  return { adapted, changes };
}

/**
 * Format as PR description.
 */
function toPRDescription(content) {
  const lines = content.split("\n").filter(l => l.trim());
  return `## Summary\n${lines[0] || "No summary provided"}\n\n## Changes\n${lines.slice(1).join("\n") || "[No changes described]"}\n\n## Testing\n- [ ] Unit tests pass\n- [ ] Integration tests pass\n- [ ] Manual testing completed`;
}

/**
 * Format as commit message (Conventional Commits).
 */
function toCommitMessage(content) {
  const firstLine = content.split("\n")[0] || content;
  const subject = firstLine.length > 50 ? firstLine.slice(0, 47) + "..." : firstLine;
  return `feat: ${subject}`;
}

/**
 * Format as code review.
 */
function toCodeReview(content) {
  return `## Code Review\n\n**Summary:**\n${content}\n\n**Recommendation:**\n[ ] Approve\n[ ] Request Changes\n[ ] Comment`;
}

/**
 * Format as documentation.
 */
function toDocumentation(content) {
  return `# Documentation\n\n## Overview\n${content}\n\n## Usage\n[Add usage instructions]\n\n## Examples\n[Add code examples]\n\n## See Also\n[Add related docs]`;
}

/**
 * Format for Slack.
 */
function toSlack(content) {
  const lines = content.split("\n").filter(l => l.trim());
  return `*Update*\n\n${lines.join("\n• ")}\n\n• _Posted automatically_`;
}

/**
 * Format as email.
 */
function toEmail(content) {
  return `Subject: Update\n\nHi Team,\n\n${content}\n\nBest regards`;
}

/**
 * Format as ticket.
 */
function toTicket(content) {
  const firstLine = content.split("\n")[0] || "Task";
  return `## ${firstLine}\n\n**Description:**\n${content}\n\n**Acceptance Criteria:**\n- [ ] Task completed\n- [ ] Tests passing\n- [ ] Documentation updated\n\n**Priority:** Medium`;
}

/**
 * Validate content completeness for a task type.
 */
function validateCompleteness(content, taskType) {
  const template = OUTPUT_TEMPLATES[taskType];
  if (!template) throw new Error(`Unknown task type: ${taskType}`);

  const sections = template.sections;
  const requiredFields = template.required_fields;
  const missingSections = [];
  const suggestions = [];

  // Check for required sections
  requiredFields.forEach(field => {
    const regex = new RegExp(`(?:^|\\n)(?:##?\\s*)?${field}`, "i");
    if (!regex.test(content)) {
      missingSections.push(field);
      suggestions.push(`Add a "${field}" section to your output`);
    }
  });

  // Check content length
  if (content.length < 50) {
    suggestions.push("Content is very short — consider adding more detail");
  }

  // Calculate completeness score
  const totalRequired = requiredFields.length;
  const found = totalRequired - missingSections.length;
  const score = Math.round((found / totalRequired) * 100);

  // Additional suggestions based on task type
  if (taskType === "bug_fix" && !content.includes("test")) {
    suggestions.push("Consider adding test cases for the bug fix");
  }
  if (taskType === "feature" && !content.includes("API")) {
    suggestions.push("Consider documenting API changes");
  }
  if (taskType === "deploy" && !content.includes("rollback")) {
    suggestions.push("Add a rollback plan for safer deployment");
  }

  return {
    complete: missingSections.length === 0,
    missing_sections: missingSections,
    score,
    suggestions
  };
}

/**
 * Count words in content.
 */
function countWords(content) {
  return content.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

/**
 * format_task_output — Format output according to task-specific standards.
 */
function handleFormatTaskOutput({ content, task_type, format }) {
  const halt = rateLimiter.check("format_task_output");
  if (halt) return { content: [{ type: "text", text: halt }] };

  try {
    const { formatted, template_used } = formatByTaskType(content, task_type, format);
    const word_count = countWords(formatted);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ formatted, template_used, word_count }, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `HALT: format_task_output failed — ${err.message}`
      }]
    };
  }
}

/**
 * get_output_template — Return the standard template for a task type.
 */
function handleGetOutputTemplate({ task_type, format }) {
  const halt = rateLimiter.check("get_output_template");
  if (halt) return { content: [{ type: "text", text: halt }] };

  try {
    const template = OUTPUT_TEMPLATES[task_type];
    if (!template) throw new Error(`Unknown task type: ${task_type}`);

    const result = {
      template: template.sections.map(s => `## ${s}\n[Content]\n`).join("\n"),
      sections: template.sections,
      required_fields: template.required_fields,
      examples: template.examples
    };

    if (format) {
      result.format_rules = template.format_rules[format];
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `HALT: get_output_template failed — ${err.message}`
      }]
    };
  }
}

/**
 * validate_output_completeness — Validate output has all required sections.
 */
function handleValidateOutputCompleteness({ content, task_type }) {
  const halt = rateLimiter.check("validate_output_completeness");
  if (halt) return { content: [{ type: "text", text: halt }] };

  try {
    const result = validateCompleteness(content, task_type);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `HALT: validate_output_completeness failed — ${err.message}`
      }]
    };
  }
}

/**
 * adapt_for_context — Adapt output format for different consumption contexts.
 */
function handleAdaptForContext({ content, context }) {
  const halt = rateLimiter.check("adapt_for_context");
  if (halt) return { content: [{ type: "text", text: halt }] };

  try {
    const { adapted, changes } = adaptToContext(content, context);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ adapted, context, changes }, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `HALT: adapt_for_context failed — ${err.message}`
      }]
    };
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Register all output-formats tools on the MCP server.
 * @param {McpServer} server
 */
export function registerOutputFormatsTools(server) {
  // 1. format_task_output
  server.tool(
    "format_task_output",
    "Format output according to task-specific standards. Returns formatted content with template info and word count.",
    {
      content: z.string().min(1).describe("The content to format."),
      task_type: z.enum(TASK_TYPES).describe("Task type: bug_fix, feature, refactor, review, docs, test, or deploy."),
      format: z.enum(FORMATS).describe("Detail level: detailed (all sections), concise (required only), or summary (brief overview).")
    },
    handleFormatTaskOutput,
  );

  // 2. get_output_template
  server.tool(
    "get_output_template",
    "Return the standard template for a task type including sections, required fields, and examples.",
    {
      task_type: z.enum(TASK_TYPES).describe("Task type: bug_fix, feature, refactor, review, docs, test, or deploy."),
      format: z.enum(FORMATS).optional().describe("Optional: Get format-specific rules for this detail level.")
    },
    handleGetOutputTemplate,
  );

  // 3. validate_output_completeness
  server.tool(
    "validate_output_completeness",
    "Validate output has all required sections for a task type. Returns completeness score and suggestions.",
    {
      content: z.string().min(1).describe("The content to validate."),
      task_type: z.enum(TASK_TYPES).describe("Task type to validate against: bug_fix, feature, refactor, review, docs, test, or deploy.")
    },
    handleValidateOutputCompleteness,
  );

  // 4. adapt_for_context
  server.tool(
    "adapt_for_context",
    "Adapt output format for different consumption contexts (PR, commit, review, docs, Slack, email, ticket).",
    {
      content: z.string().min(1).describe("The content to adapt."),
      context: z.enum(CONTEXTS).describe("Target context: pr_description, commit_message, code_review, documentation, slack, email, or ticket.")
    },
    handleAdaptForContext,
  );
}
