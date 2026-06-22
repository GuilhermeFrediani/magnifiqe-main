/**
 * Stack Perfeita MCP — Prompt Adapter (GAP-1)
 * Model-Specific Prompt Templates.
 * Adapts prompts, scaffolding, and output format based on the model being used.
 *
 * Tools:
 *   adapt_prompt       — Transform a base prompt for a target model and task type.
 *   get_model_strategy — Return optimal scaffolding/format/tips for model+task+difficulty.
 *   suggest_model      — Recommend which model to use for a task description.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";
import { PROFILES, MODEL_ALIASES, resolveProfile } from "./profiles.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const TASK_TYPES = ["code", "debug", "architecture", "review", "docs"];
const DIFFICULTY_LEVELS = ["easy", "medium", "hard"];

/**
 * Scaffolding levels mapped by model family × difficulty.
 * Keys are profile ids; values map difficulty → scaffolding level.
 */
const SCAFFOLDING_MATRIX = {
  claude: { easy: "minimal", medium: "standard", hard: "standard" },
  gpt:    { easy: "minimal", medium: "standard", hard: "standard" },
  gemini: { easy: "minimal", medium: "minimal", hard: "standard" },
  glm:    { easy: "standard", medium: "heavy", hard: "heavy" },
  mimo:   { easy: "standard", medium: "heavy", hard: "heavy" },
};

/**
 * Output format templates by model × task_type.
 * Each entry is a human-readable format description the model should follow.
 */
const OUTPUT_FORMATS = {
  claude: {
    code:         "Verbatim code block + one-line summary of what changed.",
    debug:        "Hypothesis → evidence → fix → verification steps.",
    architecture: "Bullets: constraint, decision, tradeoff, verification.",
    review:       "Per-file findings as: location, issue, fix. Evidence-backed.",
    docs:         "Concise sections with headers. Reference rule files when applicable.",
  },
  gpt: {
    code:         "Checklist of changes + final artifact block.",
    debug:        "Step-by-step root-cause analysis + fix with checklist.",
    architecture: "Structured sections: Context, Decision, Tradeoffs, Next Steps.",
    review:       "Checklist per file: status, issue, severity, recommendation.",
    docs:         "Structured sections with explicit schema or table where data matters.",
  },
  gemini: {
    code:         "Code block + brief explanation. Grounded with file references.",
    debug:        "Factual diagnosis: symptom → cause → fix. Evidence bullets.",
    architecture: "Sections with evidence bullets. Source-grounded decisions.",
    review:       "Sections per concern: evidence, finding, recommendation.",
    docs:         "Direct sections with source attribution. Factual tone.",
  },
  glm: {
    code:         "Goal → approach → code → verification. Explicit acceptance criteria.",
    debug:        "Goal → hypothesis → check → fix → proof it works.",
    architecture: "Goal → constraints → decision → proof. More examples for clarity.",
    review:       "Goal per file → checks performed → evidence → next step.",
    docs:         "Goal → sections → concrete examples. Keep scaffolding explicit.",
  },
  mimo: {
    code:         "Single-task checklist: objective → code → stop when verified.",
    debug:        "One hypothesis at a time. Verify before moving on.",
    architecture: "Minimal context: constraint → decision → verify. Hard stop on failure.",
    review:       "One finding per pass. Concrete check, concrete fix.",
    docs:         "Compact sections. One objective per block. Verify output.",
  },
};

/**
 * Tips by model × difficulty.
 */
