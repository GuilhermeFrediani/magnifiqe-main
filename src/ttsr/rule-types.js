/**
 * Stack Perfeita MCP — TTSR Rule Types + Bucket Routing
 * Defines rule schema and routing logic (TTSR vs rulebook vs always-apply).
 * Port of OMP's rule.ts + rule-buckets.ts pattern.
 */

/**
 * @typedef {object} TtsrRule
 * @property {string} name - Unique rule name
 * @property {string} content - Rule body (instruction text)
 * @property {string} [condition] - Regex pattern to match against output
 * @property {string} [astCondition] - AST-grep pattern for structural matching
 * @property {string[]} [scope] - Scope entries like "tool:edit(*.ts)"
 * @property {"once"|"after-gap"} [repeatMode="once"] - Repeat policy
 * @property {number} [repeatGap=3] - Turns before re-trigger (for after-gap)
 * @property {boolean} [interrupting=true] - Whether rule can abort stream
 * @property {string} [path] - Source file path
 */

/** @enum {string} */
export const RuleBucket = {
  TTSR: "ttsr",
  RULEBOOK: "rulebook",
  ALWAYS: "always",
};

/**
 * Classify a rule into a bucket.
 * Rules with condition or astCondition → TTSR (lazy-loaded, triggered by output).
 * Rules without conditions → ALWAYS (loaded upfront).
 *
 * @param {TtsrRule} rule
 * @returns {string} RuleBucket value
 */
export function classifyRule(rule) {
  if (rule.condition || rule.astCondition) {
    return RuleBucket.TTSR;
  }
  return RuleBucket.ALWAYS;
}

/**
 * Bucket a list of rules into TTSR, rulebook, and always-apply.
 * Filters out disabled rules and builtin-defaults if configured.
 *
 * @param {TtsrRule[]} rules
 * @param {object} [opts]
 * @param {string[]} [opts.disabledRules=[]] - Rule names to skip
 * @param {boolean} [opts.builtinRules=true] - Include builtin rules
 * @returns {{ ttsrRules: TtsrRule[], alwaysRules: TtsrRule[] }}
 */
export function bucketRules(rules, opts = {}) {
  const { disabledRules = [], builtinRules = true } = opts;
  const ttsrRules = [];
  const alwaysRules = [];
  const seen = new Set();

  for (const rule of rules) {
    // Skip disabled
    if (disabledRules.includes(rule.name)) continue;
    // Skip builtin defaults if disabled
    if (!builtinRules && rule.path?.includes("builtin")) continue;
    // Deduplicate by name (first-wins)
    if (seen.has(rule.name)) continue;
    seen.add(rule.name);

    const bucket = classifyRule(rule);
    if (bucket === RuleBucket.TTSR) {
      ttsrRules.push(rule);
    } else {
      alwaysRules.push(rule);
    }
  }

  return { ttsrRules, alwaysRules };
}

/**
 * Parse a rule from markdown content with frontmatter.
 * @param {string} content - Markdown with optional YAML-like frontmatter
 * @param {string} [path] - Source file path
 * @returns {TtsrRule}
 */
export function parseRule(content, path = "") {
  const lines = content.split("\n");
  const rule = { name: "", content: "", path, repeatMode: "once", repeatGap: 3, interrupting: true };

  // Parse frontmatter
  if (lines[0]?.trim() === "---") {
    const endIdx = lines.indexOf("---", 1);
    if (endIdx > 0) {
      for (let i = 1; i < endIdx; i++) {
        const [key, ...valParts] = lines[i].split(":");
        const val = valParts.join(":").trim();
        if (key === "name") rule.name = val;
        else if (key === "condition") rule.condition = val;
        else if (key === "astCondition") rule.astCondition = val;
        else if (key === "scope") rule.scope = val.split(",").map(s => s.trim());
        else if (key === "repeatMode") rule.repeatMode = val;
        else if (key === "repeatGap") rule.repeatGap = parseInt(val, 10) || 3;
        else if (key === "interrupting") rule.interrupting = val !== "false";
      }
      rule.content = lines.slice(endIdx + 1).join("\n").trim();
      return rule;
    }
  }

  // No frontmatter — use filename as name
  rule.name = path.split("/").pop()?.replace(/\.md$/, "") || "unnamed";
  rule.content = content.trim();
  return rule;
}
