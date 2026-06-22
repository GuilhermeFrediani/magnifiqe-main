/**
 * Stack Perfeita MCP — Verification tools
 * File/symbol verification, hallucination detection, groundedness scoring,
 * and incremental diff tracking.
 */

import { z } from "zod";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { readFile, validateAbsolutePath, safeResolvePath } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";
import { PROJECT_ROOT } from "./config.js";

/**
 * Register file/symbol verification tools on the MCP server.
 * Tools: verify_file_sync, detect_hallucination, groundedness_score, diff_since_last
 */
export function registerVerificationTools(server) {
  // ── verify_file_sync ─────────────────────────────────────────────────────
  server.tool(
    "verify_file_sync",
    "Verifies that a file on disk matches expected content. Reads the file, computes its hash, and compares against an optional expected hash. Returns PASS/FAIL with evidence. Use after claiming a file was written or modified.",
    {
      file_path: z.string().describe("Absolute path to the file to verify."),
      expected_hash: z.string().optional().describe("Expected SHA-256 hash (first 16 hex chars). If omitted, just returns the current hash for future comparison."),
      description: z.string().describe("What was expected to be in the file (for context in the report)."),
    },
    async ({ file_path, expected_hash, description }) => {
      const rateLimitHit = rateLimiter.check("verify_file_sync");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const absPath = validateAbsolutePath(file_path);

        if (!existsSync(absPath)) {
          return {
            content: [{ type: "text", text: `FAIL — File does not exist on disk: ${absPath}\nClaim: ${description}` }],
          };
        }

        const content = readFileSync(absPath, "utf-8");
        const actualHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
        const lineCount = content.split("\n").length;

        if (expected_hash) {
          if (actualHash === expected_hash) {
            return {
              content: [{ type: "text", text: `PASS — File matches expected hash.\n- Path: ${absPath}\n- Hash: ${actualHash}\n- Lines: ${lineCount}\n- Claim: ${description}` }],
            };
          }
          return {
            content: [{ type: "text", text: `FAIL — Hash mismatch!\n- Path: ${absPath}\n- Expected: ${expected_hash}\n- Actual: ${actualHash}\n- Lines: ${lineCount}\n- Claim: ${description}\n\nThe file on disk does not match what was claimed.` }],
          };
        }

        return {
          content: [{ type: "text", text: `File verified (no expected hash provided).\n- Path: ${absPath}\n- Current hash: ${actualHash}\n- Lines: ${lineCount}\n- Claim: ${description}\n\nUse this hash for future comparisons.` }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error verifying file: ${e.message}` }] };
      }
    }
  );

  // ── detect_hallucination ─────────────────────────────────────────────────
  server.tool(
    "detect_hallucination",
    "Validates that claimed file paths, imports, and symbols actually exist on disk. Takes an array of claims (file paths, import paths, or symbol references) and checks each one. Returns PASS/FAIL per claim.",
    {
      claims: z.array(z.string()).describe("List of claims to validate (file paths, import paths, or 'file:exportedFunction' references)."),
      project_root: z.string().optional().describe("Project root directory (defaults to detected root)."),
    },
    async ({ claims, project_root }) => {
      const rateLimitHit = rateLimiter.check("detect_hallucination");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const root = project_root || PROJECT_ROOT;
        const results = [];

        for (const claim of claims) {
          const trimmed = claim.trim();
          if (!trimmed) continue;

          // Check if claim is "file:export" format
          const exportMatch = trimmed.match(/^(.+?):(\w+)$/);
          const filePath = exportMatch ? exportMatch[1] : trimmed;
          const exportName = exportMatch ? exportMatch[2] : null;

          // Resolve path
          // Resolve path with containment check
          let absPath;
          try {
            absPath = safeResolvePath(root, filePath);
          } catch {
            results.push({ claim: trimmed, status: "FAIL", reason: `Path traversal detected: ${filePath}` });
            continue;
          }

          // Check file exists
          if (!existsSync(absPath)) {
            results.push({ claim: trimmed, status: "FAIL", reason: `File not found: ${absPath}` });
            continue;
          }

          // If export name specified, check it exists in the file
          if (exportName) {
            const content = readFileSync(absPath, "utf-8");
            // Escape special regex characters to prevent ReDoS
            const safe = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const exportPatterns = [
              new RegExp(`export\\s+(default\\s+)?(async\\s+)?function\\s+${safe}\\b`),
              new RegExp(`export\\s+(default\\s+)?(async\\s+)?const\\s+${safe}\\b`),
              new RegExp(`export\\s+(default\\s+)?class\\s+${safe}\\b`),
              new RegExp(`export\\s+\\{[^}]*\\b${safe}\\b[^}]*\\}`),
              new RegExp(`module\\.exports\\s*=.*\\b${safe}\\b`),
              new RegExp(`exports\\.${safe}\\s*=`),
            ];

            const found = exportPatterns.some((p) => p.test(content));
            if (!found) {
              results.push({ claim: trimmed, status: "FAIL", reason: `Export '${exportName}' not found in ${absPath}` });
              continue;
            }
          }

          results.push({ claim: trimmed, status: "PASS", reason: exportName ? `File and export '${exportName}' found` : "File found" });
        }

        const passCount = results.filter((r) => r.status === "PASS").length;
        const failCount = results.filter((r) => r.status === "FAIL").length;
        const verdict = failCount === 0 ? "PASS" : "FAIL";

        const lines = [
          `HALLUCINATION CHECK: ${verdict}`,
          `- Claims checked: ${results.length}`,
          `- Passed: ${passCount}`,
          `- Failed: ${failCount}`,
          "",
          ...results.map((r) => `${r.status} — ${r.claim}: ${r.reason}`),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error checking hallucinations: ${e.message}` }] };
      }
    }
  );

  // ── groundedness_score ───────────────────────────────────────────────────
  server.tool(
    "groundedness_score",
    "Scores how grounded a response is in verifiable facts. Checks for file references, code claims, and test assertions against the actual filesystem. Returns a 0-10 groundedness score.",
    {
      text: z.string().describe("Response text to score for groundedness."),
      project_root: z.string().optional().describe("Project root directory."),
    },
    async ({ text, project_root }) => {
      const rateLimitHit = rateLimiter.check("groundedness_score");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const root = project_root || PROJECT_ROOT;
        let score = 10; // Start at max, deduct for ungrounded claims
        const issues = [];

        // Extract file path claims (paths ending in common extensions)
        const fileClaims = text.match(/(?:file|path|created|wrote|modified|updated)\s+[:=]?\s*[`"']?([^\s`"']+\.(js|ts|jsx|tsx|py|json|md|css|html))[`"']?/gi) || [];
        for (const claim of fileClaims) {
          const pathMatch = claim.match(/([^\s`"':]+\.(js|ts|jsx|tsx|py|json|md|css|html))/i);
          if (pathMatch) {
            const absPath = resolve(root, pathMatch[1]);
            if (!existsSync(absPath)) {
              score -= 1;
              issues.push(`Referenced file not found: ${pathMatch[1]}`);
            }
          }
        }

        // Check for test claims
        const testClaims = text.match(/(?:test|tests?)\s+(?:pass|passed|green|✅|all\s+pass)/gi) || [];
        if (testClaims.length > 0) {
          // Don't deduct, but note that test claims are unverified
          issues.push(`${testClaims.length} test claim(s) detected — verify with run_test_and_report`);
        }

        // Check for export/function claims
        const exportClaims = text.match(/export(?:ed)?\s+(?:function|const|class|default)\s+(\w+)/gi) || [];
        for (const claim of exportClaims) {
          const nameMatch = claim.match(/export(?:ed)?\s+(?:function|const|class|default)\s+(\w+)/i);
          if (nameMatch) {
            // Check if any source file exports this name
            const srcFiles = existsSync(resolve(root, "src"))
              ? readdirSync(resolve(root, "src")).filter((f) => /\.(js|ts|jsx|tsx)$/.test(f))
              : [];
            const found = srcFiles.some((f) => {
              const content = readFile(resolve(root, "src", f));
              return content && new RegExp(`export\\s+(default\\s+)?(async\\s+)?(function|const|class)\\s+${nameMatch[1]}\\b`).test(content);
            });
            if (!found) {
              score -= 1;
              issues.push(`Claimed export '${nameMatch[1]}' not found in src/`);
            }
          }
        }

        score = Math.max(0, Math.min(10, score));

        const lines = [
          `GROUNDEDNESS SCORE: ${score}/10`,
          `- Text length: ${text.length} chars`,
          `- File claims checked: ${fileClaims.length}`,
          `- Export claims checked: ${exportClaims.length}`,
          `- Test claims detected: ${testClaims.length}`,
        ];

        if (issues.length > 0) {
          lines.push("", "Issues:", ...issues.map((i) => `  - ${i}`));
        }

        if (score >= 8) {
          lines.push("", "Verdict: HIGH — Response is well-grounded in verifiable facts.");
        } else if (score >= 5) {
          lines.push("", "Verdict: MEDIUM — Some claims could not be verified. Run detect_hallucination for detail.");
        } else {
          lines.push("", "Verdict: LOW — Many unverified claims. Re-check before proceeding.");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error scoring groundedness: ${e.message}` }] };
      }
    }
  );

  // ── diff_since_last ────────────────────────────────────────────────────
  server.tool(
    "diff_since_last",
    "Shows what changed in a file since the last verification. Compares current content hash against a stored hash. Use to track incremental changes.",
    {
      file_path: z.string().describe("Absolute path to the file to check."),
      last_hash: z.string().optional().describe("Hash from the last verification. If omitted, returns current hash for future use."),
    },
    async ({ file_path, last_hash }) => {
      const rateLimitHit = rateLimiter.check("diff_since_last");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const absPath = validateAbsolutePath(file_path);
        if (!existsSync(absPath)) {
          return { content: [{ type: "text", text: `HALT — File not found: ${absPath}` }] };
        }

        const content = readFileSync(absPath, "utf-8");
        const currentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
        const lineCount = content.split("\n").length;

        if (last_hash) {
          if (currentHash === last_hash) {
            return {
              content: [{ type: "text", text: `UNCHANGED — File has not been modified since last check.\\nHash: ${currentHash}\\nLines: ${lineCount}` }],
            };
          }
          return {
            content: [{ type: "text", text: `CHANGED — File has been modified!\\n- Previous: ${last_hash}\\n- Current: ${currentHash}\\n- Lines: ${lineCount}\\n\\nUse this hash for future comparisons.` }],
          };
        }

        return {
          content: [{ type: "text", text: `File snapshot captured.\\nPath: ${absPath}\\nHash: ${currentHash}\\nLines: ${lineCount}\\n\\nStore this hash as last_hash for future diff checks.` }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error checking diff: ${e.message}` }] };
      }
    }
  );
}