const STRATEGY_TIPS = {
  claude: {
    easy: [
      "Keep output terse — one block, one summary.",
      "Cache-friendly: put stable context at the top.",
    ],
    medium: [
      "Use bullet points over paragraphs.",
      "Call tools before asserting facts.",
      "Checkpoint after each logical change.",
    ],
    hard: [
      "Expand reasoning only where ambiguity exists.",
      "Evidence-first: show proof before claiming success.",
      "Leverage prompt cache — keep rules prefix stable.",
      "Compact logs/diffs at natural breakpoints.",
    ],
  },
  gpt: {
    easy: [
      "Result-oriented: lead with the answer.",
      "Keep output schema explicit.",
    ],
    medium: [
      "Use structured outputs for data-heavy tasks.",
      "Avoid preamble — go straight to action.",
      "Verify tool results before responding.",
    ],
    hard: [
      "Explicit output contract: checklist + final artifact.",
      "Rotate volatile context aggressively (128K window).",
      "Function calling over prose descriptions.",
      "Summarize long context before processing.",
    ],
  },
  gemini: {
    easy: [
      "Direct and factual. Code blocks for code output.",
      "Keep reasoning compressed.",
    ],
    medium: [
      "Ground answers with source attribution.",
      "Use declared tools systematically.",
      "Compact noisy runtime output.",
    ],
    hard: [
      "Leverage 1M context but still compact for quality.",
      "Verify file existence and mutations before success claims.",
      "Place stable rules in reusable cached prefix.",
      "Sections + evidence bullets for complex output.",
    ],
  },
  glm: {
    easy: [
      "Short task framing plus strong acceptance criteria.",
      "Be direct and explicit.",
    ],
    medium: [
      "More scaffolding: add examples for clarity.",
      "Use tools early, restate findings compactly.",
      "Assume less benefit from prompt ritual.",
    ],
    hard: [
      "Heavy scaffolding with explicit chain-of-thought.",
      "Concrete checks rather than long rationale.",
      "Compact aggressively after noisy tool output.",
      "Keep only the current hypothesis alive.",
    ],
  },
  mimo: {
    easy: [
      "Ultra-compact: one objective at a time.",
      "No optional digressions.",
    ],
    medium: [
      "Tight scaffolding with explicit state tracking.",
      "Short tool-driven loops: inspect → change → validate.",
      "Compact early, checkpoint often.",
    ],
    hard: [
      "Single-task focus. Hard stop on failure.",
      "Short verified loops only.",
      "Do not rely on verbose scaffolding.",
      "One hypothesis at a time — verify before next.",
    ],
  },
};

/**
 * Model scoring weights for suggest_model.
 * Each model gets a base score per task type, adjusted at runtime by capability flags.
 */
const TASK_AFFINITY = {
  claude:     { code: 9, debug: 8, architecture: 9, review: 9, docs: 8 },
  gpt:        { code: 9, debug: 8, architecture: 8, review: 8, docs: 9 },
  gemini:     { code: 7, debug: 7, architecture: 7, review: 7, docs: 8 },
  glm:        { code: 7, debug: 7, architecture: 7, review: 7, docs: 6 },
  mimo:       { code: 8, debug: 8, architecture: 6, review: 7, docs: 5 },
};

/**
 * Reason templates keyed by task_type for suggest_model explanations.
 */
const TASK_REASONS = {
  code:         "strong code generation and reasoning",
  debug:        "systematic debugging and root-cause analysis",
  architecture: "architectural decision-making and tradeoff analysis",
  review:       "evidence-backed code review with concrete findings",
  docs:         "structured documentation with clear output contracts",
};

// ─── Prompt Transformation Engine ───────────────────────────────────────────

/**
 * Detect which model family a prompt was likely written for (heuristic).
 * Returns the profile id or "generic" if no strong signal.
 */
function detectPromptOrigin(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("evidence-first") || lower.includes("cache-friendly") || lower.includes("bullet points")) return "claude";
  if (lower.includes("checklist") || lower.includes("structured output") || lower.includes("result-oriented")) return "gpt";
  if (lower.includes("source attribution") || lower.includes("fact-based") || lower.includes("grounded")) return "gemini";
  if (lower.includes("acceptance criteria") || lower.includes("chain-of-thought") || lower.includes("explicit state")) return "glm";
  if (lower.includes("single-task") || lower.includes("hard stop") || lower.includes("one hypothesis")) return "mimo";
  return "generic";
}

/**
 * Extract existing structure signals from a prompt.
 */
