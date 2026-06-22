/**
 * @module semantic-compression
 * LLM-aware semantic compression with three deletion tiers.
 * Based on the OMP Semantic Compression pattern:
 * LLMs reconstruct grammar from content words — remove predictable glue,
 * keep semantic payload. Prefer fragments over sentences.
 *
 * Tier 1: ALWAYS DELETE — articles, copulas, expletive subjects, intensifiers, fillers
 * Tier 2: DELETE IF CONTEXT CLEAR — auxiliaries, modals, pronouns, prepositions
 * Tier 3: DELETE IF OBVIOUS — remaining prepositions, redundant adverbs
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
  // Expletive subjects MUST come before copulas (multi-word before single-word)
  { regex: /\bThere (?:is|are|was|were)\b/gi, replacement: "", label: "expletive-there" },
  { regex: /\bIt is\b/gi, replacement: "", label: "expletive-it" },
  // Copulas (after expletive rules, so "There are" is caught first)
  { regex: /\b(?:is|are|was|were|am|be|been|being)\b/gi, replacement: "", label: "copula" },
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
  { regex: /\bit is important to\b/gi, replacement: "must", label: "filler-important-to" },
  { regex: /\bnote that\b/gi, replacement: "", label: "filler-note-that" },
];

/**
 * Tier 2 patterns — Delete only if context is clear.
 * Auxiliaries, modals, pronouns, relative pronouns, prepositions.
 * Each entry carries a `contextCheck` function — returns true if deletion is safe.
 */
const TIER2_DELETE_IF_CONTEXT_CLEAR = [
  // Auxiliary verbs
  { regex: /\bhave\b/gi, replacement: "", label: "aux-have", contextCheck: (text, match) => !/have\s+(?:to|been|got)/i.test(match[0]) },
  { regex: /\bhas\b/gi, replacement: "", label: "aux-has", contextCheck: (text, match) => !/has\s+(?:to|been|got)/i.test(match[0]) },
  { regex: /\bhad\b/gi, replacement: "", label: "aux-had", contextCheck: (text, match) => !/had\s+(?:to|been|got)/i.test(match[0]) },
  { regex: /\bdo\b/gi, replacement: "", label: "aux-do", contextCheck: () => true },
  { regex: /\bdoes\b/gi, replacement: "", label: "aux-does", contextCheck: () => true },
  // Modal verbs (safe to remove when intent is already clear from context)
  { regex: /\bcan\b/gi, replacement: "", label: "modal-can", contextCheck: () => true },
  { regex: /\bcould\b/gi, replacement: "", label: "modal-could", contextCheck: (text, match) => !/could\s+mean|could\s+be\s+uncertain/i.test(text) },
  { regex: /\bmay\b/gi, replacement: "", label: "modal-may", contextCheck: () => true },
  { regex: /\bmight\b/gi, replacement: "", label: "modal-might", contextCheck: () => false }, // uncertainty marker — preserve
  { regex: /\bshould\b/gi, replacement: "", label: "modal-should", contextCheck: () => false }, // requirement — preserve
  // Pronouns (remove only when referent is clear from surrounding context)
  { regex: /\b(?:he|she)\b/gi, replacement: "", label: "pronoun-singular", contextCheck: (text, match) => {
    // Only remove if a noun immediately precedes or follows
    const idx = match.index;
    const before = text.slice(Math.max(0, idx - 30), idx).trim();
    const after = text.slice(idx + match[0].length, idx + match[0].length + 30).trim();
    const nounNearby = /\b\w+(?:tion|ment|ance|ence|ity|ism|ist|er|or|ing|ed)\b/.test(before) ||
                       /\b\w+(?:tion|ment|ance|ence|ity|ism|ist|er|or|ing|ed)\b/.test(after);
    return nounNearby;
  }},
  { regex: /\bthey\b/gi, replacement: "", label: "pronoun-they", contextCheck: () => false }, // often ambiguous
  { regex: /\bwe\b/gi, replacement: "", label: "pronoun-we", contextCheck: () => false }, // often ambiguous
  // Relative pronouns
  { regex: /\bwhich\b/gi, replacement: "", label: "relative-which", contextCheck: () => true },
  { regex: /\bwho\b/gi, replacement: "", label: "relative-who", contextCheck: () => true },
  { regex: /\bwhom\b/gi, replacement: "", label: "relative-whom", contextCheck: () => true },
  // Prepositions (safe to remove when spatial/temporal relation is obvious)
  { regex: /\bin\b/gi, replacement: "", label: "prep-in", contextCheck: (text, match) => {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 20).trim();
    // Keep "in" before code-like tokens or specific domains
    return !/\b\w+\.\w+/.test(after) && !/the|this|that|a\b/.test(after.slice(0, 5));
  }},
  { regex: /\bon\b/gi, replacement: "", label: "prep-on", contextCheck: () => true },
  { regex: /\bat\b/gi, replacement: "", label: "prep-at", contextCheck: (text, match) => {
    // Preserve "at least", "at most"
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 10).trim();
    return !/least|most|all|once/.test(after);
  }},
  { regex: /\bby\b/gi, replacement: "", label: "prep-by", contextCheck: () => true },
  { regex: /\bfor\b/gi, replacement: "", label: "prep-for", contextCheck: () => true },
  { regex: /\bwith\b/gi, replacement: "", label: "prep-with", contextCheck: () => true },
];

