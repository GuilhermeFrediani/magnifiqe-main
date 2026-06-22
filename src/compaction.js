/**
 * Stack Perfeita MCP — Compaction tools
 * compact_conversation_state, compact_logs, compact_diff, promote_summary_to_checkpoint
 * Semantic compaction for long sessions: preserve meaning, discard noise.
 */

import { z } from "zod";
import { loadState, saveState } from "./project-state.js";
import { rateLimiter } from "./rate-limiter.js";

/**
 * Extract error/warning lines from log text.
 * Matches: ERROR, WARN, FAIL, exception, traceback, Error:, panic, FATAL
 */
export function extractErrorsFromLogs(logText, keepErrors = true) {
  const lines = logText.split("\n");
  const errorPattern = /\b(ERROR|WARN|FAIL|FATAL|exception|traceback|Error:|panic|CRITICAL)\b/i;
  const errors = [];
  const summary = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (errorPattern.test(trimmed)) {
      errors.push(trimmed);
    } else {
      summary.push(trimmed);
    }
  }

  const totalLines = lines.filter(l => l.trim()).length;
  const header = `## Log Compaction\n\n- Total lines: ${totalLines}\n- Errors/warnings: ${errors.length}\n- Info lines discarded: ${summary.length}`;

  if (keepErrors && errors.length > 0) {
    return `${header}\n\n### Errors & Warnings\n\`\`\`\n${errors.join("\n")}\n\`\`\``;
  }

  return header;
}

/**
 * Summarize a unified diff: extract changed files and function hunks.
 */
export function summarizeDiff(diffText) {
  const lines = diffText.split("\n");
  const files = [];
  const hunks = [];
  let addCount = 0;
  let delCount = 0;
  let currentFile = null;

  for (const line of lines) {
    // New file
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      files.push(currentFile);
    }
    // Hunk header: @@ -start,count +start,count @@ function
    const hunkMatch = line.match(/^@@\s+[^@]+@@\s*(.*)/);
    if (hunkMatch) {
      const context = hunkMatch[1].trim();
      if (context && currentFile) {
        hunks.push(`${currentFile}: ${context}`);
      }
    }
    // Count additions/deletions
    if (line.startsWith("+") && !line.startsWith("+++")) addCount++;
    if (line.startsWith("-") && !line.startsWith("---")) delCount++;
  }

  const header = `## Diff Compaction\n\n- Files changed: ${files.length}\n- Lines added: +${addCount}\n- Lines removed: -${delCount}`;
  const filesList = files.length > 0 ? `\n\n### Files\n${files.map(f => `- ${f}`).join("\n")}` : "";
  const hunksList = hunks.length > 0 ? `\n\n### Functions/Sections\n${hunks.map(h => `- ${h}`).join("\n")}` : "";

  return `${header}${filesList}${hunksList}`;
}

export function registerCompactionTools(server) {
  // Tool: compact_conversation_state
  server.tool(
    "compact_conversation_state",
    "Saves a structured summary of the current conversation state to project memory, allowing context to be freed. Use before context gets too large or at natural breakpoints.",
    {
      summary: z.string().describe("Concise summary of what happened so far: decisions made, files changed, current status."),
    },
    async ({ summary }) => {
      const rateLimitHit = rateLimiter.check("compact_conversation_state");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        if (!state.compaction_history) state.compaction_history = [];

        const entry = {
          timestamp: new Date().toISOString(),
          summary,
        };

        state.compaction_history.push(entry);
        saveState(state);

        return {
          content: [{
            type: "text",
            text: `Conversation state compacted (${state.compaction_history.length} entries saved).\n\nUse promote_summary_to_checkpoint(label) to create a formal checkpoint from this summary.\n\nLatest summary:\n${summary}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compact_conversation_state: ${e.message}` }] };
      }
    }
  );

  // Tool: compact_logs
  server.tool(
    "compact_logs",
    "Extracts only errors and warnings from log output, discarding informational noise. Use after running tests, builds, or any command that produces verbose output.",
    {
      log_text: z.string().describe("Raw log output to compact."),
      keep_errors: z.boolean().default(true).describe("Keep error/warning lines (true) or just show summary counts (false)."),
    },
    async ({ log_text, keep_errors }) => {
      const rateLimitHit = rateLimiter.check("compact_logs");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const compacted = extractErrorsFromLogs(log_text, keep_errors);
        const savings = log_text.length - compacted.length;

        return {
          content: [{
            type: "text",
            text: `[Compacted ${savings} chars from logs]\n\n${compacted}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compact_logs: ${e.message}` }] };
      }
    }
  );

  // Tool: compact_diff
  server.tool(
    "compact_diff",
    "Summarizes a unified diff showing only changed files, function hunks, and line counts. Use after git diff or reviewing PRs to save context.",
    {
      diff_text: z.string().describe("Raw unified diff text to compact."),
    },
    async ({ diff_text }) => {
      const rateLimitHit = rateLimiter.check("compact_diff");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const compacted = summarizeDiff(diff_text);
        const savings = diff_text.length - compacted.length;

        return {
          content: [{
            type: "text",
            text: `[Compacted ${savings} chars from diff]\n\n${compacted}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compact_diff: ${e.message}` }] };
      }
    }
  );

  // Tool: promote_summary_to_checkpoint
  server.tool(
    "promote_summary_to_checkpoint",
    "Promotes the most recent compact_conversation_state summary into a formal checkpoint. This creates a rollback point from the compacted state.",
    {
      label: z.string().describe("Short label for this checkpoint (e.g., 'after-auth', 'post-refactor')."),
    },
    async ({ label }) => {
      const rateLimitHit = rateLimiter.check("promote_summary_to_checkpoint");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const state = loadState();
        const history = state.compaction_history || [];

        if (history.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No compaction history found. Use compact_conversation_state(summary) first.",
            }],
          };
        }

        const latest = history[history.length - 1];

        // Create checkpoint from current state (same logic as checkpoint_task)
        const { checkpoints: _cp, ...rest } = state;
        const snapshot = JSON.parse(JSON.stringify(rest));

        const checkpoint = {
          label,
          timestamp: new Date().toISOString(),
          snapshot,
          from_compaction: latest.summary,
        };

        state.checkpoints = state.checkpoints || [];
        state.checkpoints.push(checkpoint);
        saveState(state);

        return {
          content: [{
            type: "text",
            text: `Checkpoint promoted: "${label}" from compaction at ${latest.timestamp}.\n\n${state.checkpoints.length} checkpoint(s) total.\n\nUse resume_task(label="${label}") to restore.`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in promote_summary_to_checkpoint: ${e.message}` }] };
      }
    }
  );
}