function analyzePromptStructure(prompt) {
  const hasSections = /^#{1,6}\s/m.test(prompt);
  const hasBullets = /^[\-\*]\s/m.test(prompt);
  const hasCodeBlocks = /```/.test(prompt);
  const hasSteps = /^\d+[\.\)]\s/m.test(prompt);
  const hasXMLTags = /<[a-z][a-z0-9]*>/.test(prompt);
  const lineCount = prompt.split("\n").length;
  const wordCount = prompt.split(/\s+/).length;

  return { hasSections, hasBullets, hasCodeBlocks, hasSteps, hasXMLTags, lineCount, wordCount };
}

/**
 * Claude-specific transformations: terse, evidence-first, cache-friendly.
 */
function adaptForClaude(prompt, taskType, analysis) {
  const adaptations = [];
  let adapted = prompt;

  // Add evidence-first framing for debug/review tasks
  if (taskType === "debug" || taskType === "review") {
    if (!adapted.toLowerCase().includes("evidence")) {
      adapted = `## Task\n${adapted}\n\n## Evidence Required\nProvide concrete evidence (file paths, line numbers, output) for every claim.`;
      adaptations.push("added evidence-first framing");
    }
  }

  // Ensure cache-friendly structure: stable instructions at top
  if (!adapted.toLowerCase().includes("task") && !adapted.toLowerCase().includes("objective")) {
    adapted = `## Task\n${adapted}`;
    adaptations.push("added task header for cache-friendly structure");
  }

  // For code tasks, add verification step
  if (taskType === "code") {
    if (!adapted.toLowerCase().includes("verif")) {
      adapted += "\n\n## Verification\nAfter making changes, verify correctness with a targeted test or check.";
      adaptations.push("added verification step");
    }
  }

  // Compress verbose sections to bullets
  if (analysis.wordCount > 200 && !analysis.hasBullets) {
    adapted += "\n\nRespond with bullet points over paragraphs. Expand only where ambiguity exists.";
    adaptations.push("requested bullet-point format for brevity");
  }

  // Trim to essentials for docs
  if (taskType === "docs") {
    if (!adapted.toLowerCase().includes("concise")) {
      adapted += "\n\nKeep sections concise. Reference rule file names where applicable.";
      adaptations.push("added conciseness directive for docs");
    }
  }

  return { adapted, adaptations };
}

/**
 * GPT-specific transformations: structured output, result-oriented, explicit schemas.
 */
function adaptForGPT(prompt, taskType, analysis) {
  const adaptations = [];
  let adapted = prompt;

  // Add structured output framing
  if (!adapted.toLowerCase().includes("format") && !adapted.toLowerCase().includes("schema")) {
    const formatNote = taskType === "code"
      ? "Respond with a checklist of changes followed by the final code artifact."
      : taskType === "debug"
        ? "Respond with: Step-by-step root cause analysis, then the fix, then verification checklist."
        : taskType === "architecture"
          ? "Respond with structured sections: Context, Decision, Tradeoffs, Next Steps."
          : taskType === "review"
            ? "Respond with a checklist per file: status, issue, severity, recommendation."
            : "Respond with structured sections. Use tables or schemas where data is involved.";
    adapted = `${adapted}\n\n## Output Format\n${formatNote}`;
    adaptations.push("added explicit output format");
  }

  // Result-oriented: strip preamble if prompt is narrative-heavy
  if (analysis.hasSteps && analysis.lineCount > 20) {
    adapted += "\n\nAvoid preamble. Lead directly with the result.";
    adaptations.push("added result-oriented directive");
  }

  // For code tasks, ensure explicit contract
  if (taskType === "code" && !adapted.toLowerCase().includes("artifact")) {
    adapted += "\n\nDeliver a final artifact block with the complete solution.";
    adaptations.push("requested explicit final artifact");
  }

  // For review, add severity classification
  if (taskType === "review" && !adapted.toLowerCase().includes("severity")) {
    adapted += "\n\nClassify each finding by severity: critical | major | minor | nit.";
    adaptations.push("added severity classification for review findings");
  }

  return { adapted, adaptations };
}

/**
 * Gemini-specific transformations: concise, factual, less formatting overhead.
 */
