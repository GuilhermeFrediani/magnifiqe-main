# src/learn/analyzer.js

- kind: js
- lines: 95
- bytes: 2892

## Summary
Stack Perfeita MCP — Session Analyzer (headroom_learn pattern) Analyzes session data to learn from failures and improve rules. Offline learning loop: collect → digest → analyze → recommend. Port of Headroom's analyzer.py pattern.

## Imports
- `./scanner.js`

## Exports
- `analyzeSessions`
- `getAnalysisPrompt`
- `parseRecommendations`

## Source
```js
/**
 * Stack Perfeita MCP — Session Analyzer (headroom_learn pattern)
 * Analyzes session data to learn from failures and improve rules.
 * Offline learning loop: collect → digest → analyze → recommend.
 * Port of Headroom's analyzer.py pattern.
 */

import { scanSessions, buildDigest } from "./scanner.js";

/**
 * @typedef {object} Recommendation
 * @property {"rules"|"thresholds"|"patterns"} target
 * @property {string} content - What to change
 * @property {string} reason - Why this recommendation
 * @property {number} [estimatedTokensSaved=0]
 */

/**
 * @typedef {object} AnalysisResult
 * @property {Recommendation[]} recommendations
 * @property {number} totalSessions
 * @property {number} totalToolCalls
 * @property {number} totalErrors
 * @property {string} digest - The compact digest used for analysis
 */

const ANALYSIS_SYSTEM_PROMPT = `You are analyzing MCP server sessions to learn from failures and improve rules.
Look for:
1. Patterns in HALT responses — which rules trigger most often
2. Repeated errors — systemic issues that need new rules
3. Token waste — which tool outputs are consistently too large
4. Council gate accuracy — are low-complexity tasks being over-deliberated
5. Compression effectiveness — which content types benefit most from compression

Output a JSON array of recommendations. Each recommendation has:
- target: "rules" | "thresholds" | "patterns"
- content: what to change
- reason: why
- estimatedTokensSaved: number

Be specific and actionable. Focus on the top 3-5 highest-impact changes.`;

/**
 * Analyze sessions and produce recommendations.
 * @param {string} claudeDir - Path to .claude/ directory
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=80000]
 * @returns {AnalysisResult}
 */
export function analyzeSessions(claudeDir, opts = {}) {
  const sessions = scanSessions(claudeDir);
  const digest = buildDigest(sessions, opts.maxTokens);

  let totalToolCalls = 0;
  let totalErrors = 0;

  for (const s of sessions) {
    totalToolCalls += s.toolCalls;
    totalErrors += s.errors.length;
  }

  return {
    recommendations: [], // Populated by LLM analysis step
    totalSessions: sessions.length,
    totalToolCalls,
    totalErrors,
    digest,
  };
}

/**
 * Generate the system prompt for LLM analysis.
 * @returns {string}
 */
export function getAnalysisPrompt() {
  return ANALYSIS_SYSTEM_PROMPT;
}

/**
 * Parse LLM response into structured recommendations.
 * @param {string} llmResponse - JSON array from LLM
 * @returns {Recommendation[]}
 */
export function parseRecommendations(llmResponse) {
  try {
    // Extract JSON from possible markdown fences
    const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.filter(r => r.target && r.content && r.reason);
  } catch {
    return [];
  }
}

```
