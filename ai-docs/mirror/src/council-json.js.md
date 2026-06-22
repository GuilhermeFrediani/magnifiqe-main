# src/council-json.js

- kind: js
- lines: 161
- bytes: 6079

## Summary
@module council-json JSON parsing, normalization, and repair utilities for Council Live.

## Imports
- `./helpers.js`

## Exports
- `stripCodeFences`
- `replaceSmartQuotes`
- `extractJsonCandidate`
- `sanitizeJsonCandidate`
- `serializePretty`
- `parseLooseJson`
- `normalizeCouncilJsonPayload`

## Source
```js
import { serializePretty } from "./helpers.js";
/**
 * @module council-json
 * JSON parsing, normalization, and repair utilities for Council Live.
 */

import {
  normalizeText,
  normalizeBot,
  normalizeList,
  toInteger,
  clamp,
  positionSchema,
  reviewSchema,
  chairmanSchema,
  SCORE_MIN,
  SCORE_MAX,
  CHAIRMAN_CONFIDENCE,
  REVIEW_VERDICTS,
} from "./council-prompts.js";

// ─── JSON Repair Utilities ────────────────────────────────────────────────────

function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function replaceSmartQuotes(text) {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u00A0]/g, " ");
}

function extractJsonCandidate(text) {
  const cleaned = stripCodeFences(replaceSmartQuotes(text));
  const firstObject = cleaned.indexOf("{");
  const lastObject = cleaned.lastIndexOf("}");
  if (firstObject !== -1 && lastObject > firstObject) {
    return cleaned.slice(firstObject, lastObject + 1);
  }
  const firstArray = cleaned.indexOf("[");
  const lastArray = cleaned.lastIndexOf("]");
  if (firstArray !== -1 && lastArray > firstArray) {
    return cleaned.slice(firstArray, lastArray + 1);
  }
  return cleaned;
}

function sanitizeJsonCandidate(text) {
  return extractJsonCandidate(text)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\t/g, " ")
    .trim();
}

// serializePretty imported from ./helpers.js

// ─── JSON Parsing ─────────────────────────────────────────────────────────────

function parseLooseJson(rawText) {
  const base = normalizeText(rawText);
  if (!base) {
    return { ok: false, error: "Empty JSON payload." };
  }

  const attempts = [
    rawText,
    stripCodeFences(String(rawText ?? "")),
    extractJsonCandidate(String(rawText ?? "")),
    sanitizeJsonCandidate(String(rawText ?? "")),
  ].filter(Boolean);

  let lastError = "Unknown JSON parse error.";
  for (const attempt of attempts) {
    try {
      return { ok: true, value: JSON.parse(attempt) };
    } catch (error) {
      lastError = error.message;
    }
  }

  return { ok: false, error: `Invalid JSON payload: ${lastError}` };
}

// ─── Payload Normalization ────────────────────────────────────────────────────

function normalizeCouncilJsonPayload(stage, options = {}) {
  const parsed = parseLooseJson(options.raw_text);
  if (!parsed.ok) {
    return parsed;
  }

  try {
    if (stage === "bot_position") {
      const normalized = {
        bot: normalizeBot(options.expected_bot || parsed.value.bot, options.expected_bot || "executor"),
        problem_frame: normalizeText(parsed.value.problem_frame),
        thesis: normalizeText(parsed.value.thesis),
        assumptions: normalizeList(parsed.value.assumptions),
        opportunities: normalizeList(parsed.value.opportunities),
        risks: normalizeList(parsed.value.risks),
        next_steps: normalizeList(parsed.value.next_steps),
        evidence: normalizeText(parsed.value.evidence),
        confidence: clamp(toInteger(parsed.value.confidence, 70), 0, 100, 70),
        tags: normalizeList(parsed.value.tags, 5),
      };
      return { ok: true, normalized: positionSchema().parse(normalized) };
    }

    if (stage === "peer_review") {
      const normalized = {
        reviewer_bot: normalizeBot(options.expected_reviewer_bot || parsed.value.reviewer_bot, options.expected_reviewer_bot || "contrarian"),
        target_bot: normalizeBot(options.expected_target_bot || parsed.value.target_bot, options.expected_target_bot || "executor"),
        correctness_score: clamp(toInteger(parsed.value.correctness_score, 3), SCORE_MIN, SCORE_MAX, 3),
        novelty_score: clamp(toInteger(parsed.value.novelty_score, 3), SCORE_MIN, SCORE_MAX, 3),
        feasibility_score: clamp(toInteger(parsed.value.feasibility_score, 3), SCORE_MIN, SCORE_MAX, 3),
        risk_awareness_score: clamp(toInteger(parsed.value.risk_awareness_score, 3), SCORE_MIN, SCORE_MAX, 3),
        verdict: REVIEW_VERDICTS.includes(parsed.value.verdict) ? parsed.value.verdict : "mixed",
        critique: normalizeText(parsed.value.critique),
        adopted_ideas: normalizeList(parsed.value.adopted_ideas, 2),
        major_concerns: normalizeList(parsed.value.major_concerns, 2),
      };
      return { ok: true, normalized: reviewSchema().parse(normalized) };
    }

    if (stage === "chairman") {
      const confidence = normalizeText(parsed.value.confidence).toLowerCase();
      const normalized = {
        recommended_answer: normalizeText(parsed.value.recommended_answer || parsed.value.recommendation),
        alternatives: normalizeList(parsed.value.alternatives),
        next_step: normalizeText(parsed.value.next_step || parsed.value.proximo_passo),
        rationale: normalizeList(parsed.value.rationale || parsed.value.justification),
        risk_ranking: normalizeList(parsed.value.risk_ranking || parsed.value.risks),
        evidence_missing: normalizeList(parsed.value.evidence_missing),
        confidence: CHAIRMAN_CONFIDENCE.includes(confidence) ? confidence : "medium",
      };
      return { ok: true, normalized: chairmanSchema().parse(normalized) };
    }

    return { ok: false, error: `Unsupported stage: ${stage}` };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  stripCodeFences,
  replaceSmartQuotes,
  extractJsonCandidate,
  sanitizeJsonCandidate,
  serializePretty,
  parseLooseJson,
  normalizeCouncilJsonPayload,
};

```
