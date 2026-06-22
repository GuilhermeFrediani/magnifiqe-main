/**
 * @module prompt-conventions
 * 
 * RFC 2119 keyword conventions and structural tags for AI rules.
 * Provides shortcuts, tag definitions, placement rules, and density validation.
 */

// ─── RFC 2119 Keywords ───────────────────────────────────────────────────────

/** RFC 2119 keyword shortcuts mapping. */
export const RFC_SHORTCUTS = {
  NEVER: 'MUST NOT',
  AVOID: 'SHOULD NOT',
  MUST: 'MUST',
  REQUIRED: 'MUST',
  SHOULD: 'SHOULD',
  RECOMMENDED: 'SHOULD',
  MAY: 'MAY',
  OPTIONAL: 'MAY',
};

/** Semantic meaning of each RFC 2119 keyword. */
export const RFC_MEANINGS = {
  MUST: 'Absolute requirement or prohibition',
  NEVER: 'Absolute prohibition (alias of MUST NOT)',
  SHOULD: 'Strong preference; deviation allowed with known tradeoffs',
  AVOID: 'Strong discouragement (alias of SHOULD NOT)',
  MAY: 'Truly optional; no implication of preference',
};

// ─── Structural Tags ──────────────────────────────────────────────────────────

/** Valid structural tags with their purposes. */
export const STRUCTURAL_TAGS = {
  '<critical>': 'Absolute invariants and prohibitions that cannot be violated',
  '<workflow>': 'Step-by-step operational procedures and execution order',
  '<completeness>': 'Acceptance criteria and definition of done',
  '<yielding>': 'Output format and delivery requirements',
  '<anti-patterns>': 'Forbidden approaches and their consequences',
  '<decision>': 'Decision trees and conditional logic',
};

/** Ornamental tags that MUST NOT be used (violates density rules). */
export const ORNAMENTAL_TAGS = [
  '<north-star>',
  '<stance>',
  '<protocol>',
  '<directives>',
  '<strengths>',
  '<values>',
  '<mission>',
  '<vision>',
  '<philosophy>',
  '<principles>',
  '<guidelines>',
];

// ─── Tag Placement Rules ──────────────────────────────────────────────────────

/**
 * Check if <critical> tags appear at start AND end of prompt.
 * Structural integrity requires bookending with invariants.
 * 
 * @param {string} text - The prompt text to validate
 * @returns {{ balanced: boolean, hasStart: boolean, hasEnd: boolean }}
 */
export function checkCriticalPlacement(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length < 2) {
    return { balanced: false, hasStart: false, hasEnd: false };
  }
  
  // Check first non-empty line
  const firstLine = lines[0].toLowerCase();
  const hasStart = firstLine.startsWith('<critical>');
  
  // Check last non-empty line
  const lastLine = lines[lines.length - 1].toLowerCase();
  const hasEnd = lastLine.includes('</critical>');
  
  return {
    balanced: hasStart && hasEnd,
    hasStart,
    hasEnd,
  };
}

// ─── Density Rules ────────────────────────────────────────────────────────────

/** Maximum words per tactical bullet for readability. */
export const DENSITY_MAX_WORDS = 12;

/** Minimum meaningful content per bullet (avoids filler). */
export const DENSITY_MIN_CONTENT = 3;

/**
 * Validate density rules: 1 fact per sentence, no filler.
 * 
 * @param {string} text - The prompt text to validate
 * @returns {{ violations: Array<{ line: number, issue: string, words: number }> }}
 */
export function validateDensity(text) {
  const violations = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines, headers, and tag lines
    if (!line || line.startsWith('#') || line.startsWith('<')) continue;
    
    // Check for bullet points
    if (line.startsWith('-') || line.startsWith('*')) {
      const content = line.replace(/^[-*]\s*/, '');
      const words = content.split(/\s+/).filter(w => w.length > 0).length;
      
      if (words > DENSITY_MAX_WORDS) {
        violations.push({
          line: i + 1,
          issue: `Bullet exceeds ${DENSITY_MAX_WORDS} words`,
          words,
        });
      }
      
      if (words < DENSITY_MIN_CONTENT) {
        violations.push({
          line: i + 1,
          issue: `Bullet has fewer than ${DENSITY_MIN_CONTENT} meaningful words`,
          words,
        });
      }
      
      // Check for filler phrases in bullet points
      const fillerPatterns = [
        /\bjust\b/i,
        /\breally\b/i,
        /\bvery\b/i,
        /\bkind of\b/i,
        /\bsort of\b/i,
        /\bpretty much\b/i,
        /\bin order to\b/i,
        /\bdue to the fact that\b/i,
      ];
      
      for (const pattern of fillerPatterns) {
        if (pattern.test(line)) {
          violations.push({
            line: i + 1,
            issue: `Contains filler phrase matching ${pattern}`,
            words: line.split(/\s+/).length,
          });
        }
      }
    }
  }
  
  return { violations };
}

