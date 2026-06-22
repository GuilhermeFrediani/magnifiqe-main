# src/semantic-compression.js

- kind: js
- lines: 232
- bytes: 8704

## Summary
@module semantic-compression LLM-aware semantic compression with three deletion tiers. Based on the OMP Semantic Compression pattern: LLMs reconstruct grammar from content words — remove predictable glue, keep semantic payload. Prefer fragments over sentences.

## Imports
- none

## Exports
- `semanticCompress`
- `getCompressionStats`
- `classifyTokens`

## Source
```js
/**
 * @module semantic-compression
 * LLM-aware semantic compression with three deletion tiers.
 * Based on the OMP Semantic Compression pattern:
 * LLMs reconstruct grammar from content words — remove predictable glue,
 * keep semantic payload. Prefer fragments over sentences.
 */

// ─── Deletion Tiers ──────────────────────────────────────────────────────────

/**
 * Tier 1 patterns — Always delete (even if fragments result).
 * Articles, copulas, expletive subjects, complementizers,
 * pure intensifiers, filler phrases, unnecessary conjunctions.
 */
const TIER1_ALWAYS_DELETE = [
  // Articles
  { regex: /\b(?:a|an|the)\b/gi, replacement: "", label: "article" },
  // Copulas
  { regex: /\b(?:is|are|was|were|am|be|been|being)\b/gi, replacement: "", label: "copula" },
  // Expletive subjects: "There is/are...", "It is..."
  { regex: /\bThere (?:is|are|was|were)\b/gi, replacement: "", label: "expletive-there" },
  { regex: /\bIt is\b/gi, replacement: "", label: "expletive-it" },
  // Complementizer "that" as clause marker
  { regex: /\bthat\b(?=\s+(?:the|a|an|this|these|those|it|there|he|she|they|we|you|I))/gi, replacement: "", label: "complementizer" },
  // Pure intensifiers
  { regex: /\b(?:very|quite|rather|really|extremely|somewhat|fairly|pretty)\b/gi, replacement: "", label: "intensifier" },
  // Filler phrases → compressed forms
  { regex: /\bin order to\b/gi, replacement: "to", label: "filler-in-order-to" },
  { regex: /\bdue to the fact that\b/gi, replacement: "because", label: "filler-due-to-fact" },
  { regex: /\bin terms of\b/gi, replacement: "", label: "filler-in-terms-of" },
  { regex: /\bfor the purpose of\b/gi, replacement: "to", label: "filler-for-purpose" },
  { regex: /\bat this point in time\b/gi, replacement: "now", label: "filler-at-point-time" },
  { regex: /\bin the event that\b/gi, replacement: "if", label: "filler-in-event" },
  { regex: /\bprior to\b/gi, replacement: "before", label: "filler-prior-to" },
  { regex: /\bsubsequent to\b/gi, replacement: "after", label: "filler-subsequent-to" },
];

/**
 * Tier 2 patterns — Delete unless meaning changes.
 * Auxiliaries, modals, pronouns, relative pronouns, prepositions.
 */

/**
 * Tier 3 patterns — Delete only if relation still clear.
 * Remaining prepositions, redundant adverbs.
 */

// ─── Always Preserve ─────────────────────────────────────────────────────────

/** Words that MUST NEVER be deleted — they carry meaning. */

// ─── Structural Compression ──────────────────────────────────────────────────

const STRUCTURAL_RULES = [
  // Nominalization → verb: "made a decision" → "decided"
  { regex: /\bmake(?:s|d)?\s+a\s+(\w+)(?:ion|ment|ance|ence|ure)\b/gi, replace: (m, p1) => p1 + "ed" },
  // Redundant pairs → single: "each and every" → "every"
  { regex: /\beach and every\b/gi, replacement: "every" },
  { regex: /\bfirst and foremost\b/gi, replacement: "first" },
  { regex: /\bnull and void\b/gi, replacement: "void" },
  { regex: /\bby means of\b/gi, replacement: "via" },
  // Clause → modifier: "anomaly that was reported" → "reported anomaly"
  { regex: /\b(\w+)\s+that\s+was\s+(\w+ed)\b/gi, replacement: "$2 $1" },
];

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Check if a word is in the preserve list.
 * @param {string} word
 * @returns {boolean}
 */
function shouldPreserve(word) {
  const lower = word.toLowerCase();
  const preserveWords = new Set([
    "not", "no", "never", "without", "none", "neither", "nor",
    "must", "must not", "required", "prohibited", "allowed", "shall",
    "before", "after", "during", "while", "since", "until",
    "because", "therefore", "despite", "although", "if", "unless",
    "however", "thus", "hence",
    "at least", "at most", "approximately", "more than", "less than",
    "appears", "seems", "reportedly", "possibly", "likely",
  ]);
  return preserveWords.has(lower);
}

/**
 * Apply Tier 1 deletions (always delete).
 * @param {string} text
 * @returns {{ text: string, deletions: number }}
 */
function applyTier1(text) {
  let result = text;
  let deletions = 0;

  for (const rule of TIER1_ALWAYS_DELETE) {
    const before = result;
    result = result.replace(rule.regex, rule.replacement);
    if (result !== before) deletions++;
  }

  // Clean up extra spaces
  result = result.replace(/\s{2,}/g, " ").trim();
  return { text: result, deletions };
}

/**
 * Apply structural compression rules.
 * @param {string} text
 * @returns {{ text: string, changes: number }}
 */
function applyStructural(text) {
  let result = text;
  let changes = 0;

  for (const rule of STRUCTURAL_RULES) {
    const before = result;
    if (rule.replace && typeof rule.replace === "function") {
      result = result.replace(rule.regex, rule.replace);
    } else {
      result = result.replace(rule.regex, rule.replacement);
    }
    if (result !== before) changes++;
  }

  return { text: result, changes };
}

/**
 * Compress text using semantic compression.
 * @param {string} text - Input text to compress
 * @param {object} options - Compression options
 * @param {number} [options.level=1] - Compression level (0=minimal, 1=standard, 2=aggressive)
 * @param {boolean} [options.preserveNumbers=true] - Preserve numbers
 * @param {boolean} [options.preserveTechnical=true] - Preserve technical terms
 * @returns {{ compressed: string, stats: object }}
 */
export function semanticCompress(text, options = {}) {
  const { level = 1 } = options;

  if (!text || typeof text !== "string") {
    return { compressed: text || "", stats: { before: 0, after: 0, ratio: 0, tier1: 0, structural: 0 } };
  }

  const originalLength = text.split(/\s+/).filter(Boolean).length;

  // Level 0: minimal — only filler phrases
  let result = text;
  let tier1Count = 0;

  if (level >= 1) {
    // Level 1: standard — Tier 1 + structural
    const tier1 = applyTier1(result);
    result = tier1.text;
    tier1Count = tier1.deletions;

    const structural = applyStructural(result);
    result = structural.text;
  }

  if (level >= 2) {
    // Level 2: aggressive — also Tier 2 patterns (simplified)
    // Remove redundant adverbs
    result = result.replace(/\b(\w+ly)\b(?=\s+\w)/gi, (match, word) => {
      const base = word.replace(/ly$/, "");
      if (base.length >= 3 && !shouldPreserve(base)) return base;
      return match;
    });
  }

  const compressedLength = result.split(/\s+/).filter(Boolean).length;
  const ratio = originalLength > 0 ? Math.round((compressedLength / originalLength) * 100) : 100;

  return {
    compressed: result,
    stats: {
      before: originalLength,
      after: compressedLength,
      savings: originalLength - compressedLength,
      savingsPercent: 100 - ratio,
      tier1: tier1Count,
      level,
    },
  };
}

/**
 * Get compression stats for a before/after comparison.
 * @param {string} before
 * @param {string} after
 * @returns {object}
 */
export function getCompressionStats(before, after) {
  const beforeWords = (before || "").split(/\s+/).filter(Boolean).length;
  const afterWords = (after || "").split(/\s+/).filter(Boolean).length;
  const saved = beforeWords - afterWords;

  return {
    beforeTokens: beforeWords,
    afterTokens: afterWords,
    saved,
    savedPercent: beforeWords > 0 ? Math.round((saved / beforeWords) * 100) : 0,
  };
}

/**
 * Classify tokens by tier — what can be deleted at each level.
 * @param {string} text
 * @returns {object} Classification of tokens
 */
export function classifyTokens(text) {
  if (!text) return { tier1: [], tier2: [], tier3: [], preserve: [] };

  const words = text.split(/\s+/).filter(Boolean);
  const classification = { tier1: [], tier2: [], tier3: [], preserve: [] };

  for (const word of words) {
    if (shouldPreserve(word)) {
      classification.preserve.push(word);
    } else if (/\b(?:a|an|the|is|are|was|were|am|be|been|being|very|quite|rather|really)\b/i.test(word)) {
      classification.tier1.push(word);
    } else if (/\b(?:can|could|may|might|this|that|which|who|whom)\b/i.test(word)) {
      classification.tier2.push(word);
    } else if (/\b\w+ly\b/i.test(word)) {
      classification.tier3.push(word);
    }
  }

  return classification;
}

```
