/**
 * RAG Quality Evaluation Framework
 * Structured evaluation with faithfulness, relevance, precision, and recall metrics.
 */

import { z } from "zod";

// ─── Dataset Contract Schema ────────────────────────────────────────────────
const SampleSchema = z.object({
  id: z.string(),
  question: z.string(),
  ground_truth: z.string(),
  contexts: z.array(z.string()),
  metadata: z.object({
    source: z.string(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    category: z.string(),
  }),
});

const DatasetSchema = z.object({
  samples: z.array(SampleSchema),
});

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Tokenize text into lowercase words, removing punctuation
 */
function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Extract meaningful keywords (remove stopwords)
 */
function extractKeywords(text) {
  const stopwords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "not", "no", "nor", "so", "if", "then", "than", "too", "very",
    "just", "about", "also", "what", "which", "who", "whom", "where",
    "when", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "only", "own", "same", "that",
    "this", "these", "those", "it", "its", "they", "them", "their",
    "we", "our", "you", "your", "he", "him", "his", "she", "her", "my",
  ]);

  return tokenize(text).filter((w) => !stopwords.has(w));
}

// ─── Metric Functions ───────────────────────────────────────────────────────

/**
 * Faithfulness: Does the answer stay faithful to the provided contexts?
 * Checks if answer tokens exist in contexts.
 * @returns {number} Score 0-1
 */
export function calculateFaithfulness(answer, contexts) {
  if (!answer || !contexts || contexts.length === 0) return 0;

  const answerTokens = new Set(tokenize(answer));
  if (answerTokens.size === 0) return 0;

  const contextTokens = new Set(contexts.flatMap(tokenize));
  if (contextTokens.size === 0) return 0;

  let matched = 0;
  for (const token of answerTokens) {
    if (contextTokens.has(token)) matched++;
  }

  return matched / answerTokens.size;
}

/**
 * Answer Relevance: Does the answer address the question?
 * Checks keyword overlap between question and answer.
 * @returns {number} Score 0-1
 */
export function calculateAnswerRelevance(question, answer) {
  if (!question || !answer) return 0;

  const questionKeywords = new Set(extractKeywords(question));
  const answerKeywords = new Set(extractKeywords(answer));

  if (questionKeywords.size === 0 || answerKeywords.size === 0) return 0;

  let matched = 0;
  for (const keyword of questionKeywords) {
    if (answerKeywords.has(keyword)) matched++;
  }

  return matched / questionKeywords.size;
}

/**
 * Context Precision: Are the provided contexts relevant?
 * Checks if contexts contain answer-relevant keywords.
 * @returns {number} Score 0-1
 */
export function calculateContextPrecision(question, contexts) {
  if (!question || !contexts || contexts.length === 0) return 0;

  const questionKeywords = new Set(extractKeywords(question));
  if (questionKeywords.size === 0) return 0;

  const contextTokens = new Set(contexts.flatMap(tokenize));
  if (contextTokens.size === 0) return 0;

  let matched = 0;
  for (const keyword of questionKeywords) {
    if (contextTokens.has(keyword)) matched++;
  }

  return matched / questionKeywords.size;
}

/**
 * Context Recall: Does the context cover the ground truth?
 * Checks overlap between ground truth and contexts.
 * @returns {number} Score 0-1
 */
export function calculateContextRecall(ground_truth, contexts) {
  if (!ground_truth || !contexts || contexts.length === 0) return 0;

  const groundTruthTokens = new Set(tokenize(ground_truth));
  if (groundTruthTokens.size === 0) return 0;

  const contextTokens = new Set(contexts.flatMap(tokenize));
  if (contextTokens.size === 0) return 0;

  let matched = 0;
  for (const token of groundTruthTokens) {
    if (contextTokens.has(token)) matched++;
  }

  return matched / groundTruthTokens.size;
}

/**
 * Calculate overall quality score (weighted average of all metrics)
 * @returns {number} Score 0-1
 */
export function calculateOverallQuality(metrics) {
  const weights = {
    faithfulness: 0.3,
    answerRelevance: 0.25,
    contextPrecision: 0.25,
    contextRecall: 0.2,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  if (metrics.faithfulness !== undefined) {
    weightedSum += metrics.faithfulness * weights.faithfulness;
    totalWeight += weights.faithfulness;
  }
  if (metrics.answerRelevance !== undefined) {
    weightedSum += metrics.answerRelevance * weights.answerRelevance;
    totalWeight += weights.answerRelevance;
  }
  if (metrics.contextPrecision !== undefined) {
    weightedSum += metrics.contextPrecision * weights.contextPrecision;
    totalWeight += weights.contextPrecision;
  }
  if (metrics.contextRecall !== undefined) {
    weightedSum += metrics.contextRecall * weights.contextRecall;
    totalWeight += weights.contextRecall;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ─── Tool Registration ──────────────────────────────────────────────────────

/**
 * Register RAG evaluation tools on the MCP server.
 */
export function registerRagEvalTools(server) {
  // ── evaluate_rag_quality ──────────────────────────────────────────────────
  server.tool(
    "evaluate_rag_quality",
    "Evaluates RAG output quality with faithfulness, relevance, precision, and recall metrics",
    {
      question: z.string().describe("The user question"),
      answer: z.string().describe("The generated answer to evaluate"),
      contexts: z.array(z.string()).describe("Retrieved contexts used to generate the answer"),
      ground_truth: z.string().optional().describe("Expected correct answer for context recall calculation"),
    },
    async ({ question, answer, contexts, ground_truth }) => {
      try {
        const faithfulness = calculateFaithfulness(answer, contexts);
        const answerRelevance = calculateAnswerRelevance(question, answer);
        const contextPrecision = calculateContextPrecision(question, contexts);
        const contextRecall = ground_truth ? calculateContextRecall(ground_truth, contexts) : undefined;

        const metrics = {
          faithfulness,
          answerRelevance,
          contextPrecision,
        };
        if (contextRecall !== undefined) metrics.contextRecall = contextRecall;

        const overallQuality = calculateOverallQuality(metrics);

        const result = {
          metrics: {
            faithfulness: Math.round(faithfulness * 100) / 100,
            answerRelevance: Math.round(answerRelevance * 100) / 100,
            contextPrecision: Math.round(contextPrecision * 100) / 100,
          },
          overallQuality: Math.round(overallQuality * 100) / 100,
        };

        if (contextRecall !== undefined) {
          result.metrics.contextRecall = Math.round(contextRecall * 100) / 100;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error evaluating RAG quality: ${e.message}` }] };
      }
    }
  );

  // ── validate_eval_dataset ─────────────────────────────────────────────────
  server.tool(
    "validate_eval_dataset",
    "Validates an evaluation dataset against the standard contract",
    { dataset: z.string().describe("JSON string of the dataset to validate") },
    async ({ dataset }) => {
      try {
        const parsed = JSON.parse(dataset);
        const result = DatasetSchema.safeParse(parsed);

        if (result.success) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                valid: true,
                sampleCount: result.data.samples.length,
                message: "Dataset is valid",
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              valid: false,
              errors: result.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
              })),
            }, null, 2),
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              valid: false,
              errors: [{ path: "root", message: `Invalid JSON: ${e.message}` }],
            }, null, 2),
          }],
        };
      }
    }
  );
}
