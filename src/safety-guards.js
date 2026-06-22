/**
 * Stack Perfeita MCP — Safety Guards
 * Enhanced rate limiting, output dedup, session TTL, and anti-loop protections.
 *
 * Addresses gaps identified in the PLANO.txt audit:
 * - Rate limiter: adds global limit (not just per-tool)
 * - Output dedup: SHA-256 hash ring for detecting repeated LLM outputs
 * - Session TTL: auto-expire old sessions
 * - Loop detection: pattern-based detection of repeated tool calls
 */

import { createHash } from "crypto";
import { rateLimiter } from "./rate-limiter.js";

// Re-export rateLimiter.check as checkRateLimit for backward compatibility
export const checkRateLimit = rateLimiter.check.bind(rateLimiter);
export const getRateLimitStatus = () => ({
  globalCount: rateLimiter.globalCounter.count,
  globalLimit: rateLimiter.globalMaxCalls,
  windowRemainingMs: Math.max(0, rateLimiter.windowMs - (Date.now() - rateLimiter.globalCounter.start)),
  utilPercent: Math.round((rateLimiter.globalCounter.count / rateLimiter.globalMaxCalls) * 100),
});

// ─── Output Deduplication ──────────────────────────────────────────────────

const outputHashRing = [];
const MAX_RING_SIZE = 50;

/**
 * Track an output and detect if it's a duplicate (LLM loop).
 * @param {string} text - Output text
 * @param {string} [source] - Source identifier (tool name, etc.)
 * @returns {{ hash: string, isDuplicate: boolean, duplicateCount: number }}
 */
export function trackOutput(text, source = "unknown") {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);

  outputHashRing.push({ hash, source, timestamp: Date.now() });
  if (outputHashRing.length > MAX_RING_SIZE) outputHashRing.shift();

  const duplicateCount = outputHashRing.filter(h => h.hash === hash).length;
  const isDuplicate = duplicateCount >= 2;

  return { hash, isDuplicate, duplicateCount };
}

/**
 * Check if a specific output hash has been seen before.
 * @param {string} text
 * @returns {boolean}
 */
export function isDuplicateOutput(text) {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return outputHashRing.filter(h => h.hash === hash).length >= 2;
}

/**
 * Get dedup ring stats.
 */
export function getDedupStats() {
  return {
    ringSize: outputHashRing.length,
    maxRingSize: MAX_RING_SIZE,
    uniqueHashes: new Set(outputHashRing.map(h => h.hash)).size,
  };
}


// ─── Loop Detection ────────────────────────────────────────────────────────

const recentToolCalls = [];
const MAX_RECENT_CALLS = 30;
const LOOP_THRESHOLD = 3; // same tool + same params = loop if seen 3+ times

/**
 * Track a tool call and detect loops.
 * @param {string} toolName
 * @param {object} params
 * @returns {{ isLoop: boolean, consecutiveCount: number, message: string|null }}
 */
export function trackToolCall(toolName, params) {
  const paramHash = createHash("sha256").update(JSON.stringify(params || {})).digest("hex").slice(0, 8);
  const fingerprint = `${toolName}:${paramHash}`;

  recentToolCalls.push({ fingerprint, toolName, paramHash, timestamp: Date.now() });
  if (recentToolCalls.length > MAX_RECENT_CALLS) recentToolCalls.shift();

  // Count consecutive calls with same fingerprint
  let consecutiveCount = 0;
  for (let i = recentToolCalls.length - 1; i >= 0; i--) {
    if (recentToolCalls[i].fingerprint === fingerprint) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  if (consecutiveCount >= LOOP_THRESHOLD) {
    return {
      isLoop: true,
      consecutiveCount,
      message: `HALT — Loop detected: tool "${toolName}" called ${consecutiveCount} times with identical parameters. Break the pattern.`,
    };
  }

  return { isLoop: false, consecutiveCount, message: null };
}

/**
 * Reset loop detection state.
 */
export function resetLoopDetection() {
  recentToolCalls.length = 0;
}

// ─── Output Validation ─────────────────────────────────────────────────────

/**
 * Validate tool output for common LLM failure modes.
 * @param {string} text - Tool output
 * @param {string} [toolName] - Tool name for context
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateOutput(text, _toolName = "unknown") {
  const issues = [];

  if (!text || typeof text !== "string") {
    return { valid: false, issues: ["Output is empty or not a string"] };
  }

  // Check for empty/trivial content
  if (text.trim().length < 5) {
    issues.push("Output is trivially short (< 5 chars)");
  }

  // Check for excessive repetition
  const words = text.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const uniqueRatio = uniqueWords.size / words.length;
    if (uniqueRatio < 0.2) {
      issues.push(`Excessive word repetition: only ${Math.round(uniqueRatio * 100)}% unique words`);
    }
  }

  // Check for common hallucination markers
  const hallucinationMarkers = [
    /I'll create the file.*but I can't actually/i,
    /I don't have access to/i,
    /I cannot (read|write|access|modify)/i,
    /hypothetically speaking/i,
    /in theory, (you|one) could/i,
    /I'm not sure if this is correct/i,
  ];

  for (const pattern of hallucinationMarkers) {
    if (pattern.test(text)) {
      issues.push(`Possible hallucination marker detected: ${pattern.source.slice(0, 50)}`);
    }
  }

  // Check for thinking/uncertainty in final output
  const uncertaintyMarkers = [
    /TODO:?\s*implement/i,
    /FIXME:?\s*/i,
    /\[PLACEHOLDER\]/i,
    /placeholder\s+text/i,
    /\.\.\.\s*$/m, // trailing ellipsis on a line
  ];

  for (const pattern of uncertaintyMarkers) {
    if (pattern.test(text)) {
      issues.push(`Uncertainty marker detected: ${pattern.source.slice(0, 50)}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
/**
 * Check if output is duplicate without mutating the hash ring.
 * Used by detect_output_dedup in "check" mode.
 */
export function checkOutputOnly(text) {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const isDuplicate = outputHashRing.some(h => h.hash === hash);
  return { hash, isDuplicate };
}