/**
 * Tier 3 patterns — Delete only if relation still clear.
 * Remaining prepositions, redundant adverbs.
 */
const TIER3_DELETE_IF_OBVIOUS = [
  // Remaining prepositions
  { regex: /\bfrom\b/gi, replacement: "", label: "prep-from", contextCheck: () => true },
  { regex: /\binto\b/gi, replacement: "", label: "prep-into", contextCheck: () => true },
  { regex: /\bthrough\b/gi, replacement: "", label: "prep-through", contextCheck: () => true },
  { regex: /\bduring\b/gi, replacement: "", label: "prep-during", contextCheck: () => true },
  { regex: /\babout\b/gi, replacement: "", label: "prep-about", contextCheck: () => true },
  { regex: /\bover\b/gi, replacement: "", label: "prep-over", contextCheck: () => true },
  { regex: /\bunder\b/gi, replacement: "", label: "prep-under", contextCheck: () => true },
  // Redundant adverbs
  { regex: /\balso\b/gi, replacement: "", label: "adverb-also", contextCheck: () => true },
  { regex: /\badditionally\b/gi, replacement: "", label: "adverb-additionally", contextCheck: () => true },
  { regex: /\bfurthermore\b/gi, replacement: "", label: "adverb-furthermore", contextCheck: () => true },
  { regex: /\bmoreover\b/gi, replacement: "", label: "adverb-moreover", contextCheck: () => true },
  { regex: /\bnevertheless\b/gi, replacement: "", label: "adverb-nevertheless", contextCheck: () => true },
];

// ─── Always Preserve ─────────────────────────────────────────────────────────

/** Words that MUST NEVER be deleted — they carry semantic meaning. */
const PRESERVE_WORDS = new Set([
  // Negation
  "not", "no", "never", "without", "none", "neither", "nor",
  // Requirements
  "must", "must not", "required", "prohibited", "allowed", "shall",
  // Causality
  "because", "therefore", "thus", "hence", "consequently",
  "despite", "although", "however",
  // Temporal
  "before", "after", "during", "while", "since", "until",
  // Uncertainty markers
  "uncertain", "possibly", "likely", "unlikely", "appears", "seems", "reportedly",
  // Logic
  "if", "unless", "either", "or",
  // Quantifiers
  "at least", "at most", "approximately", "more than", "less than",
  // Technical
  "undefined", "null", "true", "false",
]);

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
export function shouldPreserve(word) {
  return PRESERVE_WORDS.has(word.toLowerCase());
}

/**
 * Detect whether a position in text falls inside a code block (``` fences).
 * Code blocks must never be semantically compressed.
 * @param {string} text
 * @param {number} index
 * @returns {boolean}
 */
