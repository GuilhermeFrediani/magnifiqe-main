/**
 * Stack Perfeita MCP — Prompt Testing Framework (GAP-8)
 * Test and benchmark prompts systematically.
 *
 * Tools:
 *   test_prompt_effectiveness — Test a prompt against criteria, return effectiveness score.
 *   compare_prompts           — Compare two prompts for the same task.
 *   optimize_prompt           — Suggest improvements for a prompt.
 *   validate_prompt_safety    — Check prompt for safety issues.
 */

import { z } from "zod";
import { rateLimiter, withRateLimit } from "./rate-limiter.js";

// ─── Evaluation Criteria ─────────────────────────────────────────────────────

const EVALUATION_CRITERIA = {
  clarity: {
    weight: 0.25,
    checks: [
      { name: "clear_instructions", pattern: /\b(explain|describe|create|generate|implement|write|define|return|output|provide)\b/i, desc: "Uses clear action verbs" },
      { name: "no_ambiguity", pattern: /\b(maybe|possibly|perhaps|might|could be)\b/i, desc: "Avoids ambiguous language", negative: true },
      { name: "structured", pattern: /\n\s*[-*•]\s|\n\s*\d+[.)]\s|\n\s*#{1,3}\s/, desc: "Uses structured formatting" },
      { name: "concise", pattern: null, desc: "Reasonable length", custom: (p) => p.length <= 2000 && p.length >= 10 },
      { name: "no_jargon", pattern: /\b(per se|aforementioned|herein|thereof)\b/i, desc: "Avoids unnecessary jargon", negative: true },
    ],
  },
  specificity: {
    weight: 0.3,
    checks: [
      { name: "concrete_examples", pattern: /\b(example|for instance|e\.g\.|such as|like)\b/i, desc: "Includes examples" },
      { name: "output_format", pattern: /\b(format|json|markdown|xml|yaml|table|list|code block)\b/i, desc: "Specifies output format" },
      { name: "constraints", pattern: /\b(must|should|required|cannot|do not|never|always|only)\b/i, desc: "Defines constraints" },
      { name: "specific_domain", pattern: /\b(function|class|api|endpoint|database|algorithm|protocol)\b/i, desc: "References specific technical concepts" },
      { name: "measurable_criteria", pattern: /\b(\d+|percent|score|threshold|minimum|maximum|at least|up to)\b/i, desc: "Includes measurable criteria" },
    ],
  },
  completeness: {
    weight: 0.25,
    checks: [
      { name: "input_specified", pattern: /\b(input|given|provided|receive|accept)\b/i, desc: "Specifies expected input" },
      { name: "output_specified", pattern: /\b(output|return|produce|generate|result)\b/i, desc: "Specifies expected output" },
      { name: "edge_cases", pattern: /\b(if|when|error|invalid|empty|null|missing|edge case|handle)\b/i, desc: "Addresses edge cases" },
      { name: "context_provided", pattern: /\b(context|background|purpose|goal|objective|reason)\b/i, desc: "Provides context" },
      { name: "scope_defined", pattern: /\b(scope|limit|only|excluding|including|within)\b/i, desc: "Defines scope" },
    ],
  },
  edge_cases: {
    weight: 0.2,
    checks: [
      { name: "error_handling", pattern: /\b(error|exception|fail|invalid|malformed|unexpected)\b/i, desc: "Addresses error handling" },
      { name: "empty_input", pattern: /\b(empty|null|undefined|missing|absent|none)\b/i, desc: "Handles empty/missing input" },
      { name: "boundary_conditions", pattern: /\b(minimum|maximum|limit|range|between|at least|at most)\b/i, desc: "Defines boundary conditions" },
      { name: "conflict_resolution", pattern: /\b(conflict|priority|prefer|override|default|fallback)\b/i, desc: "Handles conflicts" },
      { name: "performance_considerations", pattern: /\b(performance|efficient|optimize|cache|batch|timeout)\b/i, desc: "Considers performance" },
    ],
  },
};

