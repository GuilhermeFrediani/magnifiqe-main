# src/council-session.js

- kind: js
- lines: 430
- bytes: 14736

## Summary
Council Session — constants, bot briefs, session CRUD, position/review upsert, and formatting. Core data layer for council deliberation workflow.

## Imports
- `fs`
- `./config.js`
- `./helpers.js`
- `./council-gate.js`
- `./council-prompts.js`

## Exports
- `COUNCIL_BOT_ORDER`
- `CHAIRMAN_LABEL`
- `FAILURE_COST_VALUES`
- `BLAST_RADIUS_VALUES`
- `MODE_VALUES`
- `COUNCIL_BOT_BRIEFS`
- `defaultCouncilState`
- `seededShuffle`
- `buildPeerReviewMatrix`
- `createSessionId`
- `buildCouncilSession`
- `loadCouncilState`
- `saveCouncilState`
- `findSession`
- `ensureSession`
- `countCompletedPositions`
- `countCompletedReviews`
- `refreshSessionStatus`
- `upsertCouncilPosition`
- `upsertCouncilReview`
- `formatSessionList`
- `formatSession`

## Source
```js
/**
 * Council Session — constants, bot briefs, session CRUD, position/review upsert, and formatting.
 * Core data layer for council deliberation workflow.
 */

import { existsSync, readFileSync } from "fs";
import { COUNCIL_STATE_FILE } from "./config.js";
import { atomicWrite, normalizeText, normalizeList } from "./helpers.js";
import { formatGateResult } from "./council-gate.js";
import { titleCaseBot } from "./council-prompts.js";

// ─── Constants ─────────────────────────────────────────────────────────────

export const COUNCIL_BOT_ORDER = ["contrarian", "first_principles", "expansionist", "outsider", "executor"];
export const CHAIRMAN_LABEL = "The Chairman";
export const FAILURE_COST_VALUES = ["low", "medium", "high"];
export const BLAST_RADIUS_VALUES = ["local", "module", "system"];
export const MODE_VALUES = ["auto", "off", "standard", "full"];
export const COUNCIL_BOT_BRIEFS = {
  contrarian: {
    label: "The Contrarian",
    mandate: "Stress-test the proposal, surface weak links, and expose hidden failure modes before the system commits.",
    focus: [
      "Attack unjustified leaps, optimistic assumptions, and thin evidence",
      "Differentiate structural risk from cosmetic disagreement",
      "Force the team to earn confidence instead of inheriting it",
    ],
    avoid: [
      "Do not disagree for theater or ego",
      "Do not block progress without naming a safer path",
    ],
    required_output: [
      "problem_frame",
      "thesis",
      "assumptions[]",
      "risks[]",
      "next_steps[]",
    ],
  },
  first_principles: {
    label: "The First Principles Thinker",
    mandate: "Rebuild the solution from zero and separate fundamentals from inherited assumptions.",
    focus: [
      "State the real problem in invariant terms",
      "Call out assumptions that should be re-earned",
      "Prefer minimum coherent architecture before optimization",
    ],
    avoid: [
      "Do not assume the current codebase shape is correct",
      "Do not optimize for novelty over correctness",
    ],
    required_output: [
      "problem_frame",
      "thesis",
      "assumptions[]",
      "risks[]",
      "next_steps[]",
    ],
  },
  expansionist: {
    label: "The Expansionist",
    mandate: "Find useful opportunities, leverage points, and adjacent gains that may be getting ignored.",
    focus: [
      "Surface DX, performance, security, reuse, and automation opportunities",
      "Propose optional upside without exploding scope",
      "Name quick wins and strategic wins separately",
    ],
    avoid: [
      "Do not turn the task into an unrelated roadmap",
      "Do not hide scope creep risk",
    ],
    required_output: [
      "thesis",
      "opportunities[]",
      "risks[]",
      "tags[]",
      "next_steps[]",
    ],
  },
  outsider: {
    label: "The Outsider",
    mandate: "Attack the framing with minimal prior bias and question whether the task is being asked correctly.",
    focus: [
      "Challenge the problem framing",
      "Offer a materially different interpretation if warranted",
      "Expose blind spots, sunk-cost bias, and false constraints",
    ],
    avoid: [
      "Do not nitpick stylistically",
      "Do not preserve assumptions just because they are popular",
    ],
    required_output: [
      "problem_frame",
      "thesis",
      "assumptions[]",
      "risks[]",
      "tags[]",
    ],
  },
  executor: {
    label: "The Executor",
    mandate: "Translate the best direction into an implementation-ready plan with order, evidence, and rollback.",
    focus: [
      "Provide concrete next steps in execution order",
      "Define acceptance and rollback expectations",
      "Keep the plan incremental and testable",
    ],
    avoid: [
      "Do not hand-wave verification",
      "Do not collapse architecture trade-offs into implementation detail",
    ],
    required_output: [
      "thesis",
      "next_steps[]",
      "risks[]",
      "evidence",
      "confidence",
    ],
  },
};

// ─── Default State ─────────────────────────────────────────────────────────

export function defaultCouncilState() {
  return {
    sessions: [],
    updated_at: new Date().toISOString(),
  };
}

// ─── Utility Functions ─────────────────────────────────────────────────────

// normalizeText imported from ./helpers.js

// normalizeList imported from ./helpers.js


function seedFromString(input) {
  let seed = 0;
  for (let i = 0; i < input.length; i += 1) {
    seed = (seed * 31 + input.charCodeAt(i)) >>> 0;
  }
  return seed || 1;
}

function nextSeed(seed) {
  return (seed * 1664525 + 1013904223) >>> 0;
}

export function seededShuffle(items, seedText) {
  const arr = items.slice();
  let seed = seedFromString(seedText);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = nextSeed(seed);
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildPeerReviewMatrix(mode, sessionId) {
  const standard = [
    { reviewer_bot: "contrarian", target_bot: "executor" },
    { reviewer_bot: "first_principles", target_bot: "expansionist" },
    { reviewer_bot: "expansionist", target_bot: "outsider" },
    { reviewer_bot: "outsider", target_bot: "contrarian" },
    { reviewer_bot: "executor", target_bot: "first_principles" },
  ];

  const full = [
    { reviewer_bot: "contrarian", target_bot: "first_principles" },
    { reviewer_bot: "contrarian", target_bot: "executor" },
    { reviewer_bot: "first_principles", target_bot: "contrarian" },
    { reviewer_bot: "first_principles", target_bot: "expansionist" },
    { reviewer_bot: "expansionist", target_bot: "outsider" },
    { reviewer_bot: "expansionist", target_bot: "executor" },
    { reviewer_bot: "outsider", target_bot: "contrarian" },
    { reviewer_bot: "outsider", target_bot: "first_principles" },
    { reviewer_bot: "executor", target_bot: "expansionist" },
    { reviewer_bot: "executor", target_bot: "outsider" },
  ];

  return seededShuffle(mode === "full" ? full : standard, sessionId);
}

// ─── Session CRUD ──────────────────────────────────────────────────────────

export function createSessionId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `council-${stamp}-${rand}`;
}

export function buildCouncilSession({
  objective,
  context,
  desired_output,
  constraints,
  task_type,
  blast_radius,
  mode,
  maximum_rounds,
  gate,
}) {
  const session_id = createSessionId();
  const activated_mode = mode === "auto"
    ? gate.recommendation
    : mode === "off"
      ? "skip"
      : mode;

  const bounded_rounds = activated_mode === "full"
    ? Math.min(Math.max(Number(maximum_rounds || gate.maximum_rounds || 2), 1), 2)
    : activated_mode === "standard"
      ? 1
      : 0;

  const review_queue = activated_mode === "skip"
    ? []
    : buildPeerReviewMatrix(activated_mode, session_id);

  return {
    session_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: activated_mode === "skip" ? "gated_out" : "awaiting_positions",
    objective: normalizeText(objective),
    context: normalizeText(context),
    desired_output: normalizeText(desired_output),
    constraints: normalizeList(constraints),
    task_type: normalizeText(task_type || "generic"),
    blast_radius,
    requested_mode: mode,
    activated_mode,
    maximum_rounds: bounded_rounds,
    gate,
    role_order: COUNCIL_BOT_ORDER.slice(),
    bot_briefs: COUNCIL_BOT_BRIEFS,
    peer_review_queue: review_queue,
    required_review_count: review_queue.length,
    stop_rules: [
      "Maximum two rounds total; no open-ended debate",
      "Same objection twice without new evidence -> halt escalation",
      "Synthesis must expose disagreements instead of flattening them",
      "Executor cannot overwrite unresolved structural risks",
    ],
    scoring_rubric: [
      "correctness: 1-5",
      "novelty: 1-5",
      "feasibility: 1-5",
      "risk_awareness: 1-5",
    ],
    positions: {},
    reviews: [],
    synthesis: null,
  };
}

export function loadCouncilState(filePath = COUNCIL_STATE_FILE) {
  if (!existsSync(filePath)) return defaultCouncilState();
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    return {
      ...defaultCouncilState(),
      ...data,
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    };
  } catch {
    return defaultCouncilState();
  }
}

export function saveCouncilState(state, filePath = COUNCIL_STATE_FILE) {
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now = Date.now();

  // Filter out sessions older than TTL
  const sessions = (Array.isArray(state.sessions) ? state.sessions : []).filter((session) => {
    const createdAt = new Date(session.created_at || session.updated_at || 0).getTime();
    return (now - createdAt) < SESSION_TTL_MS;
  });

  const sanitized = {
    ...defaultCouncilState(),
    ...state,
    sessions: sessions.slice(-30),
    updated_at: new Date().toISOString(),
  };
  atomicWrite(filePath, JSON.stringify(sanitized, null, 2));
}

export function findSession(state, sessionId) {
  return state.sessions.find((session) => session.session_id === sessionId) || null;
}

export function ensureSession(state, sessionId) {
  const session = findSession(state, sessionId);
  if (!session) throw new Error(`Council session not found: ${sessionId}`);
  return session;
}

export function countCompletedPositions(session) {
  return COUNCIL_BOT_ORDER.filter((bot) => session.positions?.[bot]).length;
}

export function countCompletedReviews(session) {
  return Array.isArray(session.reviews) ? session.reviews.length : 0;
}

export function refreshSessionStatus(session) {
  const positionCount = countCompletedPositions(session);
  const reviewCount = countCompletedReviews(session);

  if (session.activated_mode === "skip") {
    session.status = "gated_out";
    return session;
  }

  if (positionCount < COUNCIL_BOT_ORDER.length) {
    session.status = "awaiting_positions";
    return session;
  }

  if (reviewCount < session.required_review_count) {
    session.status = "awaiting_reviews";
    return session;
  }

  if (session.synthesis) {
    session.status = "synthesized";
    return session;
  }

  session.status = "ready_for_synthesis";
  return session;
}

// ─── Position / Review Upsert ──────────────────────────────────────────────

export function upsertCouncilPosition(session, payload) {
  session.positions[payload.bot] = {
    bot: payload.bot,
    label: titleCaseBot(payload.bot),
    problem_frame: normalizeText(payload.problem_frame),
    thesis: normalizeText(payload.thesis),
    assumptions: normalizeList(payload.assumptions),
    opportunities: normalizeList(payload.opportunities),
    risks: normalizeList(payload.risks),
    next_steps: normalizeList(payload.next_steps),
    evidence: normalizeText(payload.evidence),
    confidence: Number(payload.confidence),
    tags: normalizeList(payload.tags),
    updated_at: new Date().toISOString(),
  };
  session.updated_at = new Date().toISOString();
  return refreshSessionStatus(session);
}

export function upsertCouncilReview(session, payload) {
  const review = {
    reviewer_bot: payload.reviewer_bot,
    target_bot: payload.target_bot,
    correctness_score: Number(payload.correctness_score),
    novelty_score: Number(payload.novelty_score),
    feasibility_score: Number(payload.feasibility_score),
    risk_awareness_score: Number(payload.risk_awareness_score),
    verdict: payload.verdict,
    critique: normalizeText(payload.critique),
    adopted_ideas: normalizeList(payload.adopted_ideas),
    major_concerns: normalizeList(payload.major_concerns),
    updated_at: new Date().toISOString(),
  };

  const index = session.reviews.findIndex((entry) => entry.reviewer_bot === review.reviewer_bot && entry.target_bot === review.target_bot);
  if (index >= 0) session.reviews[index] = review;
  else session.reviews.push(review);

  session.updated_at = new Date().toISOString();
  return refreshSessionStatus(session);
}

// ─── Formatting ────────────────────────────────────────────────────────────

export function formatSessionList(sessions) {
  if (!sessions.length) return "No council sessions found.";
  return sessions
    .slice()
    .reverse()
    .map((session) => `- ${session.session_id} | ${session.status} | mode=${session.activated_mode} | objective=${session.objective}`)
    .join("\n");
}

export function formatSession(session) {
  const completedPositions = countCompletedPositions(session);
  const completedReviews = countCompletedReviews(session);
  const roleLines = COUNCIL_BOT_ORDER.map((bot) => {
    const brief = COUNCIL_BOT_BRIEFS[bot];
    return `- ${brief.label}: ${brief.mandate}`;
  });
  roleLines.push(`- ${CHAIRMAN_LABEL}: Synthesizes consensus, disagreements, discarded ideas, risk ranking, and the next recommended move.`);

  const reviewLines = session.peer_review_queue.map((item, index) => `${index + 1}. ${titleCaseBot(item.reviewer_bot)} -> ${titleCaseBot(item.target_bot)}`);

  return [
    `## Council Session: ${session.session_id}`,
    `- Status: ${session.status}`,
    `- Requested mode: ${session.requested_mode}`,
    `- Activated mode: ${session.activated_mode}`,
    `- Maximum rounds: ${session.maximum_rounds}`,
    `- Objective: ${session.objective}`,
    `- Desired output: ${session.desired_output}`,
    `- Constraints: ${session.constraints.join('; ') || '(none)'}`,
    `- Positions: ${completedPositions}/${COUNCIL_BOT_ORDER.length}`,
    `- Reviews: ${completedReviews}/${session.required_review_count}`,
    "",
    "### Gate",
    formatGateResult(session.gate),
    "",
    "### Bots",
    ...roleLines,
    "",
    "### Peer review queue",
    ...(reviewLines.length ? reviewLines : ["(not activated)"]),
    "",
    "### Stop rules",
    ...session.stop_rules.map((rule) => `- ${rule}`),
  ].join("\n");
}

```
