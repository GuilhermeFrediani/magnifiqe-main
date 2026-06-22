/**
 * Stack Perfeita MCP — Session Scanner
 * Discovers and parses session data from .claude/ directory.
 * Port of Headroom's scanner.py pattern.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * @typedef {object} SessionData
 * @property {string} source - File path
 * @property {object} state - Parsed JSON state
 * @property {number} toolCalls - Estimated tool call count
 * @property {string[]} errors - Error messages found
 * @property {string[]} halted - HALT responses found
 */

/**
 * Scan .claude/ directory for session data files.
 * @param {string} claudeDir - Path to .claude/ directory
 * @returns {SessionData[]}
 */
export function scanSessions(claudeDir) {
  const sessions = [];
  if (!existsSync(claudeDir)) return sessions;

  const files = readdirSync(claudeDir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = readFileSync(join(claudeDir, file), "utf-8");
      const state = JSON.parse(content);
      sessions.push(parseSessionFile(file, state));
    } catch {
      // Skip unparseable files
    }
  }

  return sessions;
}

function parseSessionFile(filename, state) {
  const session = {
    source: filename,
    state,
    toolCalls: 0,
    errors: [],
    halted: [],
  };

  // Count tool calls and errors from state
  if (state.sessions) {
    for (const s of state.sessions) {
      if (s.positions) session.toolCalls += Object.keys(s.positions).length;
      if (s.reviews) session.toolCalls += s.reviews.length;
      if (s.synthesis) session.toolCalls += 1;
    }
  }

  if (state.last_error) session.errors.push(state.last_error);
  if (state.risks) session.errors.push(...state.risks);

  return session;
}

/**
 * Build a compact digest of session data for LLM analysis.
 * @param {SessionData[]} sessions
 * @param {number} [maxTokens=80000]
 * @returns {string}
 */
export function buildDigest(sessions, maxTokens = 80000) {
  const lines = [`# Session Analysis Digest\n`, `Sessions: ${sessions.length}\n`];

  for (const session of sessions) {
    lines.push(`\n## ${session.source}`);
    lines.push(`Tool calls: ~${session.toolCalls}`);

    if (session.state.objective) {
      lines.push(`Objective: ${session.state.objective}`);
    }

    if (session.errors.length > 0) {
      lines.push(`Errors (${session.errors.length}):`);
      for (const err of session.errors.slice(0, 5)) {
        lines.push(`  - ${String(err).slice(0, 200)}`);
      }
    }

    if (session.state.decisions?.length > 0) {
      lines.push(`Decisions: ${session.state.decisions.length}`);
    }

    if (session.state.next_steps?.length > 0) {
      lines.push(`Next steps: ${session.state.next_steps.slice(0, 3).join("; ")}`);
    }
  }

  const digest = lines.join("\n");
  // Rough token estimation (4 chars per token)
  if (digest.length / 4 > maxTokens) {
    return digest.slice(0, maxTokens * 4) + "\n\n[Digest truncated to token budget]";
  }
  return digest;
}