// ─── Safety Patterns ─────────────────────────────────────────────────────────

const SAFETY_PATTERNS = {
  injection: [
    { pattern: /\b(ignore|disregard|forget|override)\s+(previous|all|above|earlier|instructions?)\b/i, desc: "Instruction override attempt" },
    { pattern: /\b(you are now|act as|pretend to be|roleplay as|simulate being)\b/i, desc: "Identity manipulation" },
    { pattern: /\b(system prompt|hidden prompt|secret prompt|real prompt)\b/i, desc: "Prompt extraction attempt" },
    { pattern: /\b(jailbreak|DAN|do anything now|devmode)\b/i, desc: "Known jailbreak pattern" },
    { pattern: /\b(bypass|circumvent|evade|disable)\s+(safety|filter|restriction|limit)\b/i, desc: "Safety bypass attempt" },
  ],
  harmful: [
    { pattern: /\b(harm|hurt|damage|destroy|attack|exploit|steal)\b/i, desc: "Potentially harmful intent" },
    { pattern: /\b(illegal|unlawful|fraud|scam|phishing|malware)\b/i, desc: "Illegal activity references" },
    { pattern: /\b(hate|discriminate|harass|bully|threaten)\b/i, desc: "Hate/harassment content" },
    { pattern: /\b(sexual|explicit|nsfw|pornograph)\b/i, desc: "Explicit content", severity: "medium" },
    { pattern: /\b(weapon|bomb|explosive|poison|drug manufacturing)\b/i, desc: "Dangerous content" },
  ],
  bias: [
    { pattern: /\b(all|every|always|never|only)\s+(men|women|black|white|asian|hispanic|muslim|christian|jewish)\b/i, desc: "Stereotyping language" },
    { pattern: /\b(weak|strong|inferior|superior|better|worse)\s+(race|gender|ethnicity|religion)\b/i, desc: "Comparative bias" },
    { pattern: /\b(stay in the kitchen|men's work|women's work|typical male|typical female)\b/i, desc: "Gender role stereotyping" },
    { pattern: /\b(thug|ghetto|welfare queen|illegals)\b/i, desc: "Loaded/biased terminology" },
  ],
};

// ─── Prompt Analysis Helpers ─────────────────────────────────────────────────

/**
 * Analyze a prompt against a set of checks.
 * @param {string} prompt - The prompt text to analyze
 * @param {Array} checks - Array of check objects
 * @returns {Object} { passed: string[], failed: string[], score: number }
 */
function analyzeChecks(prompt, checks) {
  const passed = [];
  const failed = [];

  for (const check of checks) {
    let met = false;

    if (check.custom) {
      met = check.custom(prompt);
    } else if (check.pattern) {
      const found = check.pattern.test(prompt);
      met = check.negative ? !found : found;
    }

    if (met) {
      passed.push(check.name);
    } else {
      failed.push(check.name);
    }
  }

  const score = checks.length > 0 ? Math.round((passed.length / checks.length) * 100) : 0;
  return { passed, failed, score };
}

/**
 * Compute overall effectiveness score from category results.
 * @param {Object} categoryResults - Map of category name → { passed, failed, score }
 * @returns {{ score: number, criteria_met: string[], criteria_failed: string[] }}
 */
function computeOverallScore(categoryResults) {
  let weightedSum = 0;
  const criteriaMet = [];
  const criteriaFailed = [];

  for (const [category, result] of Object.entries(categoryResults)) {
    const weight = EVALUATION_CRITERIA[category]?.weight || 0.25;
    weightedSum += result.score * weight;
    criteriaMet.push(...result.passed.map(p => `${category}.${p}`));
    criteriaFailed.push(...result.failed.map(f => `${category}.${f}`));
  }

  return { score: Math.round(weightedSum), criteria_met: criteriaMet, criteria_failed: criteriaFailed };
}

