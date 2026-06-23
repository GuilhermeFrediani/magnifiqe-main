/**
 * Stack Perfeita MCP — Task-Specific Quality Checklists (GAP-4)
 * Pre-defined quality checklists for 9 task types.
 * get_task_checklist — returns checklist for a task type
 * validate_checklist — validates completion against checklist
 * generate_completion_report — generates markdown completion report
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Checklist Data ─────────────────────────────────────────────────────────

const TASK_CHECKLISTS = {
  frontend: [
    { id: "fe-1",  item: "Responsive design verified at 320px, 768px, 1024px, 1440px",          priority: "critical", category: "UX",              verification_method: "Browser resize or devtools responsive mode" },
    { id: "fe-2",  item: "WCAG 2.1 AA accessibility compliance",                                  priority: "high",     category: "Accessibility",  verification_method: "Screen reader test, keyboard navigation, axe audit" },
    { id: "fe-3",  item: "Cross-browser testing (Chrome, Firefox, Safari, Edge)",                 priority: "high",     category: "Compatibility", verification_method: "Manual or BrowserStack/Sauce Labs" },
    { id: "fe-4",  item: "Interactive elements have visible focus indicators",                    priority: "critical", category: "Accessibility",  verification_method: "Tab through all interactive elements" },
    { id: "fe-5",  item: "Color contrast meets 4.5:1 ratio for text, 3:1 for large text",         priority: "high",     category: "Accessibility",  verification_method: "axe-core or Lighthouse audit" },
    { id: "fe-6",  item: "All images have meaningful alt text or decorative alt=\"\"",             priority: "high",     category: "Accessibility",  verification_method: "DOM inspection, screen reader" },
    { id: "fe-7",  item: "Loading states and error boundaries implemented",                       priority: "critical", category: "UX",              verification_method: "Simulate slow network and error scenarios" },
    { id: "fe-8",  item: "No console errors or warnings in production build",                     priority: "high",     category: "Quality",        verification_method: "Browser console inspection in prod build" },
    { id: "fe-9",  item: "Form inputs have associated labels and validation messages",            priority: "critical", category: "Accessibility",  verification_method: "HTML audit, screen reader" },
    { id: "fe-10", item: "Meta viewport and lang attributes set correctly",                       priority: "medium",   category: "SEO",            verification_method: "Inspect HTML head" },
    { id: "fe-11", item: "Bundle size within budget — no unexpected large dependencies",          priority: "medium",   category: "Performance",    verification_method: "Bundle analyzer, Lighthouse" },
    { id: "fe-12", item: "Images optimized (WebP/AVIF, lazy loading, srcset)",                    priority: "medium",   category: "Performance",    verification_method: "Network tab, Lighthouse audit" },
  ],

  backend: [
    { id: "be-1",  item: "Input validation on all external-facing endpoints",                     priority: "critical", category: "Security",       verification_method: "Send malformed/missing params, verify rejection" },
    { id: "be-2",  item: "Authentication and authorization enforced on protected routes",         priority: "critical", category: "Security",       verification_method: "Request without/with invalid token, verify 401/403" },
    { id: "be-3",  item: "SQL queries use parameterized statements (no string concatenation)",    priority: "critical", category: "Security",       verification_method: "Code review, SQL injection test payloads" },
    { id: "be-4",  item: "Error responses return appropriate status codes, not 200",              priority: "high",     category: "API Design",     verification_method: "Test error scenarios, verify HTTP status" },
    { id: "be-5",  item: "Rate limiting applied to public endpoints",                             priority: "high",     category: "Security",       verification_method: "Rapid-fire requests, verify throttling" },
    { id: "be-6",  item: "Sensitive data not logged (passwords, tokens, PII)",                    priority: "critical", category: "Security",       verification_method: "Log inspection, grep for patterns" },
    { id: "be-7",  item: "Database connections properly pooled and closed",                       priority: "high",     category: "Reliability",    verification_method: "Monitor connection count under load" },
    { id: "be-8",  item: "Timeouts configured for external service calls",                        priority: "high",     category: "Reliability",    verification_method: "Simulate slow downstream, verify timeout behavior" },
    { id: "be-9",  item: "Graceful shutdown handles in-flight requests",                          priority: "medium",   category: "Reliability",    verification_method: "Send SIGTERM during active request" },
    { id: "be-10", item: "Health check endpoint returns service status",                          priority: "medium",   category: "Observability",  verification_method: "GET /health returns 200 with status info" },
    { id: "be-11", item: "Pagination implemented for list endpoints",                             priority: "high",     category: "API Design",     verification_method: "Query large dataset, verify page limiting" },
    { id: "be-12", item: "CORS configured with explicit allowed origins",                         priority: "high",     category: "Security",       verification_method: "Request from different origin, verify header" },
    { id: "be-13", item: "Request body size limits enforced",                                    priority: "medium",   category: "Security",       verification_method: "Send oversized payload, verify rejection" },
  ],

  debug: [
    { id: "db-1",  item: "Root cause identified and documented",                                  priority: "critical", category: "Analysis",       verification_method: "Written explanation of why the bug occurs" },
    { id: "db-2",  item: "Reproduction steps defined and verified",                               priority: "critical", category: "Process",        verification_method: "Follow steps to reliably trigger the bug" },
    { id: "db-3",  item: "Fix addresses root cause, not symptom",                                 priority: "critical", category: "Quality",        verification_method: "Code review — does fix target the actual origin?" },
    { id: "db-4",  item: "Regression test added or updated",                                      priority: "critical", category: "Testing",        verification_method: "Run test suite — new test passes, no regressions" },
    { id: "db-5",  item: "Edge cases considered and tested",                                      priority: "high",     category: "Quality",        verification_method: "Test boundary values and null/undefined inputs" },
    { id: "db-6",  item: "No unrelated code changes introduced",                                  priority: "high",     category: "Process",        verification_method: "Diff review — only relevant files changed" },
    { id: "db-7",  item: "Related error paths checked for same bug pattern",                      priority: "medium",   category: "Quality",        verification_method: "Search for similar patterns in codebase" },
    { id: "db-8",  item: "Debug logging removed or gated behind debug flag",                      priority: "medium",   category: "Quality",        verification_method: "Grep for leftover console.log, debug print statements" },
    { id: "db-9",  item: "Performance impact of fix verified (no regressions)",                   priority: "medium",   category: "Performance",    verification_method: "Benchmark before/after if touching hot path" },
    { id: "db-10", item: "Bug ticket updated with root cause, fix, and test references",          priority: "high",     category: "Process",        verification_method: "Ticket contains all three sections" },
  ],

  refactor: [
    { id: "rf-1",  item: "All existing tests pass after refactor",                                priority: "critical", category: "Quality",        verification_method: "Run full test suite, zero failures" },
    { id: "rf-2",  item: "No public API signatures changed without migration path",               priority: "critical", category: "Compatibility", verification_method: "Check exports, compare with callers" },
    { id: "rf-3",  item: "Code complexity reduced (lower cyclomatic complexity)",                 priority: "high",     category: "Quality",        verification_method: "Measure complexity before/after" },
    { id: "rf-4",  item: "Duplicated code eliminated",                                            priority: "high",     category: "Quality",        verification_method: "No identical or near-identical blocks remain" },
    { id: "rf-5",  item: "Naming improved — no more temp vars (a, x, tmp, data)",                 priority: "medium",   category: "Readability",    verification_method: "Code review — all names convey intent" },
    { id: "rf-6",  item: "Function/method signatures reduced to ≤4 parameters",                   priority: "medium",   category: "Readability",    verification_method: "Count params on each function" },
    { id: "rf-7",  item: "Dead code and unused imports removed",                                  priority: "high",     category: "Quality",        verification_method: "Linter warnings, grep for unused references" },
    { id: "rf-8",  item: "Error handling preserved or improved (not weakened)",                    priority: "critical", category: "Reliability",    verification_method: "Verify all try/catch and error paths still function" },
    { id: "rf-9",  item: "Performance benchmarks within 5% of pre-refactor baseline",             priority: "medium",   category: "Performance",    verification_method: "Run benchmarks, compare p95 latency" },
    { id: "rf-10", item: "Single Responsibility Principle respected per module/class",            priority: "high",     category: "Architecture",   verification_method: "Review each file — one reason to change" },
    { id: "rf-11", item: "Refactor scope limited — no feature changes bundled in",                priority: "high",     category: "Process",        verification_method: "Commit message and diff review" },
  ],

  api: [
    { id: "ap-1",  item: "Request/response schemas defined with validation",                      priority: "critical", category: "Contract",       verification_method: "Zod/JSON Schema validates all inputs" },
    { id: "ap-2",  item: "OpenAPI/Swagger spec updated to match implementation",                  priority: "high",     category: "Documentation",  verification_method: "Spec matches actual endpoints, params, responses" },
    { id: "ap-3",  item: "Consistent error response format (error code, message, details)",       priority: "critical", category: "Contract",       verification_method: "All error paths return same envelope" },
    { id: "ap-4",  item: "Pagination follows cursor or offset/limit standard",                    priority: "high",     category: "Contract",       verification_method: "List endpoints accept and return pagination params" },
    { id: "ap-5",  item: "Versioning strategy implemented (URL path or header)",                  priority: "high",     category: "Architecture",   verification_method: "Old version still works, new version accessible" },
    { id: "ap-6",  item: "Rate limiting headers returned (X-RateLimit-*)",                       priority: "medium",   category: "Operations",     verification_method: "Response includes rate limit headers" },
    { id: "ap-7",  item: "Idempotency keys supported for mutating operations",                   priority: "medium",   category: "Reliability",    verification_method: "Replay same request with same key, no duplicate" },
    { id: "ap-8",  item: "CORS preflight handled for browser clients",                            priority: "high",     category: "Compatibility", verification_method: "OPTIONS request returns correct headers" },
    { id: "ap-9",  item: "Authentication mechanism documented and tested",                        priority: "critical", category: "Security",       verification_method: "Request without auth returns 401 with WWW-Authenticate" },
    { id: "ap-10", item: "Response times within SLA (< 200ms for simple queries)",                priority: "medium",   category: "Performance",    verification_method: "Measure p95 latency under expected load" },
    { id: "ap-11", item: "Backwards compatibility verified for existing consumers",               priority: "high",     category: "Compatibility", verification_method: "Run existing client tests against new version" },
    { id: "ap-12", item: "GraphQL: query depth and complexity limits enforced",                    priority: "medium",   category: "Security",       verification_method: "Send deeply nested query, verify rejection" },
  ],

  database: [
    { id: "dc-1",  item: "Migration is reversible (up and down)",                                  priority: "critical", category: "Reliability",    verification_method: "Run migration up then down, verify clean state" },
    { id: "dc-2",  item: "Indexes added for new query patterns",                                   priority: "critical", category: "Performance",    verification_method: "EXPLAIN ANALYZE on representative queries" },
    { id: "dc-3",  item: "No N+1 queries introduced",                                              priority: "critical", category: "Performance",    verification_method: "Query log count under load, compare before/after" },
    { id: "dc-4",  item: "Foreign key constraints and cascading rules defined",                    priority: "high",     category: "Integrity",      verification_method: "Verify referential integrity with test data" },
    { id: "dc-5",  item: "Data types appropriate (no oversized VARCHAR, correct INT width)",        priority: "medium",   category: "Performance",    verification_method: "Schema review, column type audit" },
    { id: "dc-6",  item: "NULL handling defined for nullable columns",                             priority: "high",     category: "Integrity",      verification_method: "Application code handles NULL correctly" },
    { id: "dc-7",  item: "Backward-compatible schema change (no breaking column drops)",           priority: "critical", category: "Compatibility", verification_method: "Existing code still works with new schema" },
    { id: "dc-8",  item: "Migration tested with production-like data volume",                     priority: "high",     category: "Reliability",    verification_method: "Run on staging with representative row counts" },
    { id: "dc-9",  item: "Transaction boundaries correct (atomic multi-step operations)",          priority: "critical", category: "Integrity",      verification_method: "Kill process mid-transaction, verify rollback" },
    { id: "dc-10", item: "Backup and restore procedure verified",                                  priority: "medium",   category: "Operations",     verification_method: "Restore backup to clean environment, verify integrity" },
    { id: "dc-11", item: "Connection pool sizing appropriate for expected load",                   priority: "medium",   category: "Performance",    verification_method: "Load test, monitor connection count and wait times" },
    { id: "dc-12", item: "Sensitive columns encrypted at rest or masked in logs",                  priority: "critical", category: "Security",       verification_method: "Log inspection, direct DB query for raw values" },
  ],

  testing: [
    { id: "ts-1",  item: "Unit tests cover all new/changed functions",                            priority: "critical", category: "Coverage",       verification_method: "Run coverage report, verify changed lines ≥ 90%" },
    { id: "ts-2",  item: "Edge cases tested (empty input, null, boundary values, max length)",    priority: "critical", category: "Coverage",       verification_method: "Review test cases for each boundary condition" },
    { id: "ts-3",  item: "Error paths tested (invalid input, missing fields, network failure)",    priority: "high",     category: "Coverage",       verification_method: "Tests verify error handling, not just happy path" },
    { id: "ts-4",  item: "No flaky tests (deterministic, no time/network dependencies)",           priority: "critical", category: "Reliability",    verification_method: "Run suite 3x — zero intermittent failures" },
    { id: "ts-5",  item: "Test isolation — no shared state between tests",                         priority: "high",     category: "Quality",        verification_method: "Run tests in random order, verify pass" },
    { id: "ts-6",  item: "Test names describe behavior, not implementation",                      priority: "medium",   category: "Readability",    verification_method: "Read test names — each tells what is being verified" },
    { id: "ts-7",  item: "Arrange-Act-Assert pattern followed",                                   priority: "medium",   category: "Readability",    verification_method: "Review test structure for clear AAA separation" },
    { id: "ts-8",  item: "Integration tests cover critical user flows",                            priority: "high",     category: "Coverage",       verification_method: "E2E tests for main workflows pass" },
    { id: "ts-9",  item: "Test data setup does not leak between test files",                       priority: "high",     category: "Quality",        verification_method: "Run subsets independently, no cross-contamination" },
    { id: "ts-10", item: "Mocks are minimal — real behavior preferred over mocked responses",      priority: "medium",   category: "Quality",        verification_method: "Audit mock count, prefer test doubles only when necessary" },
    { id: "ts-11", item: "Performance regression tests included for critical paths",              priority: "medium",   category: "Performance",    verification_method: "Benchmark tests assert latency thresholds" },
    { id: "ts-12", item: "All existing tests still pass (no suppressed or skipped tests)",         priority: "critical", category: "Quality",        verification_method: "Full suite green, zero skip/pending markers" },
  ],

  deployment: [
    { id: "dp-1",  item: "Environment variables documented and set in target environment",        priority: "critical", category: "Operations",     verification_method: "Check env config matches documentation" },
    { id: "dp-2",  item: "Database migrations run successfully in staging",                        priority: "critical", category: "Operations",     verification_method: "Migration completes without errors on staging" },
    { id: "dp-3",  item: "Health check endpoint returns healthy after deploy",                    priority: "critical", category: "Operations",     verification_method: "GET /health returns 200 post-deploy" },
    { id: "dp-4",  item: "Rollback procedure tested and documented",                              priority: "critical", category: "Reliability",    verification_method: "Execute rollback on staging, verify clean reversion" },
    { id: "dp-5",  item: "No breaking changes to running contracts (API, DB, queue)",             priority: "critical", category: "Compatibility", verification_method: "Existing integrations still function" },
    { id: "dp-6",  item: "Monitoring and alerting configured for new features",                   priority: "high",     category: "Observability",  verification_method: "Dashboard/alerts exist for key metrics" },
    { id: "dp-7",  item: "Log aggregation captures application logs",                             priority: "high",     category: "Observability",  verification_method: "New log entries appear in centralized logging" },
    { id: "dp-8",  item: "Resource limits (CPU, memory) set and appropriate",                     priority: "high",     category: "Operations",     verification_method: "Container/k8s resource requests and limits defined" },
    { id: "dp-9",  item: "Feature flags for gradual rollout (if applicable)",                     priority: "medium",   category: "Operations",     verification_method: "Feature can be toggled without redeploy" },
    { id: "dp-10", item: "CI/CD pipeline passes all stages (lint, test, build, security scan)",   priority: "critical", category: "Quality",        verification_method: "Pipeline green in target branch" },
    { id: "dp-11", item: "Secrets injected via secret manager, not hardcoded",                    priority: "critical", category: "Security",       verification_method: "No secrets in code, config, or env dump" },
    { id: "dp-12", item: "Load balancer health check intervals and thresholds configured",        priority: "medium",   category: "Operations",     verification_method: "LB config verified for correct path and timing" },
    { id: "dp-13", item: "Static assets served via CDN with proper cache headers",                priority: "medium",   category: "Performance",    verification_method: "Verify cache-control, Content-Length headers" },
  ],

  security: [
    { id: "sc-1",  item: "No hardcoded secrets, tokens, or API keys in source",                   priority: "critical", category: "Secrets",        verification_method: "Grep for common patterns (password=, key=, token=, secret=)" },
    { id: "sc-2",  item: "Input sanitization prevents XSS (output encoding, CSP headers)",         priority: "critical", category: "XSS",            verification_method: "Inject script tags, verify encoded/blocked" },
    { id: "sc-3",  item: "SQL injection prevention via parameterized queries",                     priority: "critical", category: "Injection",      verification_method: "Code review + SQLi payloads in input fields" },
    { id: "sc-4",  item: "Authentication tokens have appropriate expiry and are refreshed",        priority: "critical", category: "Auth",           verification_method: "Check token TTL, verify refresh flow" },
    { id: "sc-5",  item: "CSRF protection on state-changing endpoints",                           priority: "critical", category: "CSRF",           verification_method: "Submit cross-origin form without token, verify rejection" },
    { id: "sc-6",  item: "Security headers set (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)", priority: "high", category: "Headers",    verification_method: "curl -I, verify all security headers present" },
    { id: "sc-7",  item: "Dependency vulnerability scan passes (no critical/high CVEs)",          priority: "critical", category: "Supply Chain",   verification_method: "npm audit / pip-audit / cargo audit, zero critical" },
    { id: "sc-8",  item: "File upload validates type, size, and content (not just extension)",     priority: "high",     category: "Upload",         verification_method: "Upload renamed executable, oversized file, verify rejection" },
    { id: "sc-9",  item: "Sensitive data encrypted in transit (TLS 1.2+) and at rest",            priority: "critical", category: "Encryption",     verification_method: "Check TLS version, verify DB encryption config" },
    { id: "sc-10", item: "Error messages do not leak stack traces or internal paths",              priority: "high",     category: "Information",    verification_method: "Trigger error, verify response has no stack/internal info" },
    { id: "sc-11", item: "Logging does not capture passwords, tokens, or PII",                    priority: "critical", category: "Privacy",        verification_method: "Inspect log output for sensitive patterns" },
    { id: "sc-12", item: "Rate limiting on authentication and high-value endpoints",               priority: "high",     category: "Brute Force",    verification_method: "Rapid login attempts, verify lockout/throttle" },
    { id: "sc-13", item: "Principle of least privilege enforced (permissions, DB roles)",          priority: "high",     category: "Authorization",  verification_method: "Test operations with minimal-permission account" },
    { id: "sc-14", item: "Audit trail for privileged operations (admin actions, data access)",     priority: "medium",   category: "Audit",          verification_method: "Perform admin action, verify audit log entry" },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getChecklist(taskType) {
  return TASK_CHECKLISTS[taskType] || null;
}

function computeStats(checklist) {
  const criticalCount = checklist.filter((i) => i.priority === "critical").length;
  return { total_items: checklist.length, critical_count: criticalCount };
}

const VALID_TASK_TYPES = Object.keys(TASK_CHECKLISTS);

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerTaskChecklistsTools(server) {
  // 1. get_task_checklist
  server.tool(
    "get_task_checklist",
    "Returns a quality checklist for a specific task type. Each item includes id, description, priority, category, and verification method.",
    {
      task_type: z
        .enum(VALID_TASK_TYPES)
        .describe(`Task type: ${VALID_TASK_TYPES.join(", ")}`),
      project_context: z
        .string()
        .optional()
        .describe("Optional project context for checklist customization"),
    },
    async ({ task_type, project_context }) => {
      const rateLimitHit = rateLimiter.check("get_task_checklist");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const checklist = getChecklist(task_type);
        if (!checklist) {
          return {
            content: [
              {
                type: "text",
                text: `HALT — Unknown task_type "${task_type}". Valid types: ${VALID_TASK_TYPES.join(", ")}`,
              },
            ],
          };
        }

        const stats = computeStats(checklist);

        // If project_context provided, append a contextual note item
        const items = [...checklist];
        if (project_context) {
          items.push({
            id: `${task_type.slice(0, 2)}-ctx`,
            item: `Project-specific: ${project_context}`,
            priority: "medium",
            category: "Project Context",
            verification_method: "Manual review per project requirements",
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                checklist: items,
                total_items: items.length,
                critical_count: stats.critical_count,
                task_type,
                has_context: !!project_context,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `HALT — get_task_checklist error: ${e.message}`,
            },
          ],
        };
      }
    }
  );

  // 2. validate_checklist
  server.tool(
    "validate_checklist",
    "Validates task completion against the quality checklist. Returns score, missing critical/optional items, and recommendations.",
    {
      task_type: z
        .string()
        .describe(`Task type: ${VALID_TASK_TYPES.join(", ")}`),
      completed_items: z
        .array(z.string())
        .describe("List of completed checklist item IDs (e.g. ['fe-1', 'fe-3'])"),
      project_files: z
        .array(z.string())
        .optional()
        .describe("Optional list of project files modified for context-aware recommendations"),
    },
    async ({ task_type, completed_items, project_files }) => {
      const rateLimitHit = rateLimiter.check("validate_checklist");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const checklist = getChecklist(task_type);
        if (!checklist) {
          return {
            content: [
              {
                type: "text",
                text: `HALT — Unknown task_type "${task_type}". Valid types: ${VALID_TASK_TYPES.join(", ")}`,
              },
            ],
          };
        }

        const completedSet = new Set(completed_items);
        const missingCritical = [];
        const missingOptional = [];
        const recommendations = [];

        for (const item of checklist) {
          if (!completedSet.has(item.id)) {
            if (item.priority === "critical") {
              missingCritical.push(`${item.id}: ${item.item}`);
            } else {
              missingOptional.push(`${item.id}: ${item.item}`);
            }
          }
        }

        // Score: critical items weighted 2x, high weighted 1.5x, medium weighted 1x
        const weightMap = { critical: 2, high: 1.5, medium: 1 };
        let totalWeight = 0;
        let earnedWeight = 0;

        for (const item of checklist) {
          const w = weightMap[item.priority] || 1;
          totalWeight += w;
          if (completedSet.has(item.id)) {
            earnedWeight += w;
          }
        }

        const score = totalWeight > 0
          ? Math.round((earnedWeight / totalWeight) * 100)
          : 0;

        // Generate recommendations based on missing items
        if (missingCritical.length > 0) {
          recommendations.push(
            `CRITICAL: ${missingCritical.length} critical item(s) missing — must complete before sign-off.`
          );
        }
        if (missingCritical.length > 0 && missingOptional.length > 0) {
          recommendations.push(
            `Address all critical items first, then complete optional items (${missingOptional.length} remaining).`
          );
        }
        if (score === 100) {
          recommendations.push("All checklist items completed. Ready for sign-off.");
        } else if (score >= 80) {
          recommendations.push(
            "Good progress. Complete remaining items for full compliance."
          );
        } else if (score >= 50) {
          recommendations.push(
            "Partial completion. Review missing critical items before proceeding."
          );
        } else {
          recommendations.push(
            "Significant gaps remain. Prioritize critical items before marking task complete."
          );
        }

        // Context-aware recommendations based on file types
        if (project_files && project_files.length > 0) {
          const cssOrHtmlFiles = project_files.some((f) =>
            /\.(css|scss|less|html|vue|svelte)$/.test(f)
          );
          const pyOrGoFiles = project_files.some((f) =>
            /\.(py|go|rs|java)$/.test(f)
          );
          const sqlFiles = project_files.some((f) => /\.sql$/.test(f));
          const configFiles = project_files.some((f) =>
            /\.(yml|yaml|toml|json|env|ini)$/.test(f)
          );

          if (cssOrHtmlFiles && task_type !== "frontend") {
            recommendations.push(
              "NOTE: CSS/HTML files detected. Consider running frontend checklist (fe-*) for UI changes."
            );
          }
          if (pyOrGoFiles && task_type !== "backend") {
            recommendations.push(
              "NOTE: Backend language files detected. Consider running backend checklist (be-*) for server changes."
            );
          }
          if (sqlFiles && task_type !== "database") {
            recommendations.push(
              "NOTE: SQL files detected. Consider running database checklist (dc-*) for schema changes."
            );
          }
          if (configFiles) {
            recommendations.push(
              "NOTE: Configuration files detected. Verify deployment checklist (dp-*) for environment changes."
            );
          }
        }

        const passed = missingCritical.length === 0;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed,
                score,
                missing_critical: missingCritical,
                missing_optional: missingOptional,
                recommendations,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `HALT — validate_checklist error: ${e.message}`,
            },
          ],
        };
      }
    }
  );

  // 3. generate_completion_report
  server.tool(
    "generate_completion_report",
    "Generates a structured markdown completion report based on the task checklist. Shows pass/fail per item, overall status, and sign-off requirement.",
    {
      task_type: z
        .string()
        .describe(`Task type: ${VALID_TASK_TYPES.join(", ")}`),
      completed_items: z
        .array(z.string())
        .describe("List of completed checklist item IDs"),
      notes: z
        .string()
        .optional()
        .describe("Optional notes to include in the report"),
    },
    async ({ task_type, completed_items, notes }) => {
      const rateLimitHit = rateLimiter.check("generate_completion_report");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const checklist = getChecklist(task_type);
        if (!checklist) {
          return {
            content: [
              {
                type: "text",
                text: `HALT — Unknown task_type "${task_type}". Valid types: ${VALID_TASK_TYPES.join(", ")}`,
              },
            ],
          };
        }

        const completedSet = new Set(completed_items);
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);

        // Score calculation (same as validate_checklist)
        const weightMap = { critical: 2, high: 1.5, medium: 1 };
        let totalWeight = 0;
        let earnedWeight = 0;
        let criticalMissing = 0;
        let totalMissing = 0;

        for (const item of checklist) {
          const w = weightMap[item.priority] || 1;
          totalWeight += w;
          if (completedSet.has(item.id)) {
            earnedWeight += w;
          } else {
            totalMissing++;
            if (item.priority === "critical") criticalMissing++;
          }
        }

        const score = totalWeight > 0
          ? Math.round((earnedWeight / totalWeight) * 100)
          : 100;

        // Determine overall status
        let status;
        if (criticalMissing === 0 && totalMissing === 0) {
          status = "PASS";
        } else if (criticalMissing === 0) {
          status = "WARN";
        } else {
          status = "FAIL";
        }

        const signOffNeeded = status !== "PASS";

        // Build markdown report
        const lines = [];
        lines.push(`# Quality Checklist Report`);
        lines.push(``);
        lines.push(`**Task Type:** ${task_type}`);
        lines.push(`**Generated:** ${now}`);
        lines.push(`**Status:** ${status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : "FAIL"}`);
        lines.push(`**Score:** ${score}/100`);
        lines.push(`**Items Completed:** ${completed_items.length}/${checklist.length}`);
        lines.push(``);

        if (status === "PASS") {
          lines.push(`> All items completed. Task meets quality standards.`);
        } else if (status === "WARN") {
          lines.push(
            `> ${totalMissing} optional item(s) incomplete. Critical items are all satisfied.`
          );
        } else {
          lines.push(
            `> ${criticalMissing} critical item(s) incomplete. Task does NOT meet quality standards.`
          );
        }
        lines.push(``);

        // Group items by category
        const categories = new Map();
        for (const item of checklist) {
          if (!categories.has(item.category)) {
            categories.set(item.category, []);
          }
          categories.get(item.category).push(item);
        }

        for (const [category, items] of categories) {
          lines.push(`## ${category}`);
          lines.push(``);
          lines.push(`| ID | Item | Priority | Status |`);
          lines.push(`|---|---|---|---|`);
          for (const item of items) {
            const done = completedSet.has(item.id);
            const statusIcon = done ? "DONE" : item.priority === "critical" ? "FAIL" : "TODO";
            lines.push(
              `| ${item.id} | ${item.item} | ${item.priority} | ${statusIcon} |`
            );
          }
          lines.push(``);
        }

        // Verification notes for missing items
        if (totalMissing > 0) {
          lines.push(`## Missing Items — Verification Steps`);
          lines.push(``);
          for (const item of checklist) {
            if (!completedSet.has(item.id)) {
              lines.push(`- **${item.id}** (${item.priority}): ${item.verification_method}`);
            }
          }
          lines.push(``);
        }

        // Sign-off section
        if (signOffNeeded) {
          lines.push(`## Sign-Off Required`);
          lines.push(``);
          if (criticalMissing > 0) {
            lines.push(
              `- [ ] All critical items completed and verified`
            );
          }
          if (totalMissing > criticalMissing) {
            lines.push(
              `- [ ] Optional items reviewed and accepted/deferred with justification`
            );
          }
          lines.push(`- [ ] Reviewer sign-off`);
          lines.push(``);
        }

        // Notes
        if (notes) {
          lines.push(`## Notes`);
          lines.push(``);
          lines.push(notes);
          lines.push(``);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                report: lines.join("\n"),
                status,
                sign_off_needed: signOffNeeded,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text",
              text: `HALT — generate_completion_report error: ${e.message}`,
            },
          ],
        };
      }
    }
  );
}
