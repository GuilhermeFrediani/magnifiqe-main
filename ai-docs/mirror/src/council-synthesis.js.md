# src/council-synthesis.js

- kind: js
- lines: 196
- bytes: 8278

## Summary
Council Synthesis — deterministic synthesis of council positions and peer reviews. Produces consensus, disagreements, discarded ideas, risk ranking, and recommended next step.

## Imports
- `./council-prompts.js`
- `./helpers.js`

## Exports
- `average`
- `collectConsensusTags`
- `buildPositionScorecard`
- `deriveDisagreements`
- `deriveDiscardedIdeas`
- `deriveConfidence`
- `synthesizeCouncilSession`
- `formatSynthesis`

## Source
```js
/**
 * Council Synthesis — deterministic synthesis of council positions and peer reviews.
 * Produces consensus, disagreements, discarded ideas, risk ranking, and recommended next step.
 */

import {
  COUNCIL_BOT_ORDER,
  CHAIRMAN_LABEL,
  countCompletedReviews,
  refreshSessionStatus,
} from "./council-session.js";
import { titleCaseBot } from "./council-prompts.js";
import { normalizeText, normalizeList } from "./helpers.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

export function average(numbers) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function collectConsensusTags(session) {
  const counts = new Map();
  for (const bot of COUNCIL_BOT_ORDER) {
    const position = session.positions?.[bot];
    if (!position) continue;
    for (const tag of position.tags || []) {
      const key = tag.toLowerCase();
      const record = counts.get(key) || { label: tag, count: 0, bots: [] };
      record.count += 1;
      record.bots.push(bot);
      counts.set(key, record);
    }
  }

  return [...counts.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((entry) => `${entry.label} (${entry.count}/5)`)
    .slice(0, 6);
}

export function buildPositionScorecard(session) {
  return COUNCIL_BOT_ORDER
    .filter((bot) => session.positions?.[bot])
    .map((bot) => {
      const position = session.positions[bot];
      const reviews = session.reviews.filter((entry) => entry.target_bot === bot);
      const correctness = average(reviews.map((entry) => entry.correctness_score));
      const novelty = average(reviews.map((entry) => entry.novelty_score));
      const feasibility = average(reviews.map((entry) => entry.feasibility_score));
      const risk_awareness = average(reviews.map((entry) => entry.risk_awareness_score));
      const support_count = reviews.filter((entry) => entry.verdict === "support").length;
      const mixed_count = reviews.filter((entry) => entry.verdict === "mixed").length;
      const reject_count = reviews.filter((entry) => entry.verdict === "reject").length;
      const weighted_score = Number((correctness * 0.35 + novelty * 0.2 + feasibility * 0.25 + risk_awareness * 0.2).toFixed(2));
      const concerns = normalizeList(reviews.flatMap((entry) => entry.major_concerns || [])).slice(0, 4);

      return {
        bot,
        label: position.label,
        thesis: position.thesis,
        weighted_score,
        correctness: Number(correctness.toFixed(2)),
        novelty: Number(novelty.toFixed(2)),
        feasibility: Number(feasibility.toFixed(2)),
        risk_awareness: Number(risk_awareness.toFixed(2)),
        support_count,
        mixed_count,
        reject_count,
        next_steps: position.next_steps,
        opportunities: position.opportunities,
        risks: position.risks,
        confidence: position.confidence,
        concerns,
      };
    })
    .sort((a, b) => b.weighted_score - a.weighted_score || b.support_count - a.support_count);
}

export function deriveDisagreements(scorecard) {
  return scorecard
    .filter((entry) => entry.reject_count > 0 || entry.mixed_count > entry.support_count)
    .map((entry) => `${entry.label}: ${entry.reject_count} reject / ${entry.mixed_count} mixed — concerns: ${entry.concerns.join('; ') || 'none logged'}`)
    .slice(0, 6);
}

export function deriveDiscardedIdeas(scorecard) {
  return scorecard
    .filter((entry) => entry.weighted_score < 3 || entry.reject_count > entry.support_count)
    .map((entry) => `${entry.label}: ${entry.thesis}`)
    .slice(0, 6);
}

export function deriveConfidence(scorecard, session) {
  const top = scorecard[0];
  if (!top) return "low";

  const reviewCoverage = session.required_review_count === 0
    ? 1
    : countCompletedReviews(session) / session.required_review_count;

  if (reviewCoverage >= 1 && top.weighted_score >= 4 && top.support_count >= Math.max(1, top.reject_count + 1)) {
    return "high";
  }
  if (reviewCoverage >= 0.75 && top.weighted_score >= 3.25) {
    return "medium";
  }
  return "low";
}

// ─── Main Synthesis ────────────────────────────────────────────────────────

export function synthesizeCouncilSession(session) {
  const missingBots = COUNCIL_BOT_ORDER.filter((bot) => !session.positions?.[bot]);
  if (missingBots.length) {
    throw new Error(`Cannot synthesize. Missing positions from: ${missingBots.join(', ')}`);
  }
  if (countCompletedReviews(session) < session.required_review_count) {
    throw new Error(`Cannot synthesize. Missing peer reviews: ${session.required_review_count - countCompletedReviews(session)}`);
  }

  const scorecard = buildPositionScorecard(session);
  const leader = scorecard[0];
  const consensus_tags = collectConsensusTags(session);
  const disagreements = deriveDisagreements(scorecard);
  const discarded_ideas = deriveDiscardedIdeas(scorecard);
  const recommended_next_step = leader?.next_steps?.[0] || "No next step proposed";
  const lowEvidenceBots = COUNCIL_BOT_ORDER.filter((bot) => !normalizeText(session.positions?.[bot]?.evidence));
  const unresolvedConcerns = normalizeList(scorecard.flatMap((entry) => entry.concerns || [])).slice(0, 6);
  const evidence_missing = [];

  if (lowEvidenceBots.length) {
    evidence_missing.push(`Missing evidence fields: ${lowEvidenceBots.map(titleCaseBot).join(', ')}`);
  }
  if (scorecard.some((entry) => !entry.next_steps?.length)) {
    evidence_missing.push("Some bot positions still lack concrete next steps.");
  }
  if (unresolvedConcerns.length) {
    evidence_missing.push(`Open concerns to verify: ${unresolvedConcerns.join('; ')}`);
  }
  if (!evidence_missing.length) {
    evidence_missing.push("No obvious evidence gaps recorded.");
  }

  const synthesis = {
    session_id: session.session_id,
    chairman: CHAIRMAN_LABEL,
    synthesized_at: new Date().toISOString(),
    confidence: deriveConfidence(scorecard, session),
    consensus: consensus_tags.length ? consensus_tags : ["No strong tag-level consensus; inspect scorecard"],
    disagreements: disagreements.length ? disagreements : ["No major disagreement spikes recorded in peer review"],
    discarded_ideas: discarded_ideas.length ? discarded_ideas : ["No ideas were discarded by score threshold"],
    risk_ranking: scorecard.map((entry) => `${entry.label}: score=${entry.weighted_score}, support=${entry.support_count}, reject=${entry.reject_count}`),
    recommended_next_step,
    leading_bot: leader?.label || "n/a",
    scorecard,
    evidence_missing,
  };

  session.synthesis = synthesis;
  session.updated_at = new Date().toISOString();
  refreshSessionStatus(session);
  return synthesis;
}

// ─── Formatting ────────────────────────────────────────────────────────────

export function formatSynthesis(synthesis) {
  return [
    `## Chairman Synthesis: ${synthesis.session_id}`,
    `- Chairman: ${synthesis.chairman || CHAIRMAN_LABEL}`,
    `- Confidence: ${synthesis.confidence}`,
    `- Leading bot: ${synthesis.leading_bot}`,
    `- Recommended next step: ${synthesis.recommended_next_step}`,
    "",
    "### Consensus",
    ...synthesis.consensus.map((item) => `- ${item}`),
    "",
    "### Disagreements",
    ...synthesis.disagreements.map((item) => `- ${item}`),
    "",
    "### Discarded ideas",
    ...synthesis.discarded_ideas.map((item) => `- ${item}`),
    "",
    "### Risk ranking",
    ...synthesis.risk_ranking.map((item) => `- ${item}`),
    "",
    "### Evidence missing",
    ...synthesis.evidence_missing.map((item) => `- ${item}`),
    "",
    "### Scorecard",
    ...synthesis.scorecard.map((entry, index) => `${index + 1}. ${entry.label} — score=${entry.weighted_score}; support=${entry.support_count}; mixed=${entry.mixed_count}; reject=${entry.reject_count}`),
  ].join("\n");
}

```