/**
 * Generate improvement suggestions based on failed criteria.
 * @param {string[]} failed - List of failed criteria names
 * @returns {string[]}
 */
function generateSuggestions(failed) {
  const suggestions = [];
  const suggestionMap = {
    // Clarity
    clarity: {
      clear_instructions: "Use explicit action verbs (create, implement, return, explain) instead of passive descriptions.",
      no_ambiguity: "Replace hedging words (maybe, possibly, might) with definite statements.",
      structured: "Use bullet points, numbered lists, or headers to organize instructions.",
      concise: "Keep prompt between 10-2000 characters. Remove redundant phrases.",
      no_jargon: "Replace formal/legalistic language with plain, direct wording.",
    },
    // Specificity
    specificity: {
      concrete_examples: "Add 'e.g.' or 'for instance' with concrete input/output examples.",
      output_format: "Explicitly state the expected output format (JSON, markdown, table, etc.).",
      constraints: "Use 'must', 'cannot', 'never' to define hard constraints.",
      specific_domain: "Reference specific technical concepts, APIs, or data structures.",
      measurable_criteria: "Include numeric thresholds, scores, or quantifiable success metrics.",
    },
    // Completeness
    completeness: {
      input_specified: "Describe what input the prompt expects (type, format, source).",
      output_specified: "Describe the expected output structure, fields, and types.",
      edge_cases: "Add 'if/when' clauses for error, empty, or invalid input scenarios.",
      context_provided: "Explain the purpose, goal, or background of the task.",
      scope_defined: "State what is and isn't included in the task scope.",
    },
    // Edge Cases
    edge_cases: {
      error_handling: "Describe what should happen on errors or exceptions.",
      empty_input: "Specify behavior for empty, null, or missing inputs.",
      boundary_conditions: "Define minimum/maximum values, ranges, or limits.",
      conflict_resolution: "State priority rules or fallback behavior for conflicts.",
      performance_considerations: "Note performance requirements or optimization needs.",
    },
  };

  for (const criterion of failed) {
    const [category, checkName] = criterion.split(".");
    if (suggestionMap[category]?.[checkName]) {
      suggestions.push(`${criterion}: ${suggestionMap[category][checkName]}`);
    }
  }

  return suggestions;
}

/**
 * Score a prompt on individual metrics.
 * @param {string} prompt
 * @returns {{ clarity: number, specificity: number, completeness: number, edge_cases: number, overall: number }}
 */
function scorePrompt(prompt) {
  const results = {};
  for (const [category, config] of Object.entries(EVALUATION_CRITERIA)) {
    results[category] = analyzeChecks(prompt, config.checks).score;
  }
  let overall = 0;
  for (const [category, config] of Object.entries(EVALUATION_CRITERIA)) {
    overall += (results[category] || 0) * config.weight;
  }
  results.overall = Math.round(overall);
  return results;
}

/**
 * Detect task category hints in a prompt.
 */
function detectTaskHints(prompt) {
  const hints = [];
  if (/\b(code|implement|function|class|api|refactor)\b/i.test(prompt)) hints.push("code");
  if (/\b(debug|fix|error|bug|issue|problem|fail)\b/i.test(prompt)) hints.push("debug");
  if (/\b(review|assess|evaluate|check|audit)\b/i.test(prompt)) hints.push("review");
  if (/\b(explain|document|describe|readme|doc)\b/i.test(prompt)) hints.push("docs");
  if (/\b(architect|design|structure|layout|schema)\b/i.test(prompt)) hints.push("architecture");
  return hints.length > 0 ? hints : ["general"];
}

/**
 * Detect language/tech hints in a prompt.
 */
