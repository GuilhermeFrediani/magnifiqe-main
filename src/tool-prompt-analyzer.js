/**
 * Stack Perfeita MCP — Tool Prompt Analyzer
 * Static analysis of MCP tool descriptions for redundancy and optimization.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { rateLimiter } from "./rate-limiter.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const SRC_DIR = join(import.meta.dirname, "..", "src");
const MIN_PHRASE_LENGTH = 3;
const OVERLAP_THRESHOLD = 2;

// ─── Schema Keywords (info that belongs in JSON schema, not description) ─────
const SCHEMA_KEYWORDS = [
  /(?:must|should|shall|optional|required)\s+(?:be\s+)?(?:a\s+)?(?:string|number|boolean|array|object)/i,
  /(?:defaults?\s+to|default:\s*)/i,
  /(?:enum|valid\s+values?|allowed\s+values?|one\s+of)/i,
  /z\.(?:string|number|boolean|array|enum|object)/i,
  /type:\s*(?:string|number|boolean)/i,
  /\{[^}]*\}/,
  /\[[^\]]*\]/,
  /(?:parameter|param|argument|input)\s+(?:is|must|should)/i,
];

// ─── Optimization Rules (Oh My Pi) ──────────────────────────────────────────
const OPTIMIZATION_RULES = {
  HAS_PURPOSE: {
    test: (desc) => /^[^\n]{10,80}[.!?]/.test(desc.trim()),
    message: "Missing clear one-line purpose statement",
  },
  HAS_EXAMPLES: {
    test: (desc) => /(?:e\.g\.|example|like|such as|for instance|pattern|workflow)/i.test(desc),
    message: "No worked examples or usage patterns",
  },
  HAS_FAILURE_SHAPES: {
    test: (desc) => /(?:error|fail|invalid|reject|halt|denied|not found|missing|empty)/i.test(desc),
    message: "No failure shapes documented",
  },
  HAS_ANTI_PATTERNS: {
    test: (desc) => /(?:wrong|right|correct|incorrect|do not|never|avoid|instead)/i.test(desc),
    message: "No anti-patterns (WRONG/RIGHT pairs) documented",
  },
  HAS_CRITICAL_RECAP: {
    test: (desc) => /(?:critical|important|must|never|always|required)/i.test(desc),
    message: "No <critical> recap of load-bearing rules",
  },
  CONCISE_FIRST_LINE: {
    test: (desc) => {
      const firstLine = desc.split("\n")[0].trim();
      return firstLine.length <= 120;
    },
    message: "First line exceeds 120 characters",
  },
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Count words in a string
 */
function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Extract phrases (n-grams) from text
 */
function extractPhrases(text, n = 3) {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_PHRASE_LENGTH);

  const phrases = [];
  for (let i = 0; i <= words.length - n; i++) {
    const phrase = words.slice(i, i + n).join(" ");
    if (phrase.split(" ").every((w) => w.length >= MIN_PHRASE_LENGTH)) {
      phrases.push(phrase);
    }
  }
  return phrases;
}

/**
 * Extract tool registrations from source code via regex
 */