function adaptForGemini(prompt, taskType, analysis) {
  const adaptations = [];
  let adapted = prompt;

  // Strip heavy XML/HTML scaffolding if present
  if (analysis.hasXMLTags && analysis.wordCount > 300) {
    adapted = adapted.replace(/<[a-z][a-z0-9]*>[\s\S]*?<\/[a-z][a-z0-9]*>/g, (match) => {
      // Keep content but strip wrapper tags
      return match.replace(/<\/?[a-z][a-z0-9]*>/g, "");
    });
    adaptations.push("stripped XML wrapper tags for conciseness");
  }

  // Add source attribution directive
  if (!adapted.toLowerCase().includes("source") && !adapted.toLowerCase().includes("reference")) {
    adapted += "\n\nGround answers with source attribution. Reference file paths and line numbers.";
    adaptations.push("added source attribution directive");
  }

  // For code tasks, keep code blocks prominent
  if (taskType === "code" && !adapted.toLowerCase().includes("code block")) {
    adapted += "\n\nUse code blocks for all code output. Brief explanation only.";
    adaptations.push("emphasized code block format");
  }

  // For debug, factual diagnosis style
  if (taskType === "debug") {
    adapted += "\n\nDiagnose factually: symptom → cause → fix → evidence.";
    adaptations.push("added factual diagnosis structure");
  }

  // Reduce formatting overhead for long prompts
  if (analysis.wordCount > 300 && analysis.hasSections) {
    adapted += "\n\nKeep reasoning compressed. Fewer headers, more substance.";
    adaptations.push("requested compressed reasoning for long prompts");
  }

  return { adapted, adaptations };
}

/**
 * GLM-specific transformations: simpler scaffolding, more examples, chain-of-thought.
 */
function adaptForGLM(prompt, taskType, analysis) {
  const adaptations = [];
  let adapted = prompt;

  // Add explicit goal framing
  if (!adapted.toLowerCase().includes("goal") && !adapted.toLowerCase().includes("objective")) {
    adapted = `## Goal\n${adapted}`;
    adaptations.push("added explicit goal framing");
  }

  // Add acceptance criteria
  if (!adapted.toLowerCase().includes("acceptance") && !adapted.toLowerCase().includes("criteria")) {
    const criteria = taskType === "code"
      ? "Code compiles, passes tests, and follows project conventions."
      : taskType === "debug"
        ? "Root cause identified, fix verified, regression check passed."
        : taskType === "architecture"
          ? "Decision is justified, tradeoffs documented, alternatives considered."
          : taskType === "review"
            ? "All findings have concrete evidence and actionable fixes."
            : "Content is accurate, well-structured, and references sources.";
    adapted += `\n\n## Acceptance Criteria\n- ${criteria}`;
    adaptations.push("added acceptance criteria");
  }

  // Add chain-of-thought for hard tasks
  if (!adapted.toLowerCase().includes("think") && !adapted.toLowerCase().includes("reasoning")) {
    adapted += "\n\nThink step by step. Show your reasoning before conclusions.";
    adaptations.push("added chain-of-thought directive");
  }

  // For debug/review, require explicit state
  if ((taskType === "debug" || taskType === "review") && !adapted.toLowerCase().includes("state")) {
    adapted += "\n\nTrack state explicitly: hypothesis → check → evidence → next step.";
    adaptations.push("added explicit state tracking");
  }

  // For code, add example-first pattern
  if (taskType === "code" && !analysis.hasCodeBlocks) {
    adapted += "\n\nProvide a concrete example of the expected output before implementing.";
    adaptations.push("added example-first pattern for code tasks");
  }

  return { adapted, adaptations };
}

/**
 * MiMo-specific transformations: ultra-compact, single-objective, tight scaffolding.
 */
function adaptForMiMo(prompt, taskType, analysis) {
  const adaptations = [];
  let adapted = prompt;

  // Strip verbose sections — keep only the core objective
  if (analysis.wordCount > 150) {
    // Extract the core instruction by looking for imperative sentences
    const lines = adapted.split("\n").filter(l => l.trim());
    const imperativeLines = lines.filter(l =>
      /^(do|make|create|fix|implement|add|remove|update|refactor|check|verify|test|write|ensure|build|deploy|analyze|review|debug|optimize)/i.test(l.trim()) ||
      /^##?\s/i.test(l.trim()) ||
      l.trim().length < 80
    );

    if (imperativeLines.length > 0 && imperativeLines.length < lines.length * 0.6) {
      adapted = imperativeLines.join("\n");
      adaptations.push("trimmed to imperative lines only for compactness");
    }
  }

  // Single-objective framing
  if (!adapted.toLowerCase().includes("one task") && !adapted.toLowerCase().includes("single objective")) {
    adapted = `[SINGLE OBJECTIVE]\n${adapted}`;
    adaptations.push("added single-objective framing");
  }

  // Hard stop on failure
  if (!adapted.toLowerCase().includes("stop") && !adapted.toLowerCase().includes("halt")) {
    adapted += "\n\nStop immediately if verification fails. Do not proceed to next step.";
    adaptations.push("added hard-stop-on-failure directive");
  }

  // For code, add inspect-change-validate loop
  if (taskType === "code") {
    adapted += "\n\nLoop: inspect → change → validate → checkpoint.";
    adaptations.push("added short tool-driven loop pattern");
  }

  // For debug, single-hypothesis approach
  if (taskType === "debug") {
    adapted += "\n\nOne hypothesis at a time. Verify before moving on.";
    adaptations.push("added single-hypothesis constraint");
  }

  return { adapted, adaptations };
}