function detectTechHints(prompt) {
  const hints = [];
  if (/\b(python|pip|conda|pandas|numpy)\b/i.test(prompt)) hints.push("python");
  if (/\b(javascript|typescript|node|npm|bun)\b/i.test(prompt)) hints.push("javascript");
  if (/\b(rust|cargo|crate)\b/i.test(prompt)) hints.push("rust");
  if (/\b(sql|database|query|table|column)\b/i.test(prompt)) hints.push("database");
  if (/\b(api|rest|graphql|endpoint|http)\b/i.test(prompt)) hints.push("api");
  if (/\b(html|css|dom|browser|frontend)\b/i.test(prompt)) hints.push("frontend");
  return hints;
}

// ─── Tool Handlers ───────────────────────────────────────────────────────────

/**
 * test_prompt_effectiveness — Test a prompt against criteria, return effectiveness score.
 */
function handleTestPromptEffectiveness({ prompt, criteria, model }) {
  try {
    const categoryResults = {};
    for (const [category, config] of Object.entries(EVALUATION_CRITERIA)) {
      categoryResults[category] = analyzeChecks(prompt, config.checks);
    }

    const { score, criteria_met, criteria_failed } = computeOverallScore(categoryResults);
    const suggestions = generateSuggestions(criteria_failed);

    // Apply custom criteria filtering if provided
    let filteredMet = criteria_met;
    let filteredFailed = criteria_failed;

    if (criteria && criteria.length > 0) {
      const criteriaSet = new Set(criteria.map(c => c.toLowerCase()));
      filteredMet = criteria_met.filter(c => {
        const parts = c.split(".");
        return criteriaSet.has(c.toLowerCase()) || criteriaSet.has(parts[1]?.toLowerCase());
      });
      filteredFailed = criteria_failed.filter(c => {
        const parts = c.split(".");
        return criteriaSet.has(c.toLowerCase()) || criteriaSet.has(parts[1]?.toLowerCase());
      });
    }

    const result = {
      score,
      criteria_met: filteredMet,
      criteria_failed: filteredFailed,
      suggestions,
      meta: {
        model: model || "default",
        prompt_length: prompt.length,
        word_count: prompt.split(/\s+/).length,
        task_hints: detectTaskHints(prompt),
        tech_hints: detectTechHints(prompt),
        category_scores: Object.fromEntries(
          Object.entries(categoryResults).map(([k, v]) => [k, v.score])
        ),
      },
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — test_prompt_effectiveness failed: ${e.message}` }] };
  }
}

/**
 * compare_prompts — Compare two prompts for the same task.
 */
function handleComparePrompts({ prompt_a, prompt_b, task }) {
  try {
    const scoresA = scorePrompt(prompt_a);
    const scoresB = scorePrompt(prompt_b);

    // Determine winner
    let winner;
    const diff = scoresA.overall - scoresB.overall;

    if (Math.abs(diff) <= 3) {
      winner = "tie";
    } else if (diff > 0) {
      winner = "a";
    } else {
      winner = "b";
    }

    // Generate detailed reason
    const reasons = [];
    const categories = ["clarity", "specificity", "completeness", "edge_cases"];

    for (const cat of categories) {
      const delta = scoresA[cat] - scoresB[cat];
      if (delta > 10) {
        reasons.push(`Prompt A is stronger in ${cat} (+${delta})`);
      } else if (delta < -10) {
        reasons.push(`Prompt B is stronger in ${cat} (+${Math.abs(delta)})`);
      }
    }

    // Analyze structural differences
    const structuralDiffs = [];
    const lenA = prompt_a.split(/\s+/).length;
    const lenB = prompt_b.split(/\s+/).length;

    if (Math.abs(lenA - lenB) > 20) {
      structuralDiffs.push(`Prompt ${lenA > lenB ? "A" : "B"} is significantly longer (${Math.max(lenA, lenB)} vs ${Math.min(lenA, lenB)} words)`);
    }

    const hasExamplesA = /\b(example|for instance|e\.g\.|such as)\b/i.test(prompt_a);
    const hasExamplesB = /\b(example|for instance|e\.g\.|such as)\b/i.test(prompt_b);
    if (hasExamplesA !== hasExamplesB) {
      structuralDiffs.push(`Prompt ${hasExamplesA ? "A" : "B"} includes examples while the other does not`);
    }

    const hasFormatA = /\b(format|json|markdown|xml|yaml|table|list|code block)\b/i.test(prompt_a);
    const hasFormatB = /\b(format|json|markdown|xml|yaml|table|list|code block)\b/i.test(prompt_b);
    if (hasFormatA !== hasFormatB) {
      structuralDiffs.push(`Prompt ${hasFormatA ? "A" : "B"} specifies output format while the other does not`);
    }

    // Generate recommendation
    let recommendation;
    if (winner === "tie") {
      recommendation = `Both prompts are comparable (scores: A=${scoresA.overall}, B=${scoresB.overall}). Choose based on style preference${structuralDiffs.length > 0 ? ". " + structuralDiffs.join(". ") : ""}.`;
    } else {
      const stronger = winner === "a" ? "A" : "B";
      const weaker = winner === "a" ? "B" : "A";
      const strongerScores = winner === "a" ? scoresA : scoresB;
      const weakerScores = winner === "a" ? scoresB : scoresA;

      const weakCategories = categories.filter(c => weakerScores[c] < strongerScores[c] - 5);
      recommendation = `Prompt ${stronger} is recommended (score: ${strongerScores.overall} vs ${weakerScores.overall}).`;

      if (weakCategories.length > 0) {
        recommendation += ` Prompt ${weaker} is weaker in: ${weakCategories.join(", ")}.`;
      }

      // Suggest merging strong parts
      const mergeable = categories.filter(c => {
        const aScore = scoresA[c];
        const bScore = scoresB[c];
        return Math.abs(aScore - bScore) > 15;
      });

      if (mergeable.length > 0) {
        recommendation += ` Consider merging strong aspects from both: ${mergeable.map(c => {
          const strongerInCat = scoresA[c] > scoresB[c] ? "A" : "B";
          return `${c} from Prompt ${strongerInCat}`;
        }).join(", ")}.`;
      }
    }

    const result = {
      winner,
      reason: reasons.length > 0 ? reasons.join("; ") : `Scores are within tolerance (${scoresA.overall} vs ${scoresB.overall})`,
      metrics: {
        a: {
          ...scoresA,
          word_count: prompt_a.split(/\s+/).length,
          char_count: prompt_a.length,
          has_examples: /\b(example|for instance|e\.g\.|such as)\b/i.test(prompt_a),
          has_format: /\b(format|json|markdown|xml|yaml|table|list|code block)\b/i.test(prompt_a),
          task_hints: detectTaskHints(prompt_a),
        },
        b: {
          ...scoresB,
          word_count: prompt_b.split(/\s+/).length,
          char_count: prompt_b.length,
          has_examples: /\b(example|for instance|e\.g\.|such as)\b/i.test(prompt_b),
          has_format: /\b(format|json|markdown|xml|yaml|table|list|code block)\b/i.test(prompt_b),
          task_hints: detectTaskHints(prompt_b),
        },
      },
      recommendation,
      task: task || "unspecified",
      structural_differences: structuralDiffs,
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — compare_prompts failed: ${e.message}` }] };
  }
}