// ─── Validation Functions ─────────────────────────────────────────────────────

/**
 * Check if text uses RFC 2119 keywords instead of informal language.
 * 
 * @param {string} text - The prompt text to validate
 * @returns {{ compliant: boolean, issues: Array<{ line: number, original: string, suggestion: string }> }}
 */
export function validateRFC2119Compliance(text) {
  const issues = [];
  const lines = text.split('\n');
  
  const nonCompliantPatterns = [
    { regex: /\byou must\b/gi, suggestion: 'MUST', reason: "lowercase 'must'" },
    { regex: /\byou never\b/gi, suggestion: 'NEVER', reason: "lowercase 'never'" },
    { regex: /\bdo not\b/gi, suggestion: 'NEVER', reason: "'do not' → NEVER" },
    { regex: /\bdon'?t\b/gi, suggestion: 'NEVER', reason: "'don't' → NEVER" },
    { regex: /\btry not to\b/gi, suggestion: 'AVOID', reason: "'try not to' → AVOID" },
    { regex: /\bprefer\b/gi, suggestion: 'SHOULD', reason: "'prefer' → SHOULD" },
    { regex: /\bmake sure\b/gi, suggestion: 'MUST', reason: "'make sure' → MUST" },
    { regex: /\bensure\b/gi, suggestion: 'MUST', reason: "'ensure' → MUST" },
    { regex: /\balways\b/gi, suggestion: 'MUST', reason: "'always' → MUST" },
    { regex: /\bnever\b(?![\s]*[A-Z])/gi, suggestion: 'NEVER', reason: "lowercase 'never'" },
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip markdown headers and blockquotes
    if (line.trim().startsWith('#') || line.trim().startsWith('>')) continue;
    
    for (const pattern of nonCompliantPatterns) {
      const matches = line.match(pattern.regex);
      if (matches) {
        issues.push({
          line: i + 1,
          original: matches[0],
          suggestion: pattern.suggestion,
          reason: pattern.reason,
        });
      }
    }
  }
  
  return {
    compliant: issues.length === 0,
    issues,
  };
}

/**
 * Validate structural tag usage in text.
 * 
 * @param {string} text - The prompt text to validate
 * @returns {{ valid: boolean, issues: Array<{ tag: string, issue: string }> }}
 */
export function validateStructuralTags(text) {
  const issues = [];
  
  // Check for ornamental tags
  for (const tag of ORNAMENTAL_TAGS) {
    if (text.includes(tag)) {
      issues.push({
        tag,
        issue: 'Ornamental tag detected; remove it',
      });
    }
  }
  
  // Check for unmatched tags
  const tagPattern = /<(\/?)(\w+)>/g;
  let match;
  const tagCounts = {};
  
  while ((match = tagPattern.exec(text)) !== null) {
    const [fullTag, isClosing, tagName] = match;
    const tag = `<${tagName}>`;
    
    if (!STRUCTURAL_TAGS[tag] && !ORNAMENTAL_TAGS.includes(tag)) {
      // Not a recognized structural tag
      continue;
    }
    
    if (!tagCounts[tagName]) {
      tagCounts[tagName] = { open: 0, close: 0 };
    }
    
    if (isClosing) {
      tagCounts[tagName].close++;
    } else {
      tagCounts[tagName].open++;
    }
  }
  
  for (const [tagName, counts] of Object.entries(tagCounts)) {
    if (counts.open !== counts.close) {
      issues.push({
        tag: `<${tagName}>`,
        issue: `Unbalanced: ${counts.open} opens, ${counts.close} closes`,
      });
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

// ─── Full Analysis ────────────────────────────────────────────────────────────

/**
 * Full prompt conventions analysis — combines all checks.
 * 
 * @param {string} text - The prompt text to analyze
 * @returns {object}
 */
export function analyzePromptConventions(text) {
  const critical = checkCriticalPlacement(text);
  const density = validateDensity(text);
  const rfc = validateRFC2119Compliance(text);
  const tags = validateStructuralTags(text);
  
  return {
    critical,
    density,
    rfc,
    tags,
    passed: critical.balanced && density.violations.length === 0 && rfc.compliant && tags.valid,
  };
}