/**
 * Generic transformations for unrecognized models.
 */
function adaptGeneric(prompt, taskType) {
  const adaptations = [];
  let adapted = prompt;

  if (!adapted.toLowerCase().includes("task") && !adapted.toLowerCase().includes("objective")) {
    adapted = `## Task\n${adapted}`;
    adaptations.push("added task header");
  }

  adapted += "\n\nBe concise. Provide evidence for all claims. Verify before asserting success.";
  adaptations.push("added general quality directives");

  return { adapted, adaptations };
}

/**
 * Master dispatch: pick the right transformer for the model family.
 */
function applyModelTransformations(prompt, profile, taskType) {
  const analysis = analyzePromptStructure(prompt);
  const transformers = {
    claude: adaptForClaude,
    gpt: adaptForGPT,
    gemini: adaptForGemini,
    glm: adaptForGLM,
    mimo: adaptForMiMo,
  };

  const transformer = transformers[profile.id];
  if (transformer) {
    return transformer(prompt, taskType, analysis);
  }
  return adaptGeneric(prompt, taskType);
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

/**
 * adapt_prompt — Transform a base prompt for a target model and task type.
 */
function handleAdaptPrompt({ prompt, model, task_type }) {
  try {
    const rlh = rateLimiter.check("adapt_prompt");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    const { requested, profile } = resolveProfile(model);

    if (!profile) {
      return {
        content: [{
          type: "text",
          text: `HALT: Unknown model "${requested}". Available families: ${Object.keys(PROFILES).join(", ")}. Pass a recognized model name or alias.`,
        }],
      };
    }

    const { adapted, adaptations } = applyModelTransformations(prompt, profile, task_type);

    // Add task-type-specific preamble based on profile verbosity guidance
    const preamble = `[Model: ${profile.name} | Task: ${task_type}]\n[Profile: verbosity=${profile.capabilities.recommended_output_contract}]\n\n`;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          adapted_prompt: preamble + adapted,
          model: requested,
          adaptations_applied: adaptations,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — adapt_prompt failed: ${e.message}` }] };
  }
}

/**
 * get_model_strategy — Return optimal scaffolding/format/tips for model+task+difficulty.
 */
function handleGetModelStrategy({ model, task_type, difficulty }) {
  try {
    const rlh = rateLimiter.check("get_model_strategy");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    const { requested, profile } = resolveProfile(model);

    if (!profile) {
      return {
        content: [{
          type: "text",
          text: `HALT: Unknown model "${requested}". Available families: ${Object.keys(PROFILES).join(", ")}.`,
        }],
      };
    }

    const scaffolding = SCAFFOLDING_MATRIX[profile.id]?.[difficulty] || "standard";
    const outputFormat = OUTPUT_FORMATS[profile.id]?.[task_type] || "Concise, evidence-backed response with clear structure.";
    const tips = STRATEGY_TIPS[profile.id]?.[difficulty] || [
      "Keep output concise and well-structured.",
      "Verify claims with concrete evidence.",
    ];

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          scaffolding_level: scaffolding,
          output_format: outputFormat,
          tips,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — get_model_strategy failed: ${e.message}` }] };
  }
}

/**
 * suggest_model — Recommend which model to use for a task description.
 */