/**
 * optimize_prompt — Suggest improvements for a prompt.
 */
function handleOptimizePrompt({ prompt, target_score, focus }) {
  try {
    const target = target_score || 80;
    const focusArea = focus || "all";

    // Score original prompt
    const originalScores = scorePrompt(prompt);
    const originalScore = originalScores.overall;

    // Identify weaknesses
    const weaknesses = [];
    const improvements = [];

    const categories = focusArea === "all"
      ? ["clarity", "specificity", "completeness", "edge_cases"]
      : [focusArea];

    for (const category of categories) {
      if (originalScores[category] < target) {
        const checks = EVALUATION_CRITERIA[category].checks;
        for (const check of checks) {
          let met = false;
          if (check.custom) {
            met = check.custom(prompt);
          } else if (check.pattern) {
            const found = check.pattern.test(prompt);
            met = check.negative ? !found : found;
          }

          if (!met) {
            weaknesses.push({ category, check: check.name, desc: check.desc });
          }
        }
      }
    }

    // Generate improvements based on weaknesses
    const improvementTemplates = {
      clarity: {
        clear_instructions: (p) => `Add explicit action verb at the start. Example: "Create a function that..." instead of passive description.`,
        no_ambiguity: (p) => `Replace hedging language with definitive statements. Change "might" to "will", "possibly" to "must".`,
        structured: (p) => `Organize with headers, bullet points, or numbered steps:\n\n## Task\n[Description]\n\n## Requirements\n- [Requirement 1]\n- [Requirement 2]\n\n## Output\n[Expected format]`,
        concise: (p) => `Reduce prompt to essential instructions. Current length: ${p.split(/\s+/).length} words. Target: under 200 words for most tasks.`,
        no_jargon: (p) => `Replace formal terms with plain language. Use "use" instead of "utilize", "include" instead of "incorporate".`,
      },
      specificity: {
        concrete_examples: (p) => `Add input/output example:\n\nExample:\nInput: [sample input]\nExpected Output: [sample output]`,
        output_format: (p) => `Specify format explicitly: "Return as JSON with fields: {name, type, description}" or "Use markdown table format".`,
        constraints: (p) => `Add hard constraints: "Must complete in under 100ms", "Cannot modify existing tests", "Always use TypeScript".`,
        specific_domain: (p) => `Reference specific technologies: "Using React hooks", "For PostgreSQL database", "With Express.js middleware".`,
        measurable_criteria: (p) => `Add success metrics: "Score must be > 80%", "Response time < 200ms", "Coverage > 90%".`,
      },
      completeness: {
        input_specified: (p) => `Define input: "Given a user object with fields: id (number), name (string), email (string)".`,
        output_specified: (p) => `Define output: "Return a UserDTO with fields: {id, displayName, isVerified}".`,
        edge_cases: (p) => `Add edge case handling:\n- If input is null/undefined, return empty result\n- If validation fails, throw descriptive error\n- If network fails, retry once`,
        context_provided: (p) => `Add context: "This is for an e-commerce checkout flow where users..." or "Purpose: Improve search ranking by..."`,
        scope_defined: (p) => `Define scope: "Only modify src/utils/, do not touch tests or config files." or "Scope: authentication module only."`,
      },
      edge_cases: {
        error_handling: (p) => `Specify: "On error, return {error: string, code: number}". "Wrap in try/catch and log errors."`,
        empty_input: (p) => `Handle empty: "If array is empty, return []. If string is empty, return null."`,
        boundary_conditions: (p) => `Set boundaries: "Input length: 1-1000 chars". "Array size: 0-100 elements". "Concurrent requests: max 10".`,
        conflict_resolution: (p) => `Define priority: "If both rules apply, prefer the more specific one". "Use config value over default".`,
        performance_considerations: (p) => `Note constraints: "O(n) time complexity required". "Cache results for 5 minutes". "Batch API calls".`,
      },
    };

    // Build optimized prompt
    let optimized = prompt;
    const changes = [];

    // Add structured format if missing
    if (weaknesses.some(w => w.check === "structured")) {
      const sections = prompt.split(/\n\n+/);
      if (sections.length <= 2) {
        optimized = `## Task\n${prompt.trim()}\n\n## Requirements\n- Follow best practices\n- Handle edge cases\n\n## Output\nReturn results in the specified format.`;
        changes.push("Added structured format with Task/Requirements/Output sections");
      }
    }

    // Add example if missing
    if (weaknesses.some(w => w.check === "concrete_examples")) {
      if (!/example|input.*output|e\.g\./i.test(optimized)) {
        optimized += `\n\n## Example\nInput: [sample input]\nExpected: [sample output]`;
        changes.push("Added example input/output section");
      }
    }

    // Add constraints if missing
    if (weaknesses.some(w => w.check === "constraints")) {
      if (!/must|cannot|do not|never|always/i.test(optimized)) {
        optimized += `\n\n## Constraints\n- Follow existing code style\n- Do not break backward compatibility\n- Handle errors gracefully`;
        changes.push("Added explicit constraints section");
      }
    }

    // Add edge case handling if missing
    if (weaknesses.some(w => w.check === "edge_cases" || w.check === "error_handling" || w.check === "empty_input")) {
      if (!/if.*null|if.*empty|error.*handl/i.test(optimized)) {
        optimized += `\n\n## Edge Cases\n- Handle null/undefined inputs gracefully\n- Return descriptive error messages\n- Validate input before processing`;
        changes.push("Added edge case handling section");
      }
    }

    // Add output format if missing
    if (weaknesses.some(w => w.check === "output_format")) {
      if (!/format|json|markdown|return.*as/i.test(optimized)) {
        optimized += `\n\n## Output Format\nReturn as JSON with appropriate structure.`;
        changes.push("Added explicit output format specification");
      }
    }

    // Score optimized prompt
    const optimizedScores = scorePrompt(optimized);
    const optimizedScore = optimizedScores.overall;

    // Generate detailed suggestions for manual review
    const suggestions = [];
    for (const weakness of weaknesses) {
      const template = improvementTemplates[weakness.category]?.[weakness.check];
      if (template) {
        suggestions.push(`[${weakness.category}] ${weakness.desc}: ${template(prompt)}`);
      }
    }

    const result = {
      optimized,
      changes: changes.length > 0 ? changes : ["No structural changes needed"],
      score_before: originalScore,
      score_after: optimizedScore,
      improvement: optimizedScore - originalScore,
      weaknesses_found: weaknesses.length,
      suggestions,
      meta: {
        target_score: target,
        focus_area: focusArea,
        original_word_count: prompt.split(/\s+/).length,
        optimized_word_count: optimized.split(/\s+/).length,
      },
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — optimize_prompt failed: ${e.message}` }] };
  }
}

/**
 * validate_prompt_safety — Check prompt for safety issues.
 */
function handleValidatePromptSafety({ prompt }) {
  try {
    const issues = [];
    const recommendations = [];
    let maxSeverity = "safe";

    const severityOrder = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };

    // Check injection patterns
    for (const { pattern, desc } of SAFETY_PATTERNS.injection) {
      if (pattern.test(prompt)) {
        issues.push({ type: "injection", description: desc, pattern: pattern.source });
        recommendations.push(`Remove or rephrase: ${desc}`);
        if (severityOrder.high > severityOrder[maxSeverity]) maxSeverity = "high";
      }
    }

    // Check harmful content
    for (const { pattern, desc, severity } of SAFETY_PATTERNS.harmful) {
      if (pattern.test(prompt)) {
        const issueSeverity = severity || "high";
        issues.push({ type: "harmful", description: desc, severity: issueSeverity, pattern: pattern.source });
        recommendations.push(`Review and remove: ${desc}`);
        if (severityOrder[issueSeverity] > severityOrder[maxSeverity]) maxSeverity = issueSeverity;
      }
    }

    // Check bias
    for (const { pattern, desc } of SAFETY_PATTERNS.bias) {
      if (pattern.test(prompt)) {
        issues.push({ type: "bias", description: desc, pattern: pattern.source });
        recommendations.push(`Remove biased language: ${desc}`);
        if (severityOrder.medium > severityOrder[maxSeverity]) maxSeverity = "medium";
      }
    }

    // Additional heuristics
    const wordCount = prompt.split(/\s+/).length;
    if (wordCount > 500) {
      recommendations.push("Prompt is very long (>500 words). Consider breaking into smaller, focused prompts.");
    }

    if (prompt.length > 10000) {
      recommendations.push("Prompt exceeds 10,000 characters. This may cause context window issues with some models.");
    }

    // Check for prompt leaking attempts
    if (/\b(show|reveal|print|output)\s+(your|the)\s+(system|initial|original)\s+prompt\b/i.test(prompt)) {
      issues.push({ type: "extraction", description: "Attempt to extract system prompt", pattern: "prompt extraction" });
      recommendations.push("This appears to be an attempt to extract system instructions. Review intent.");
      if (severityOrder.high > severityOrder[maxSeverity]) maxSeverity = "high";
    }

    // Check for recursive prompt injection
    if (/\bwhen\s+you\s+see\s+.*ignore|if\s+prompt\s+contains.*disregard/i.test(prompt)) {
      issues.push({ type: "recursive_injection", description: "Recursive instruction injection pattern", pattern: "recursive injection" });
      recommendations.push("Recursive injection patterns detected. Review for safety.");
      if (severityOrder.critical > severityOrder[maxSeverity]) maxSeverity = "critical";
    }

    const result = {
      safe: issues.length === 0,
      issues: issues.map(i => `[${i.type}] ${i.description}`),
      severity: maxSeverity,
      recommendations,
      stats: {
        prompt_length: prompt.length,
        word_count: wordCount,
        issues_found: issues.length,
        checks_performed: Object.values(SAFETY_PATTERNS).flat().length,
      },
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — validate_prompt_safety failed: ${e.message}` }] };
  }
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register all prompt-testing tools on the MCP server.
 * @param {McpServer} server
 */
