# src/council-prompts.js

- kind: js
- lines: 341
- bytes: 12379

## Summary
@module council-prompts Prompt building, constants, Zod schemas, and schema examples for Council Live.

## Imports
- `zod`
- `./helpers.js`
- `./council.js`

## Exports
- `LIVE_MODE_VALUES`
- `PROMPT_STAGE_VALUES`
- `REVIEW_VERDICTS`
- `CHAIRMAN_CONFIDENCE`
- `SCORE_MIN`
- `SCORE_MAX`
- `MAX_LIST_ITEMS`
- `SIMPLE_IO_SYSTEM_PROMPT`
- `normalizeText`
- `normalizeBot`
- `toArray`
- `normalizeList`
- `toInteger`
- `clamp`
- `titleCaseBot`
- `formatConstraints`
- `renderContextBlock`
- `formatGate`
- `buildPositionSchemaExample`
- `buildReviewSchemaExample`
- `buildChairmanSchemaExample`
- `buildSharedPromptRules`
- `buildPositionPrompt`
- `buildReviewPrompt`
- `buildChairmanPrompt`
- `buildIoFinalPrompt`
- `buildSimpleExecutionPrompt`
- `positionSchema`
- `reviewSchema`
- `chairmanSchema`

## Source
```js
/**
 * @module council-prompts
 * Prompt building, constants, Zod schemas, and schema examples for Council Live.
 */

import { z } from "zod";
import { normalizeText, normalizeList, toArray, serializePretty } from "./helpers.js";
import { COUNCIL_BOT_ORDER, COUNCIL_BOT_BRIEFS } from "./council.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVE_MODE_VALUES = ["simple", "deep", "auto"];
const PROMPT_STAGE_VALUES = ["bot_position", "peer_review", "chairman", "io_final"];
const REVIEW_VERDICTS = ["support", "mixed", "reject"];
const CHAIRMAN_CONFIDENCE = ["low", "medium", "high"];
const SCORE_MIN = 1;
const SCORE_MAX = 5;
const MAX_LIST_ITEMS = 3;

const SIMPLE_IO_SYSTEM_PROMPT = [
  "Você é o agente I/O final do Stack Perfeita MCP.",
  "Responda direto, sem introdução, sem repetir a pergunta, sem frases de aquecimento.",
  "Se faltar evidência, diga isso com clareza e sem inventar.",
  "Se receber análise interna em JSON, converta para resposta natural objetiva sem mencionar bots, council, chairman, debate ou análise interna.",
  "Priorize resposta útil, compacta, verificável e orientada ao próximo passo.",
].join(" ");

// ─── Helper Functions ─────────────────────────────────────────────────────────

// normalizeText imported from ./helpers.js

function normalizeBot(value, fallback = "") {
  const bot = normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return COUNCIL_BOT_ORDER.includes(bot) ? bot : fallback;
}

// toArray imported from ./helpers.js

// normalizeList imported from ./helpers.js

function toInteger(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback = min) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function titleCaseBot(bot) {
  const brief = COUNCIL_BOT_BRIEFS[bot];
  return brief?.label || bot;
}

function formatConstraints(constraints = []) {
  const items = normalizeList(constraints, 6);
  if (!items.length) return "- none";
  return items.map((item) => `- ${item}`).join("\n");
}

function renderContextBlock(value) {
  const text = String(value ?? "").trim();
  return text || "none";
}

function formatGate(gate) {
  return [
    `- recommendation: ${gate.recommendation}`,
    `- score: ${gate.score}`,
    `- maximum_rounds: ${gate.maximum_rounds}`,
    `- reasons: ${gate.reasons.length ? gate.reasons.join("; ") : "none"}`,
  ].join("\n");
}

// ─── Schema Examples ──────────────────────────────────────────────────────────

function buildPositionSchemaExample(bot) {
  return serializePretty({
    bot,
    problem_frame: "Como este papel enxerga o problema real",
    thesis: "Recomendação central deste papel",
    assumptions: ["Assunção 1", "Assunção 2"],
    opportunities: ["Oportunidade 1"],
    risks: ["Risco 1", "Risco 2"],
    next_steps: ["Próximo passo 1", "Próximo passo 2"],
    evidence: "Arquivos, testes, constraints ou fatos concretos que sustentam a posição",
    confidence: 84,
    tags: ["arquitetura", "risco"],
  });
}

function buildReviewSchemaExample(reviewerBot, targetBot) {
  return serializePretty({
    reviewer_bot: reviewerBot,
    target_bot: targetBot,
    correctness_score: 4,
    novelty_score: 3,
    feasibility_score: 5,
    risk_awareness_score: 4,
    verdict: "support",
    critique: "Crítica curta, específica e verificável.",
    adopted_ideas: ["Uma ideia do alvo que vale reaproveitar"],
    major_concerns: ["Maior preocupação para o chairman considerar"],
  });
}

function buildChairmanSchemaExample() {
  return serializePretty({
    recommended_answer: "Resposta interna recomendada antes da conversão final para linguagem natural.",
    alternatives: ["Alternativa 1", "Alternativa 2"],
    next_step: "Próximo passo prioritário e executável.",
    rationale: ["Fundamento 1", "Fundamento 2"],
    risk_ranking: ["Risco alto", "Risco médio"],
    evidence_missing: ["Evidência faltante 1"],
    confidence: "medium",
  });
}

// ─── Shared Prompt Rules ──────────────────────────────────────────────────────

function buildSharedPromptRules() {
  return [
    "REGRAS GERAIS:",
    "1. Saída obrigatória em JSON válido, sem markdown, sem code fence, sem comentário.",
    "2. Sem introdução, sem frases de aquecimento, sem repetir contexto recebido.",
    "3. Se faltar evidência, registre isso no campo evidence/major_concerns/evidence_missing em vez de inventar.",
    "4. Limite cada lista a no máximo 3 itens curtos e úteis.",
    "5. Não misture sua persona com as demais. Faça apenas o papel solicitado nesta etapa.",
    "6. Seja anti-teatro: divergência precisa ser útil, específica e apontar caminho melhor ou risco real.",
  ].join("\n");
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildPositionPrompt({ bot, objective, context, desired_output, constraints }) {
  const brief = COUNCIL_BOT_BRIEFS[bot];
  const lines = [
    `PAPEL ATIVO: ${brief.label}`,
    `MANDATO: ${brief.mandate}`,
    "",
    "FOCO:",
    ...brief.focus.map((item) => `- ${item}`),
    "",
    "EVITE:",
    ...brief.avoid.map((item) => `- ${item}`),
    "",
    buildSharedPromptRules(),
    "",
    "SCHEMA JSON OBRIGATÓRIO:",
    buildPositionSchemaExample(bot),
    "",
    "INPUT:",
    `objective: ${normalizeText(objective)}`,
    `desired_output: ${normalizeText(desired_output)}`,
    "constraints:",
    formatConstraints(constraints),
    "context:",
    renderContextBlock(context),
  ];
  return lines.join("\n");
}

function buildReviewPrompt({ reviewer_bot, target_bot, objective, context }) {
  const reviewer = COUNCIL_BOT_BRIEFS[reviewer_bot];
  const target = COUNCIL_BOT_BRIEFS[target_bot];
  const lines = [
    `PAPEL ATIVO: ${reviewer?.label || reviewer_bot}`,
    `MISSÃO: revisar criticamente a posição de ${target?.label || target_bot}.`,
    "",
    buildSharedPromptRules(),
    "",
    "REGRAS DE REVIEW:",
    "1. Avalie correctness, novelty, feasibility e risk_awareness com notas de 1 a 5.",
    "2. critique deve ser curta, concreta e útil.",
    "3. adopted_ideas deve conter apenas ideias que você realmente incorporaria.",
    "4. major_concerns deve apontar o que o Chairman não pode ignorar.",
    "",
    "SCHEMA JSON OBRIGATÓRIO:",
    buildReviewSchemaExample(reviewer_bot, target_bot),
    "",
    "INPUT:",
    `objective: ${normalizeText(objective)}`,
    "context:",
    renderContextBlock(context),
    "position_json_to_review:",
    "PASTE_THE_TARGET_BOT_JSON_HERE",
  ];
  return lines.join("\n");
}

function buildChairmanPrompt({ objective, context, desired_output, constraints }) {
  return [
    "PAPEL ATIVO: The Chairman",
    "MISSÃO: sintetizar 5 posições + reviews em uma recomendação compacta, auditável e útil.",
    "",
    buildSharedPromptRules(),
    "",
    "REGRAS DO CHAIRMAN:",
    "1. Não faça resumo decorativo. Entregue convergência, divergência, risco e próximo passo.",
    "2. Considere somente o que estiver presente nas posições e reviews recebidos.",
    "3. Se houver evidência faltante, liste explicitamente.",
    "4. confidence deve ser low, medium ou high.",
    "",
    "SCHEMA JSON OBRIGATÓRIO:",
    buildChairmanSchemaExample(),
    "",
    "INPUT:",
    `objective: ${normalizeText(objective)}`,
    `desired_output: ${normalizeText(desired_output)}`,
    "constraints:",
    formatConstraints(constraints),
    "context:",
    renderContextBlock(context),
    "shuffled_positions_json:",
    "PASTE_THE_5_POSITION_JSON_OBJECTS_HERE",
    "peer_reviews_json:",
    "PASTE_THE_PEER_REVIEW_JSON_OBJECTS_HERE",
  ].join("\n");
}

function buildIoFinalPrompt({ objective, desired_output }) {
  return [
    "PAPEL ATIVO: I/O Final",
    `SYSTEM: ${SIMPLE_IO_SYSTEM_PROMPT}`,
    "",
    "MISSÃO:",
    "- Receber a pergunta original e um JSON interno já consolidado.",
    "- Responder em linguagem natural objetiva.",
    "- Não mencionar bots, council, chairman, JSON, análise interna ou etapas ocultas.",
    "- Se houver alternativa relevante, incorporar de forma breve.",
    "",
    "INPUT:",
    `objective: ${normalizeText(objective)}`,
    `desired_output: ${normalizeText(desired_output)}`,
    "chairman_json_or_internal_analysis:",
    "PASTE_THE_INTERNAL_JSON_HERE",
  ].join("\n");
}

function buildSimpleExecutionPrompt({ objective, context, desired_output, constraints }) {
  return [
    `SYSTEM: ${SIMPLE_IO_SYSTEM_PROMPT}`,
    "",
    "MODO: simple",
    "REGRAS:",
    "1. Responder com base apenas no contexto fornecido.",
    "2. Sem aquecimento verbal, sem repetir a pergunta.",
    "3. Se faltar evidência, diga exatamente o que falta.",
    "4. Priorize resposta final útil e curta.",
    "",
    "INPUT:",
    `objective: ${normalizeText(objective)}`,
    `desired_output: ${normalizeText(desired_output)}`,
    "constraints:",
    formatConstraints(constraints),
    "context:",
    renderContextBlock(context),
  ].join("\n");
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

function positionSchema() {
  return z.object({
    bot: z.enum(COUNCIL_BOT_ORDER),
    problem_frame: z.string().min(1),
    thesis: z.string().min(1),
    assumptions: z.array(z.string()).max(MAX_LIST_ITEMS),
    opportunities: z.array(z.string()).max(MAX_LIST_ITEMS),
    risks: z.array(z.string()).max(MAX_LIST_ITEMS),
    next_steps: z.array(z.string()).max(MAX_LIST_ITEMS),
    evidence: z.string().min(1),
    confidence: z.number().int().min(0).max(100),
    tags: z.array(z.string()).max(5),
  });
}

function reviewSchema() {
  return z.object({
    reviewer_bot: z.enum(COUNCIL_BOT_ORDER),
    target_bot: z.enum(COUNCIL_BOT_ORDER),
    correctness_score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
    novelty_score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
    feasibility_score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
    risk_awareness_score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
    verdict: z.enum(REVIEW_VERDICTS),
    critique: z.string().min(1),
    adopted_ideas: z.array(z.string()).max(2),
    major_concerns: z.array(z.string()).max(2),
  });
}

function chairmanSchema() {
  return z.object({
    recommended_answer: z.string().min(1),
    alternatives: z.array(z.string()).max(MAX_LIST_ITEMS),
    next_step: z.string().min(1),
    rationale: z.array(z.string()).max(MAX_LIST_ITEMS),
    risk_ranking: z.array(z.string()).max(MAX_LIST_ITEMS),
    evidence_missing: z.array(z.string()).max(MAX_LIST_ITEMS),
    confidence: z.enum(CHAIRMAN_CONFIDENCE),
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  LIVE_MODE_VALUES,
  PROMPT_STAGE_VALUES,
  REVIEW_VERDICTS,
  CHAIRMAN_CONFIDENCE,
  SCORE_MIN,
  SCORE_MAX,
  MAX_LIST_ITEMS,
  SIMPLE_IO_SYSTEM_PROMPT,
  normalizeText,
  normalizeBot,
  toArray,
  normalizeList,
  toInteger,
  clamp,
  titleCaseBot,
  formatConstraints,
  renderContextBlock,
  formatGate,
  buildPositionSchemaExample,
  buildReviewSchemaExample,
  buildChairmanSchemaExample,
  buildSharedPromptRules,
  buildPositionPrompt,
  buildReviewPrompt,
  buildChairmanPrompt,
  buildIoFinalPrompt,
  buildSimpleExecutionPrompt,
  positionSchema,
  reviewSchema,
  chairmanSchema,
};

```