function handleSuggestModel({ task_description, available_models }) {
  try {
    const rlh = rateLimiter.check("suggest_model");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    // Determine task type from description heuristics
    const descLower = task_description.toLowerCase();
    let detectedTaskType = "code"; // default

    if (/debug|error|fix|crash|exception|bug|traceback|stack trace/i.test(descLower)) {
      detectedTaskType = "debug";
    } else if (/architect|design|structure|system|pattern|scalab|migrat/i.test(descLower)) {
      detectedTaskType = "architecture";
    } else if (/review|audit|lint|check|security|vulnerab/i.test(descLower)) {
      detectedTaskType = "review";
    } else if (/doc|readme|comment|explain|guide|tutorial|changelog/i.test(descLower)) {
      detectedTaskType = "docs";
    }

    // Normalize available_models to profile ids
    const resolved = available_models.map(m => {
      const { profile } = resolveProfile(m);
      return profile ? profile.id : null;
    }).filter(Boolean);

    // Deduplicate
    const uniqueModels = [...new Set(resolved)];

    if (uniqueModels.length === 0) {
      return {
        content: [{
          type: "text",
          text: `HALT: None of the provided models (${available_models.join(", ")}) matched a known profile. Available families: ${Object.keys(PROFILES).join(", ")}.`,
        }],
      };
    }

    // Score each available model
    const scores = uniqueModels.map(id => {
      const base = TASK_AFFINITY[id]?.[detectedTaskType] || 5;
      const profile = PROFILES[id];

      // Bonus for structured output support on docs/review tasks
      let bonus = 0;
      if ((detectedTaskType === "docs" || detectedTaskType === "review") && profile.capabilities.supports_structured_output) {
        bonus += 0.5;
      }

      // Penalty for models that need tighter scaffolding on complex tasks (harder to prompt)
      if (profile.capabilities.needs_tighter_scaffolding && descLower.length > 200) {
        bonus -= 0.5;
      }

      // Bonus for larger context on architecture tasks
      if (detectedTaskType === "architecture" && profile.context_limit.includes("1M")) {
        bonus += 0.5;
      }

      return { id, score: base + bonus };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const recommended = scores[0].id;
    const alternatives = scores.slice(1).map(s => s.id);

    const reason = `Detected task type: "${detectedTaskType}". ${profileName(recommended)} scores highest for ${TASK_REASONS[detectedTaskType]}.` + (alternatives.length > 0 ? ` ${profileName(alternatives[0])} is a viable alternative.` : "");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          recommended,
          reason,
          alternatives,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — suggest_model failed: ${e.message}` }] };
  }
}

/**
 * Helper: get display name for a profile id.
 */
function profileName(id) {
  return PROFILES[id]?.name || id;
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Register all prompt-adapter tools on the MCP server.
 * @param {McpServer} server
 */
export function registerPromptAdapterTools(server) {
  // 1. adapt_prompt
  server.tool(
    "adapt_prompt",
    "Adapt a base prompt for a specific model and task type. Applies model-specific transformations (verbosity, structure, output format, scaffolding). Returns the optimized prompt and a list of adaptations applied.",
    {
      prompt: z.string().min(1).describe("The base prompt to transform."),
      model: z.string().min(1).describe('Target model name or alias (e.g. "claude", "gpt-4o", "mimo-v2.5").'),
      task_type: z.enum(TASK_TYPES).describe("The kind of task: code, debug, architecture, review, or docs."),
    },
    handleAdaptPrompt,
  );

  // 2. get_model_strategy
  server.tool(
    "get_model_strategy",
    "Return the optimal scaffolding level, output format, and prompting tips for a given model, task type, and difficulty combination.",
    {
      model: z.string().min(1).describe('Model name or alias (e.g. "claude", "gpt", "gemini-2.5-pro").'),
      task_type: z.enum(TASK_TYPES).describe("Task type: code, debug, architecture, review, or docs."),
      difficulty: z.enum(DIFFICULTY_LEVELS).describe("Task difficulty: easy, medium, or hard."),
    },
    handleGetModelStrategy,
  );

  // 3. suggest_model
  server.tool(
    "suggest_model",
    "Given a task description and a list of available models, recommend the best model for the job with reasoning and alternatives.",
    {
      task_description: z.string().min(1).describe("Natural-language description of the task to be performed."),
      available_models: z.array(z.string().min(1)).min(1).describe('List of available model names or aliases (e.g. ["claude", "gpt-4o", "mimo-v2.5"]).'),
    },
    handleSuggestModel,
  );
}
