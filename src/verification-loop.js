/**
 * Stack Perfeita MCP — Verification Loop Pipeline
 * 6-phase verification: Build → TypeCheck → Lint → Test → Security → Diff Review
 * Produces structured PASS/FAIL report.
 */

import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PROJECT_ROOT } from "./config.js";

// Helper to run shell commands safely
function runCmd(cmd, cwd) {
  try {
    const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, output: output.trim() };
  } catch (e) {
    return { ok: false, output: (e.stderr || e.message || "").trim() };
  }
}

// Detect project type from package.json
function detectProjectType(root) {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const has = (name) => name in deps;
    const scripts = pkg.scripts || {};
    return {
      hasBuild: !!scripts.build,
      hasTest: !!scripts.test,
      hasLint: !!scripts.lint,
      hasTypeCheck: has("typescript") || has("ts-node"),
      packageManager: existsSync(resolve(root, "yarn.lock")) ? "yarn" :
                       existsSync(resolve(root, "pnpm-lock.yaml")) ? "pnpm" :
                       existsSync(resolve(root, "bun.lockb")) ? "bun" : "npm",
      language: has("typescript") || has("ts-node") ? "typescript" :
                has("python") ? "python" : "javascript"
    };
  } catch {
    return { hasBuild: false, hasTest: false, hasLint: false, hasTypeCheck: false, packageManager: "npm", language: "unknown" };
  }
}

export function registerVerificationLoopTools(server) {
  server.tool(
    "verification_pipeline",
    "Runs a 6-phase verification pipeline on the current project: Build, TypeCheck, Lint, Test, Security Scan, and Diff Review. Returns a structured PASS/FAIL report with details for each phase. Use before creating a PR or after major changes.",
    {
      project_root: z.string().optional().describe("Project root directory (defaults to configured project root)"),
      phases: z.array(z.enum(["build", "typecheck", "lint", "test", "security", "diff"])).optional().describe("Specific phases to run (defaults to all 6)"),
      fail_fast: z.boolean().optional().describe("Stop on first failure (default: false, run all phases)")
    },
    async ({ project_root, phases, fail_fast }) => {
      const root = project_root || PROJECT_ROOT;
      const projInfo = detectProjectType(root);
      const allPhases = phases || ["build", "typecheck", "lint", "test", "security", "diff"];
      const results = [];
      const pm = projInfo.packageManager;

      for (const phase of allPhases) {
        let result = { phase, status: "SKIP", details: "" };

        switch (phase) {
          case "build": {
            if (!projInfo.hasBuild) { result.details = "No build script found in package.json"; break; }
            const r = runCmd(`${pm} run build 2>&1 | tail -30`, root);
            result.status = r.ok ? "PASS" : "FAIL";
            result.details = r.output.slice(0, 1000);
            break;
          }
          case "typecheck": {
            if (!projInfo.hasTypeCheck) { result.details = "No TypeScript detected"; break; }
            const r = runCmd("npx tsc --noEmit 2>&1 | head -30", root);
            result.status = r.ok ? "PASS" : "FAIL";
            result.details = r.output.slice(0, 1000);
            break;
          }
          case "lint": {
            if (!projInfo.hasLint) { result.details = "No lint script found"; break; }
            const r = runCmd(`${pm} run lint 2>&1 | head -30`, root);
            result.status = r.ok ? "PASS" : "FAIL";
            result.details = r.output.slice(0, 1000);
            break;
          }
          case "test": {
            if (!projInfo.hasTest) { result.details = "No test script found"; break; }
            const r = runCmd(`${pm} test 2>&1 | tail -50`, root);
            result.status = r.ok ? "PASS" : "FAIL";
            result.details = r.output.slice(0, 1500);
            break;
          }
          case "security": {
            // Check for secrets patterns
            const secretPatterns = ["sk-", "api_key", "password", "secret", "token"];
            let found = [];
            try {
              const r = runCmd(`grep -rn "${secretPatterns.join('\\|')}" --include="*.js" --include="*.ts" --include="*.json" src/ 2>/dev/null | head -10`, root);
              if (r.ok && r.output) found = r.output.split("\n").filter(Boolean);
            } catch {}
            // Check for eval usage
            let evalFound = [];
            try {
              const r2 = runCmd(`grep -rn "eval(" --include="*.js" --include="*.ts" src/ 2>/dev/null | head -5`, root);
              if (r2.ok && r2.output) evalFound = r2.output.split("\n").filter(Boolean);
            } catch {}
            const issues = [...found.map(f => `SECRET: ${f}`), ...evalFound.map(f => `EVAL: ${f}`)];
            result.status = issues.length === 0 ? "PASS" : "FAIL";
            result.details = issues.length === 0 ? "No secrets or eval usage detected" : issues.join("\n");
            break;
          }
          case "diff": {
            const r = runCmd("git diff --stat 2>/dev/null || echo 'Not a git repository'", root);
            result.status = "INFO";
            result.details = r.output.slice(0, 500) || "No changes detected";
            break;
          }
        }

        results.push(result);
        if (fail_fast && result.status === "FAIL") break;
      }

      const passed = results.filter(r => r.status === "PASS").length;
      const failed = results.filter(r => r.status === "FAIL").length;
      const skipped = results.filter(r => r.status === "SKIP").length;
      const overall = failed === 0 ? "READY" : "NOT READY";

      const report = [
        "VERIFICATION PIPELINE REPORT",
        "═══════════════════════════════════════",
        `Project: ${root}`,
        `Language: ${projInfo.language} | PM: ${projInfo.packageManager}`,
        "",
        ...results.map(r => `${r.phase.toUpperCase().padEnd(12)} [${r.status}]${r.details ? "\n  " + r.details.split("\n").join("\n  ") : ""}`),
        "",
        "═══════════════════════════════════════",
        `Overall: ${overall} (${passed} passed, ${failed} failed, ${skipped} skipped)`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
