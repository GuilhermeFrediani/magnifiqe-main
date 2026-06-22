/**
 * Stack Perfeita MCP — Watchdog tools
 * Output dedup tracking, session watchdog timing, test execution monitoring,
 * and session health diagnostics.
 */

import { z } from "zod";
import { execFileSync } from "child_process";
import { validateAbsolutePath } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";
import { PROJECT_ROOT } from "./config.js";
import { trackOutput, checkOutputOnly, getDedupStats } from "./safety-guards.js";

// ─── Session watchdog tracking ───────────────────────────────────────────────
const toolTimings = {};
const WATCHDOG_TIMEOUT_MS = 30_000;

function startToolTiming(toolName) {
  toolTimings[toolName] = { start: Date.now(), violations: 0 };
}

function endToolTiming(toolName) {
  const t = toolTimings[toolName];
  if (!t) return null;
  const duration = Date.now() - t.start;
  delete toolTimings[toolName];
  return { duration, exceeded: duration > WATCHDOG_TIMEOUT_MS };
}

/**
 * Register output monitoring and timing tools on the MCP server.
 * Tools: detect_output_dedup, session_watchdog, session_health, run_test_and_report
 */
export function registerWatchdogTools(server) {
  // ── run_test_and_report ──────────────────────────────────────────────────
  server.tool(
    "run_test_and_report",
    "Runs a test command and returns structured results (pass/fail count, errors). Spawns the process, captures output, and parses test results. Use to verify claims that tests pass.",
    {
      command: z.string().optional().describe("Shell command to run tests (e.g. 'npm test', 'pytest')."),
      test_path: z.string().optional().describe("Path to a specific test file. If command is omitted, runs 'node --test <test_path>'."),
      timeout_ms: z.number().optional().default(30000).describe("Timeout in milliseconds (default 30s)."),
    },
    async ({ command, test_path, timeout_ms }) => {
      const rateLimitHit = rateLimiter.check("run_test_and_report");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        let cmdArray;
        let cmdLabel;
        if (command) {
          // Split command into array to avoid shell injection via execSync
          cmdArray = command.split(/\s+/).filter(Boolean);
          cmdLabel = command;
        } else if (test_path) {
          const absTestPath = validateAbsolutePath(test_path);
          cmdArray = ["node", "--test", absTestPath];
          cmdLabel = `node --test "${absTestPath}"`;
        }
        if (!cmdArray) {
          return { content: [{ type: "text", text: "HALT — Provide either 'command' or 'test_path'." }] };
        }

        const timeout = Math.min(timeout_ms || 30000, 60000);
        let output = "";
        let exitCode = 0;

        try {
          output = execFileSync(cmdArray[0], cmdArray.slice(1), {
            cwd: PROJECT_ROOT,
            timeout,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          });
        } catch (e) {
          output = (e.stdout || "") + "\n" + (e.stderr || "");
          exitCode = e.status || 1;
        }

        // Parse TAP output for pass/fail counts
        const passMatches = output.match(/^# ok \d+/gm) || [];
        const failMatches = output.match(/^# not ok \d+/gm) || [];
        const passCount = passMatches.length;
        const failCount = failMatches.length;

        // Parse summary line
        const summaryMatch = output.match(/# tests (\d+).*# pass (\d+).*# fail (\d+)/s);
        const totalTests = summaryMatch ? parseInt(summaryMatch[1]) : passCount + failCount;
        const totalPass = summaryMatch ? parseInt(summaryMatch[2]) : passCount;
        const totalFail = summaryMatch ? parseInt(summaryMatch[3]) : failCount;

        const verdict = totalFail === 0 ? "PASS" : "FAIL";
        const lines = [
          `TEST RESULT: ${verdict}`,
          `- Command: ${cmdLabel}`,
          `- Exit code: ${exitCode}`,
          `- Total: ${totalTests}, Pass: ${totalPass}, Fail: ${totalFail}`,
        ];

        if (totalFail > 0) {
          // Extract failure details
          const failLines = output.split("\n").filter((l) => l.includes("not ok") || l.includes("error:") || l.includes("Error:"));
          if (failLines.length > 0) {
            lines.push("", "Failures:", ...failLines.slice(0, 10).map((l) => `  ${l.trim()}`));
          }
        }

        lines.push("", "Output (last 500 chars):", output.slice(-500));

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error running tests: ${e.message}` }] };
      }
    }
  );

  // ── detect_output_dedup ──────────────────────────────────────────────────
  server.tool(
    "detect_output_dedup",
    "Tracks output hashes and detects repeated identical outputs. Call this tool with each significant response to build a history. Returns DETECTED if the same output has been seen before.",
    {
      text: z.string().describe("Output text to track for duplicates."),
      action: z.enum(["track", "check"]).default("track").describe("track = record hash and check; check = check only without recording."),
    },
    async ({ text, action }) => {
      try {
        const rateLimitHit = rateLimiter.check("detect_output_dedup");
        if (rateLimitHit) {
          return { content: [{ type: "text", text: rateLimitHit }] };
        }

        if (action === "check") {
          const { hash, isDuplicate } = checkOutputOnly(text);
          const dedupStats = getDedupStats();
          return {
            content: [{ type: "text", text: `OK — Output is ${isDuplicate ? "a DUPLICATE" : "unique"} (hash: ${hash}).\nHistory: ${dedupStats.ringSize} entries tracked.` }],
          };
        }

        const result = trackOutput(text, "detect_output_dedup");
        const { hash, isDuplicate, duplicateCount } = result;

        if (isDuplicate) {
          return {
            content: [{ type: "text", text: `DETECTED — Identical output seen ${duplicateCount} times before.\nHash: ${hash}\nThis suggests the LLM is stuck in a loop or repeating itself.\nRecommendation: Change approach or ask for clarification.` }],
          };
        }

        return {
          content: [{ type: "text", text: `OK — Output is unique (hash: ${hash}).\nHistory: ${duplicateCount} occurrences tracked.` }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — detect_output_dedup failed: ${e.message}` }] };
      }
    }
  );

  // ── session_watchdog ─────────────────────────────────────────────────────
  server.tool(
    "session_watchdog",
    "Monitors tool call timing and detects potential loops or hung operations. Call start before a long operation and end after. Also reports session health statistics.",
    {
      action: z.enum(["start", "end", "status"]).describe("start = begin timing; end = stop timing and report; status = show all active timers."),
      tool_name: z.string().optional().describe("Tool name to track (required for start/end)."),
    },
    async ({ action, tool_name }) => {
      try {
        if (action === "start") {
          if (!tool_name) {
            return { content: [{ type: "text", text: "HALT — 'tool_name' is required for start action." }] };
          }
          startToolTiming(tool_name);
          return {
            content: [{ type: "text", text: `Watchdog started for "${tool_name}". Timeout: ${WATCHDOG_TIMEOUT_MS / 1000}s.` }],
          };
        }

        if (action === "end") {
          if (!tool_name) {
            return { content: [{ type: "text", text: "HALT — 'tool_name' is required for end action." }] };
          }
          const timing = endToolTiming(tool_name);
          if (!timing) {
            return { content: [{ type: "text", text: `No active timer found for "${tool_name}".` }] };
          }

          const verdict = timing.exceeded ? "EXCEEDED" : "OK";
          return {
            content: [{ type: "text", text: `Watchdog ${verdict} for "${tool_name}".\nDuration: ${timing.duration}ms (limit: ${WATCHDOG_TIMEOUT_MS}ms).` }],
          };
        }

        // status
        const active = Object.entries(toolTimings).map(([name, t]) => ({
          name,
          elapsed: Date.now() - t.start,
        }));

        const lines = [
          `Session Watchdog Status`,
          `- Active timers: ${active.length}`,
          `- Timeout: ${WATCHDOG_TIMEOUT_MS / 1000}s`,
          `- Output history: ${getDedupStats().ringSize} entries`,
        ];

        if (active.length > 0) {
          lines.push("", "Active timers:");
          for (const t of active) {
            const status = t.elapsed > WATCHDOG_TIMEOUT_MS ? "EXCEEDED" : "running";
            lines.push(`  - ${t.name}: ${t.elapsed}ms (${status})`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — session_watchdog failed: ${e.message}` }] };
      }
    }
  );

  // ── session_health ─────────────────────────────────────────────────────
  server.tool(
    "session_health",
    "Returns session health diagnostics: tool call counts, error rates, loop detection status, and recommendations. Use to check if the session is healthy or stuck.",
    {},
    async () => {
      const rateLimitHit = rateLimiter.check("session_health");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      // Count tool calls from rate limiter
      const toolCalls = Object.entries(rateLimiter.counters).map(([name, data]) => ({
        name,
        count: data.count,
        recent: (Date.now() - data.start) < 60000,
      }));

      const totalCalls = toolCalls.reduce((sum, t) => sum + t.count, 0);
      const recentCalls = toolCalls.filter((t) => t.recent).length;
      const dedupStats = getDedupStats();
      const duplicateCount = dedupStats.ringSize - dedupStats.uniqueHashes;

      // Health score
      let healthScore = 10;
      const recommendations = [];

      if (totalCalls > 100) {
        healthScore -= 2;
        recommendations.push("High total call count — consider session reset");
      }
      if (duplicateCount > 3) {
        healthScore -= 3;
        recommendations.push("Multiple duplicate outputs detected — LLM may be stuck in a loop");
      }
      if (Object.keys(toolTimings).length > 0) {
        healthScore -= 1;
        recommendations.push(`${Object.keys(toolTimings).length} tool(s) still timing — check for hung operations`);
      }
      if (recentCalls > 50) {
        healthScore -= 2;
        recommendations.push("High call rate in last 60s — possible runaway loop");
      }

      healthScore = Math.max(0, Math.min(10, healthScore));

      const lines = [
        `SESSION HEALTH: ${healthScore}/10`,
        `- Total tool calls: ${totalCalls}`,
        `- Active tool categories: ${recentCalls}`,
        `- Duplicate outputs: ${duplicateCount}`,
        `- Output history: ${dedupStats.ringSize} entries`,
      ];

      if (recommendations.length > 0) {
        lines.push("", "Recommendations:", ...recommendations.map((r) => `  - ${r}`));
      } else {
        lines.push("", "Status: Healthy — no issues detected.");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