function extractToolRegistrations(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const tools = [];

    // Pattern: server.tool("name", "description", schema, handler)
    const toolRegex = /server\.tool\(\s*\n?\s*["']([^"']+)["']\s*,\s*\n?\s*["']([\s\S]*?)["']\s*,/g;

    let match;
    while ((match = toolRegex.exec(content)) !== null) {
      const name = match[1];
      const description = match[2];

      // Extract schema fields from the third argument
      const schemaStart = match.index + match[0].length;
      const schemaEnd = findMatchingBrace(content, schemaStart);
      const schemaStr = schemaEnd > schemaStart ? content.slice(schemaStart, schemaEnd) : "";

      // Extract parameter names from z.string() etc.
      const paramRegex = /(\w+):\s*z\./g;
      const params = [];
      let paramMatch;
      while ((paramMatch = paramRegex.exec(schemaStr)) !== null) {
        params.push(paramMatch[1]);
      }

      tools.push({
        name,
        description: description.trim(),
        file: filePath,
        params,
        line: content.slice(0, match.index).split("\n").length,
      });
    }

    return tools;
  } catch {
    return [];
  }
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(str, start) {
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (ch === stringChar && str[i - 1] !== "\\") {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return start;
}

/**
 * Find overlapping phrases between tool descriptions
 */
function findOverlappingPhrases(tools) {
  const phraseCounts = {};

  for (const tool of tools) {
    const phrases = extractPhrases(tool.description, 3);
    for (const phrase of phrases) {
      if (!phraseCounts[phrase]) {
        phraseCounts[phrase] = [];
      }
      phraseCounts[phrase].push(tool.name);
    }
  }

  const overlaps = [];
  for (const [phrase, occurrences] of Object.entries(phraseCounts)) {
    const uniqueTools = [...new Set(occurrences)];
    if (uniqueTools.length >= OVERLAP_THRESHOLD && occurrences.length >= OVERLAP_THRESHOLD) {
      overlaps.push({
        phrase,
        occurrences: occurrences.length,
        tools: uniqueTools,
      });
    }
  }

  return overlaps.sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Find schema-redundant content in descriptions
 */
function findSchemaRedundancies(tools) {
  const redundancies = [];

  for (const tool of tools) {
    for (const pattern of SCHEMA_KEYWORDS) {
      const matches = tool.description.match(pattern);
      if (matches) {
        // Check if the info is already in schema
        const matchedText = matches[0].toLowerCase();
        const hasSchemaParam = tool.params.some((p) => {
          const paramLower = p.toLowerCase();
          return (
            matchedText.includes(paramLower) ||
            matchedText.includes("string") && tool.params.some(pp => pp === "text" || pp === "content" || pp === "code") ||
            matchedText.includes("path") && tool.params.some(pp => pp.includes("path"))
          );
        });

        if (hasSchemaParam) {
          redundancies.push({
            tool: tool.name,
            description: `Schema info in description: "${matches[0]}"`,
            schema_fields: tool.params,
            suggestion: "Move type/constraint info to JSON schema, not description",
          });
        }
      }
    }
  }

  return redundancies;
}

/**
 * Score description quality
 */
function scoreDescription(desc) {
  const scores = {
    clarity: 0,
    conciseness: 0,
    completeness: 0,
  };

  // Clarity: has purpose, not too vague
  if (/^[^\n]{10,}[.!?]/.test(desc)) scores.clarity += 30;
  if (desc.includes("\n")) scores.clarity += 10; // has structure
  if (desc.length > 50) scores.clarity += 10;

  // Conciseness: not too long
  const wordCount = countWords(desc);
  if (wordCount <= 50) scores.conciseness += 30;
  else if (wordCount <= 100) scores.conciseness += 20;
  else scores.conciseness += 10;

  if (desc.length <= 300) scores.conciseness += 20;

  // Completeness: has examples, failure cases, critical rules
  if (/(?:e\.g\.|example|like|such as|for instance)/i.test(desc)) scores.completeness += 20;
  if (/(?:error|fail|invalid|reject|halt|denied)/i.test(desc)) scores.completeness += 15;
  if (/(?:critical|important|must|never|always)/i.test(desc)) scores.completeness += 15;

  return {
    clarity: Math.min(50, scores.clarity),
    conciseness: Math.min(50, scores.conciseness),
    completeness: Math.min(50, scores.completeness),
    total: Math.min(150, scores.clarity + scores.conciseness + scores.completeness),
  };
}

/**
 * Generate recommendations for a tool
 */
function generateRecommendations(tool) {
  const recs = [];
  const desc = tool.description;

  // Check optimization rules
  for (const [ruleName, rule] of Object.entries(OPTIMIZATION_RULES)) {
    if (!rule.test(desc)) {
      recs.push({
        tool: tool.name,
        issue: rule.message,
        rule: ruleName,
        suggestion: getSuggestion(ruleName, tool),
      });
    }
  }

  // Word count check
  const wordCount = countWords(desc);
  if (wordCount > 100) {
    recs.push({
      tool: tool.name,
      issue: `Description is ${wordCount} words (recommended: ≤100)`,
      rule: "WORD_COUNT",
      suggestion: "Condense to essential purpose, input grammar, and critical rules",
    });
  }

  // Empty description
  if (!desc || desc.length === 0) {
    recs.push({
      tool: tool.name,
      issue: "Empty or missing description",
      rule: "EMPTY_DESCRIPTION",
      suggestion: "Add one-line purpose, input grammar, and critical rules",
    });
  }

  return recs;
}

/**
 * Get suggestion based on rule
 */
function getSuggestion(ruleName, tool) {
  const suggestions = {
    HAS_PURPOSE: `Start with: "${tool.name} does X for Y purpose"`,
    HAS_EXAMPLES: `Add 1-2 usage patterns: "Use after X to achieve Y"`,
    HAS_FAILURE_SHAPES: `Document failure modes: "Fails when X is missing or Y is invalid"`,
    HAS_ANTI_PATTERNS: `Add WRONG/RIGHT pairs: "WRONG: calling X before Y; RIGHT: call Y first"`,
    HAS_CRITICAL_RECAP: `Add <critical> section with 3-6 load-bearing rules`,
    CONCISE_FIRST_LINE: `Keep first line ≤120 chars; move details to subsequent lines`,
  };
  return suggestions[ruleName] || "Review description against Oh My Pi optimization rules";
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

/**
 * Analyze tool descriptions from source files
 */
export function analyzeToolDescriptions(srcDir = SRC_DIR) {
  const allTools = [];

  // Recursively find all .js files
  function findJsFiles(dir) {
    const files = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...findJsFiles(fullPath));
        } else if (extname(entry) === ".js") {
          files.push(fullPath);
        }
      }
    } catch {
      // ignore
    }
    return files;
  }

  const jsFiles = findJsFiles(srcDir);
  for (const file of jsFiles) {
    allTools.push(...extractToolRegistrations(file));
  }

  // Analysis
  const totalWords = allTools.reduce((sum, t) => sum + countWords(t.description), 0);
  const avgWords = allTools.length > 0 ? Math.round(totalWords / allTools.length) : 0;

  const overlaps = findOverlappingPhrases(allTools);
  const schemaRedundancies = findSchemaRedundancies(allTools);

  // Generate recommendations
  const allRecommendations = [];
  for (const tool of allTools) {
    allRecommendations.push(...generateRecommendations(tool));
  }

  // Quality scores
  const qualityScores = allTools.map((t) => ({
    tool: t.name,
    file: t.file,
    line: t.line,
    words: countWords(t.description),
    scores: scoreDescription(t.description),
  }));

  return {
    tools_analyzed: allTools.length,
    total_words: totalWords,
    avg_words_per_tool: avgWords,
    tools: allTools.map((t) => ({
      name: t.name,
      file: t.file,
      line: t.line,
      words: countWords(t.description),
      params: t.params,
      first_line: t.description.split("\n")[0].slice(0, 100),
    })),
    redundancies: overlaps.map((o) => ({
      phrase: o.phrase,
      occurrences: o.occurrences,
      tools: o.tools,
    })),
    schema_redundancies: schemaRedundancies,
    quality_scores: qualityScores,
    recommendations: allRecommendations,
    optimization_rules_checked: Object.keys(OPTIMIZATION_RULES).length,
  };
}

// ─── MCP Tool Registration ───────────────────────────────────────────────────

export function registerToolPromptAnalyzer(server) {
  server.tool(
    "analyze_tool_prompts",
    "Analyzes MCP tool descriptions for redundancy and optimization opportunities. Scans source files, extracts tool descriptions, finds overlapping phrases, identifies schema-redundant content, and returns actionable recommendations based on Oh My Pi optimization rules.",
    {},
    async () => {
      const rateLimitHit = rateLimiter.check("analyze_tool_prompts");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const analysis = analyzeToolDescriptions();

        const summary = [
          `TOOL PROMPT ANALYSIS REPORT`,
          ``,
          `Tools analyzed: ${analysis.tools_analyzed}`,
          `Total words: ${analysis.total_words}`,
          `Avg words/tool: ${analysis.avg_words_per_tool}`,
          ``,
          `─── Redundancies (${analysis.redundancies.length}) ───`,
        ];

        if (analysis.redundancies.length > 0) {
          for (const r of analysis.redundancies.slice(0, 10)) {
            summary.push(`  • "${r.phrase}" (${r.occurrences}x across ${r.tools.length} tools)`);
          }
        } else {
          summary.push(`  None found`);
        }

        summary.push(``, `─── Schema Redundancies (${analysis.schema_redundancies.length}) ───`);
        if (analysis.schema_redundancies.length > 0) {
          for (const r of analysis.schema_redundancies.slice(0, 10)) {
            summary.push(`  • ${r.tool}: ${r.description}`);
          }
        } else {
          summary.push(`  None found`);
        }

        summary.push(``, `─── Recommendations (${analysis.recommendations.length}) ───`);
        const byRule = {};
        for (const r of analysis.recommendations) {
          if (!byRule[r.rule]) byRule[r.rule] = 0;
          byRule[r.rule]++;
        }
        for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
          summary.push(`  • ${rule}: ${count} tools`);
        }

        summary.push(
          ``,
          `─── Quality Scores (Top 10 by total) ───`
        );
        const sortedScores = [...analysis.quality_scores].sort(
          (a, b) => b.scores.total - a.scores.total
        );
        for (const s of sortedScores.slice(0, 10)) {
          summary.push(
            `  • ${s.tool}: clarity=${s.scores.clarity} conciseness=${s.scores.conciseness} completeness=${s.scores.completeness} total=${s.scores.total}`
          );
        }

        return {
          content: [{ type: "text", text: summary.join("\n") }],
          analysis,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
        };
      }
    }
  );
}
