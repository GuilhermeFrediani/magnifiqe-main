/**
 * Stack Perfeita MCP — Eval Harness
 * Eval-Driven Development: define criteria, run evals, track pass@k.
 */

import { z } from "zod";

// In-memory eval store (survives within MCP session)
const evalStore = new Map();

export function registerEvalHarnessTools(server) {
  // Tool 1: Define an eval
  server.tool(
    "eval_define",
    "Defines an evaluation for a feature or task. Creates capability evals (can Claude do X?) and regression evals (does X still work?). Returns the eval definition with unique ID.",
    {
      name: z.string().describe("Short eval name (e.g., 'add-authentication')"),
      type: z.enum(["capability", "regression"]).describe("Type of eval"),
      criteria: z.array(z.string()).describe("List of success criteria (e.g., ['User can register with email', 'Invalid credentials rejected'])"),
      baseline: z.string().optional().describe("Baseline SHA or checkpoint for regression evals")
    },
    async ({ name, type, criteria, baseline }) => {
      const id = `eval-${Date.now()}-${name}`;
      const evalDef = {
        id,
        name,
        type,
        criteria: criteria.map((c, i) => ({ id: `AC-${String(i + 1).padStart(3, "0")}`, text: c, status: "pending" })),
        baseline: baseline || null,
        created: new Date().toISOString(),
        results: []
      };
      evalStore.set(id, evalDef);

      const report = [
        `EVAL DEFINED: ${name}`,
        `ID: ${id}`,
        `Type: ${type}`,
        `Criteria (${criteria.length}):`,
        ...evalDef.criteria.map(c => `  ${c.id}: ${c.text} [${c.status}]`),
        baseline ? `Baseline: ${baseline}` : "",
        `Use eval_run ${id} to execute.`
      ].filter(Boolean).join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  // Tool 2: Run an eval
  server.tool(
    "eval_run",
    "Runs an evaluation by executing each criterion as a shell command check. For capability evals, tests if the criterion can be verified. For regression evals, runs existing tests. Returns pass@k metrics.",
    {
      eval_id: z.string().describe("The eval ID from eval_define"),
      commands: z.array(z.object({
        criterion_id: z.string().describe("AC-XXX criterion ID"),
        check: z.string().describe("Shell command to verify this criterion (exit 0 = pass)")
      })).describe("Verification commands for each criterion"),
      max_attempts: z.number().optional().describe("Max attempts for pass@k calculation (default: 1)")
    },
    async ({ eval_id, commands, max_attempts }) => {
      const evalDef = evalStore.get(eval_id);
      if (!evalDef) return { content: [{ type: "text", text: `Error: Eval ${eval_id} not found. Use eval_define first.` }] };

      const { execSync } = await import("child_process");
      const results = [];
      let passed = 0;

      for (const cmd of commands) {
        const criterion = evalDef.criteria.find(c => c.id === cmd.criterion_id);
        if (!criterion) { results.push({ id: cmd.criterion_id, status: "SKIP", reason: "Unknown criterion" }); continue; }

        let attempts = 0;
        let pass = false;
        while (attempts < (max_attempts || 1) && !pass) {
          attempts++;
          try {
            execSync(cmd.check, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
            pass = true;
          } catch {
            pass = false;
          }
        }

        if (pass) { passed++; criterion.status = "PASS"; }
        else { criterion.status = "FAIL"; }
        results.push({ id: cmd.criterion_id, status: criterion.status, attempts });
      }

      const total = results.length;
      const passAt1 = passed / total;
      const passAtK = max_attempts > 1 ? (passed > 0 ? 1 : 0) : passAt1;

      evalDef.results.push({ timestamp: new Date().toISOString(), passed, total, passAt1, passAtK });

      const report = [
        `EVAL REPORT: ${evalDef.name}`,
        "═══════════════════════════════════════",
        `Type: ${evalDef.type}`,
        ...results.map(r => `  ${r.id}: [${r.status}]${r.attempts > 1 ? ` (${r.attempts} attempts)` : ""}`),
        "",
        "═══════════════════════════════════════",
        `Results: ${passed}/${total} passed`,
        `pass@1: ${(passAt1 * 100).toFixed(1)}%`,
        max_attempts > 1 ? `pass@${max_attempts}: ${(passAtK * 100).toFixed(1)}%` : "",
        `Status: ${passed === total ? "ALL PASS" : "HAS FAILURES"}`
      ].filter(Boolean).join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  // Tool 3: List evals
  server.tool(
    "eval_list",
    "Lists all defined evaluations and their latest results. Shows pass rates and status.",
    {},
    async () => {
      const evals = Array.from(evalStore.values());
      if (evals.length === 0) return { content: [{ type: "text", text: "No evals defined. Use eval_define to create one." }] };

      const report = [
        "EVAL INVENTORY",
        "═══════════════════════════════════════",
        ...evals.map(e => {
          const latest = e.results[e.results.length - 1];
          return [
            `${e.name} (${e.type})`,
            `  ID: ${e.id}`,
            `  Criteria: ${e.criteria.length} | Latest: ${latest ? `${latest.passed}/${latest.total} (${(latest.passAt1 * 100).toFixed(0)}%)` : "not run"}`,
            `  Status: ${e.criteria.every(c => c.status === "PASS") ? "ALL PASS" : e.criteria.some(c => c.status === "FAIL") ? "HAS FAILURES" : "PENDING"}`
          ].join("\n");
        })
      ].join("\n\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