function isInCodeBlock(text, index) {
  const before = text.slice(0, index);
  const fenceCount = (before.match(/```/g) || []).length;
  return fenceCount % 2 === 1;
}

/**
 * Find code blocks in text and return their ranges.
 * @param {string} text
 * @returns {Array<[number, number]>} Array of [start, end] ranges (exclusive end)
 */
function findCodeBlocks(text) {
  const ranges = [];
  const fenceRegex = /```/g;
  let match;
  while ((match = fenceRegex.exec(text)) !== null) {
    if (ranges.length % 2 === 0) {
      ranges.push([match.index]);
    } else {
      ranges[ranges.length - 1].push(match.index + 3);
    }
  }
  // Unclosed fence — treat rest as code
  if (ranges.length % 2 === 1) {
    ranges[ranges.length - 1].push(text.length);
  }
  return ranges;
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
 * Apply Tier 2 deletions (delete if context is clear).
 * Respects preserve list and runs context checks.
 * @param {string} text
 * @returns {{ text: string, deletions: number }}
 */
function applyTier2(text) {
  let result = text;
  let deletions = 0;

  for (const rule of TIER2_DELETE_IF_CONTEXT_CLEAR) {
    const before = result;
    // Find all matches and process individually
    let offset = 0;
    result = result.replace(rule.regex, (match, ...args) => {
      const matchIndex = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[0];

      // Check preserve list
      if (shouldPreserve(match)) return match;

      // Check context
      if (rule.contextCheck && !rule.contextCheck(text, [match, matchIndex])) {
        return match;
      }

      // Skip code blocks
      if (isInCodeBlock(text, matchIndex)) return match;

      const oldLen = match.length;
      offset -= oldLen; // replacement is "" so offset adjustment needed for subsequent matches
      return rule.replacement;
    });
    if (result !== before) deletions++;
  }

  // Clean up extra spaces
  result = result.replace(/\s{2,}/g, " ").trim();
  return { text: result, deletions };
}

/**
 * Apply Tier 3 deletions (delete if relation still clear).
 * @param {string} text
 * @returns {{ text: string, deletions: number }}
 */
function applyTier3(text) {
  let result = text;
  let deletions = 0;

  for (const rule of TIER3_DELETE_IF_OBVIOUS) {
    const before = result;
    result = result.replace(rule.regex, (match, ...args) => {
      if (shouldPreserve(match)) return match;
      return rule.replacement;
    });
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
 * Segment text into code blocks and prose blocks.
 * @param {string} text
 * @returns {Array<{ text: string, isCode: boolean, start: number }>}
 */
function segmentText(text) {
  const blocks = [];
  const codeRanges = findCodeBlocks(text);
  let cursor = 0;

  for (const [start, end] of codeRanges) {
    if (start > cursor) {
      blocks.push({ text: text.slice(cursor, start), isCode: false, start: cursor });
    }
    blocks.push({ text: text.slice(start, end), isCode: true, start });
    cursor = end;
  }

  if (cursor < text.length) {
    blocks.push({ text: text.slice(cursor), isCode: false, start: cursor });
  }

  return blocks;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compress text using LLM-aware semantic compression.
 *
 * @param {string} text - Input text to compress
 * @param {object} [options]
 * @param {number} [options.tier=1] - Max deletion tier (1=always, 2=context, 3=obvious)
 * @param {number} [options.level] - Legacy alias for `tier` (backward compat)
 * @param {boolean} [options.preserveCode=true] - Protect code blocks from deletion
 * @returns {{ compressed: string, stats: object }}
 */
export function semanticCompress(text, options = {}) {
  const tier = options.tier ?? options.level ?? 1;

  if (!text || typeof text !== "string") {
    return { compressed: text || "", stats: { before: 0, after: 0, ratio: 0, tier1: 0, tier2: 0, tier3: 0, structural: 0 } };
  }

  const originalWordCount = text.split(/\s+/).filter(Boolean).length;

  // Segment into code/prose blocks to protect code
  const preserveCode = options.preserveCode !== false;
  const segments = preserveCode ? segmentText(text) : [{ text, isCode: false, start: 0 }];

  let result = "";
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  let structuralCount = 0;

  for (const seg of segments) {
    if (seg.isCode) {
      result += seg.text;
      continue;
    }

    let processed = seg.text;

    // Tier 1: Always delete
    const t1 = applyTier1(processed);
    processed = t1.text;
    tier1Count += t1.deletions;

    // Structural compression (runs at tier >= 1)
    if (tier >= 1) {
      const st = applyStructural(processed);
      processed = st.text;
      structuralCount += st.changes;
    }

    // Tier 2: Delete if context clear
    if (tier >= 2) {
      const t2 = applyTier2(processed);
      processed = t2.text;
      tier2Count += t2.deletions;
    }

    // Tier 3: Delete if obvious
    if (tier >= 3) {
      const t3 = applyTier3(processed);
      processed = t3.text;
      tier3Count += t3.deletions;
    }

    result += processed;
  }

  const compressedWordCount = result.split(/\s+/).filter(Boolean).length;
  const savings = originalWordCount - compressedWordCount;
  const savingsPercent = originalWordCount > 0 ? Math.round((savings / originalWordCount) * 100) : 0;

  return {
    compressed: result,
    stats: {
      before: originalWordCount,
      after: compressedWordCount,
      savings,
      savingsPercent,
      tier1: tier1Count,
      tier2: tier2Count,
      tier3: tier3Count,
      structural: structuralCount,
      tier,
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
    } else if (/\b(?:can|could|may|might|this|that|which|who|whom|have|has|had|do|does)\b/i.test(word)) {
      classification.tier2.push(word);
    } else if (/\b\w+ly\b/i.test(word)) {
      classification.tier3.push(word);
    }
  }

  return classification;
}
