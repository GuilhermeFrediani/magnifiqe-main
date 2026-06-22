# src/compression/thresholds.js

- kind: js
- lines: 85
- bytes: 3187

## Summary
Stack Perfeita MCP — Compression Thresholds Evidence-based thresholds from Headroom benchmarks: - 19-32% compression → 97% accuracy (SQuAD v2 / BFCL) - 90%+ compression → viable for code search, SRE debugging - Code search: 17,765 → 1,408 tokens (92% reduction) - SRE debugging: 65,694 → 5,118 tokens (92% reduction)

## Imports
- none

## Exports
- `CompressionLevel`
- `THRESHOLDS`
- `ACCURACY_TARGETS`
- `recommendLevel`
- `evaluateCompressionNeed`

## Source
```js
/**
 * Stack Perfeita MCP — Compression Thresholds
 * Evidence-based thresholds from Headroom benchmarks:
 *   - 19-32% compression → 97% accuracy (SQuAD v2 / BFCL)
 *   - 90%+ compression → viable for code search, SRE debugging
 *   - Code search: 17,765 → 1,408 tokens (92% reduction)
 *   - SRE debugging: 65,694 → 5,118 tokens (92% reduction)
 */

/** Compression levels */
export const CompressionLevel = {
  NONE: 0,
  LOSSLESS: 1,     // strip comments, collapse whitespace
  STRUCTURAL: 2,   // clip head/tail, preserve markers
  SEMANTIC: 3,     // extract key points, drop redundancy
  AGGRESSIVE: 4,   // drop entire sections by priority
};

/** Token thresholds for automatic compression trigger */
export const THRESHOLDS = {
  /** Apply lossless compression above this token count */
  LOSSLESS_TRIGGER: 10_000,
  /** Apply structural compression above this token count */
  STRUCTURAL_TRIGGER: 30_000,
  /** Apply semantic compression above this token count */
  SEMANTIC_TRIGGER: 100_000,
  /** Percentage of context window that triggers alert */
  CONTEXT_WINDOW_ALERT: 0.3,
  /** Minimum tokens to save before compression is worth the cost */
  MIN_SAVINGS: 500,
  /** Never compress below this (preserve minimum viable content) */
  MIN_OUTPUT_FLOOR: 50,
};

/** Accuracy preservation targets from Headroom benchmarks */
export const ACCURACY_TARGETS = {
  /** Conservative compression: 19-32% reduction, 97% accuracy preserved */
  CONSERVATIVE_MAX_REDUCTION: 0.32,
  /** Aggressive compression: 90%+ reduction, for code search / debug */
  AGGRESSIVE_MIN_REDUCTION: 0.90,
  /** Quality gate: never deploy compression below this accuracy */
  MIN_ACCURACY: 0.95,
};

/**
 * Determine compression level needed for a given token count.
 * @param {number} tokenCount
 * @returns {number} CompressionLevel
 */
export function recommendLevel(tokenCount) {
  if (tokenCount <= THRESHOLDS.LOSSLESS_TRIGGER) return CompressionLevel.NONE;
  if (tokenCount <= THRESHOLDS.STRUCTURAL_TRIGGER) return CompressionLevel.LOSSLESS;
  if (tokenCount <= THRESHOLDS.SEMANTIC_TRIGGER) return CompressionLevel.STRUCTURAL;
  return CompressionLevel.SEMANTIC;
}

/**
 * Check if tool output should trigger compression alert.
 * @param {number} outputTokens
 * @param {number} contextWindow
 * @returns {{ needsCompression: boolean, recommendedLevel: number, reason: string }}
 */
export function evaluateCompressionNeed(outputTokens, contextWindow) {
  const ratio = outputTokens / contextWindow;
  const level = recommendLevel(outputTokens);

  if (ratio > THRESHOLDS.CONTEXT_WINDOW_ALERT) {
    return {
      needsCompression: true,
      recommendedLevel: level,
      reason: `Output (${outputTokens} tokens) is ${(ratio * 100).toFixed(0)}% of context window (${contextWindow}). Recommend level ${level} compression.`,
    };
  }

  if (level > CompressionLevel.NONE) {
    return {
      needsCompression: true,
      recommendedLevel: level,
      reason: `Output (${outputTokens} tokens) exceeds ${THRESHOLDS.LOSSLESS_TRIGGER} token threshold.`,
    };
  }

  return { needsCompression: false, recommendedLevel: CompressionLevel.NONE, reason: "No compression needed." };
}

```