export function registerPromptTestingTools(server) {
  // 1. test_prompt_effectiveness
  server.tool(
    "test_prompt_effectiveness",
    "Test a prompt against evaluation criteria and return an effectiveness score (0-100). Analyzes clarity, specificity, completeness, and edge case handling. Returns criteria met/failed and improvement suggestions.",
    {
      prompt: z.string().min(1).describe("The prompt text to evaluate."),
      criteria: z.array(z.string()).optional().describe("Optional list of specific criteria to check (e.g. ['clarity.clear_instructions', 'specificity.output_format']). If omitted, evaluates all criteria."),
      model: z.string().optional().describe("Optional model name for context (e.g. 'claude', 'gpt-4o'). Used for metadata only."),
    },
    withRateLimit("test_prompt_effectiveness", handleTestPromptEffectiveness),
  );

  // 2. compare_prompts
  server.tool(
    "compare_prompts",
    "Compare two prompts designed for the same task. Analyzes structure, clarity, specificity, and expected coverage. Returns winner, detailed metrics for both, and recommendation for merging strong aspects.",
    {
      prompt_a: z.string().min(1).describe("First prompt to compare."),
      prompt_b: z.string().min(1).describe("Second prompt to compare."),
      task: z.string().optional().describe("Description of the task both prompts are designed for (for context)."),
    },
    withRateLimit("compare_prompts", handleComparePrompts),
  );

  // 3. optimize_prompt
  server.tool(
    "optimize_prompt",
    "Analyze a prompt for weaknesses and generate an optimized version with specific improvements. Identifies missing elements (examples, constraints, edge cases, format) and adds them. Returns before/after scores.",
    {
      prompt: z.string().min(1).describe("The prompt to optimize."),
      target_score: z.number().int().min(0).max(100).default(80).describe("Target effectiveness score (0-100). Default: 80."),
      focus: z.enum(["clarity", "specificity", "completeness", "all"]).default("all").describe("Area to focus optimization on. 'all' optimizes everything."),
    },
    withRateLimit("optimize_prompt", handleOptimizePrompt),
  );

  // 4. validate_prompt_safety
  server.tool(
    "validate_prompt_safety",
    "Check a prompt for safety issues including injection attempts, jailbreaks, harmful content, and bias. Returns safe/unsafe status, detected issues, severity level, and recommendations.",
    {
      prompt: z.string().min(1).describe("The prompt text to validate for safety."),
    },
    withRateLimit("validate_prompt_safety", handleValidatePromptSafety),
  );
}
