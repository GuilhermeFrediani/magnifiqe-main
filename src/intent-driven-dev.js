/**
 * Stack Perfeita MCP — Intent-Driven Development
 * Turns ambiguous requests into structured, verifiable acceptance criteria.
 * Quick Capture for simple changes, Full Brief for complex/risky ones.
 */

import { z } from "zod";

// Risk assessment
const RISK_SIGNALS = {
  security: ["auth", "login", "password", "token", "session", "encrypt", "decrypt", "oauth", "jwt"],
  data: ["database", "migration", "schema", "sql", "query", "insert", "delete", "drop"],
  external: ["api", "webhook", "third-party", "integration", "external"],
  compliance: ["gdpr", "hipaa", "pci", "compliance", "regulation"],
  cost: ["payment", "billing", "subscription", "pricing"]
};

function assessRisk(description) {
  const lower = description.toLowerCase();
  const risks = [];
  for (const [risk, signals] of Object.entries(RISK_SIGNALS)) {
    if (signals.some(s => lower.includes(s))) risks.push(risk);
  }
  return risks;
}

// Detect scope
function detectScope(description) {
  const wordCount = description.split(/\s+/).filter(Boolean).length;
  const hasMultiple = /\b(and|also|additionally|plus|then|after|finally)\b/i.test(description);

  if (wordCount > 80 || (hasMultiple && risks.length > 2)) return "full";
  if (wordCount > 30 || hasMultiple) return "quick";
  return "minimal";
}

export function registerIntentDrivenDevTools(server) {
  server.tool(
    "acceptance_criteria",
    "Transforms an ambiguous feature request into structured acceptance criteria. Returns Goal, Scope (in/out), Assumptions, and numbered ACs with verification methods. For simple changes: Quick Capture (3-7 criteria). For complex/risky changes: Full Brief with Risk Review.",
    {
      description: z.string().describe("The feature request or change description"),
      risk_override: z.array(z.string()).optional().describe("Force specific risk categories (security, data, external, compliance, cost)")
    },
    async ({ description, risk_override }) => {
      const risks = risk_override || assessRisk(description);
      const isComplex = risks.length >= 2 || description.split(/\s+/).length > 50;

      // Generate acceptance criteria based on description
      const criteria = [];

      // Always include happy path
      criteria.push({
        id: "AC-001",
        text: `Main functionality works as described`,
        verification: "Automated test + manual verification",
        priority: "Required"
      });

      // Add based on content
      if (/\b(user|client|customer)\b/i.test(description)) {
        criteria.push({ id: "AC-002", text: "User can complete the workflow end-to-end", verification: "Integration test", priority: "Required" });
      }
      if (/\b(error|fail|invalid|wrong)\b/i.test(description)) {
        criteria.push({ id: "AC-003", text: "Error cases handled gracefully with meaningful messages", verification: "Unit test for each error path", priority: "Required" });
      }
      if (/\b(api|endpoint|route|request)\b/i.test(description)) {
        criteria.push({ id: "AC-004", text: "API contract matches documentation", verification: "Schema validation test", priority: "Important" });
      }
      if (/\b(data|state|persist|save|store)\b/i.test(description)) {
        criteria.push({ id: "AC-005", text: "Data persistence works correctly", verification: "Database test", priority: "Required" });
      }
      if (/\b(performance|fast|slow|optimize)\b/i.test(description)) {
        criteria.push({ id: "AC-006", text: "Performance within acceptable thresholds", verification: "Benchmark test", priority: "Important" });
      }

      // Add generic verification
      criteria.push({ id: `AC-${String(criteria.length + 1).padStart(3, "0")}`, text: "No regressions in existing functionality", verification: "Full test suite passes", priority: "Required" });

      const report = [
        "ACCEPTANCE CRITERIA",
        "═══════════════════════════════════════",
        "",
        "## Goal",
        description.trim(),
        "",
        "## Scope",
        "**In scope:** Core functionality as described",
        "**Out of scope:** Adjacent features not mentioned",
        "",
        risks.length > 0 ? `## Risk Areas\n${risks.map(r => `- ${r.toUpperCase()}`).join("\n")}\n` : "",
        "## Acceptance Criteria",
        ...criteria.map(c => `${c.id}: ${c.text}\n  Verification: ${c.verification}\n  Priority: ${c.priority}`),
        "",
        "═══════════════════════════════════════",
        `Mode: ${isComplex ? "Full Brief" : "Quick Capture"} | Risks: ${risks.length || "none detected"}`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "risk_assessment",
    "Quick risk assessment of a feature request. Identifies security, data, external, compliance, and cost risks. Returns risk level and recommended actions.",
    {
      description: z.string().describe("The feature request to assess")
    },
    async ({ description }) => {
      const risks = assessRisk(description);
      const level = risks.length >= 3 ? "HIGH" : risks.length >= 1 ? "MEDIUM" : "LOW";

      const recommendations = {
        security: "Add security review gate before deployment",
        data: "Add migration rollback plan and data backup",
        external: "Add timeout, retry, and circuit breaker patterns",
        compliance: "Add compliance checklist review",
        cost: "Add cost monitoring and alerting"
      };

      const report = [
        `RISK ASSESSMENT: ${level}`,
        "═══════════════════════════════════════",
        `Detected risks: ${risks.length > 0 ? risks.join(", ") : "none"}`,
        "",
        risks.length > 0 ? risks.map(r => `- ${r.toUpperCase()}: ${recommendations[r]}`).join("\n") : "No specific risks detected. Standard verification applies.",
        "",
        `Recommendation: ${level === "HIGH" ? "Use Full Acceptance Brief with explicit blocking decisions" : level === "MEDIUM" ? "Use Quick Capture with risk-specific ACs" : "Proceed with standard verification"}`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
