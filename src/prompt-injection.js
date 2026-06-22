/**
 * Stack Perfeita MCP — Prompt Injection Detection
 * Multi-layered regex + heuristic scoring to detect prompt injection attacks.
 * 
 * Ported from Anthropic cybersecurity skills patterns:
 * - System prompt override patterns
 * - Role play escape attempts
 * - Delimiter injection attempts
 * - Instruction override patterns
 * - Prompt extraction attempts
 * - Encoding trick detection
 * - Context manipulation patterns
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Regex Patterns ─────────────────────────────────────────────────────────

/**
 * System prompt override patterns (weight: high)
 * Attempts to make the model ignore or replace its system instructions
 */
const SYSTEM_OVERRIDE_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?|guidelines?)/i,
  /ignore\s+all\s+(prompts?|instructions?|rules?|guidelines?)/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?(previous|prior|earlier|above|preceding)\s+(instructions?|prompts?|rules?|context)/i,
  /forget\s+(everything|all)\s+you\s+(know|were|have\s+been)/i,
  /forget\s+(everything|all)/i,
  /override\s+(your\s+)?(instructions?|rules?|prompts?|guidelines?)/i,
  /replace\s+(your\s+)?(instructions?|system\s+prompt|rules?)/i,
  /new\s+instructions?:/i,
  /your\s+new\s+instructions?/i,
  /ignore\s+all\s+prior/i,
  /disregard\s+all\s+instructions/i,
];

/**
 * Role play escape patterns (weight: high)
 * Attempts to make the model adopt a different persona or role
 */
const ROLE_PLAY_PATTERNS = [
  /you\s+are\s+now\s+(a|an|the)/i,
  /act\s+as\s+(a|an|the|if|though)/i,
  /pretend\s+(to\s+be|you\s+are|you're)\s+(a|an|the)/i,
  /your\s+new\s+role\s+(is|as)/i,
  /from\s+now\s+on\s+you\s+are/i,
  /roleplay\s+as/i,
  /simulate\s+(being|a|an)/i,
  /imagine\s+you\s+are/i,
  /you\s+are\s+now\s+in\s+(role|character|persona)/i,
  /act\s+like\s+you\s+have\s+no\s+(restrictions|rules|limits)/i,
  /behave\s+as\s+(a|an|the)\s+.*without/i,
];

/**
 * Delimiter injection patterns (weight: medium)
 * Attempts to break out of the current context using special delimiters
 */
const DELIMITER_PATTERNS = [
  /(^|\n)---+\s*\n/gm,
  /(^|\n)===+\s*\n/gm,
  /(^|\n)###+\s*\n/gm,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\/SYS>/i,
  /<s>/,
  /<\/s>/,
  /<endoftext>/i,
];

/**
 * Instruction override patterns (weight: high)
 * Attempts to inject new instructions or system commands
 */
const INSTRUCTION_OVERRIDE_PATTERNS = [
  /new\s+instructions?[:.]/i,
  /system\s*:\s+/i,
  /system\s+message[:.]/i,
  /admin\s+mode/i,
  /developer\s+mode/i,
  /debug\s+mode/i,
  /override\s+mode/i,
  /root\s+access/i,
  /sudo\s+mode/i,
  /enter\s+admin/i,
  /enable\s+(admin|developer|debug|override)\s+mode/i,
];

/**
 * Prompt extraction patterns (weight: very high)
 * Attempts to extract the system prompt or instructions
 */
const PROMPT_EXTRACTION_PATTERNS = [
  /repeat\s+(your\s+)?(instructions?|prompt|system\s+prompt|rules?)/i,
  /what\s+(are|is)\s+your\s+(instructions?|prompt|system\s+prompt|rules?|initial\s+instructions?)/i,
  /show\s+me\s+your\s+(prompt|instructions?|system\s+prompt|rules?)/i,
  /output\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /print\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /display\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /reveal\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /what\s+(is|was)\s+the\s+(original|initial|first)\s+(prompt|instructions?)/i,
  /tell\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
];

/**
 * Encoding trick patterns (weight: medium)
 * Attempts to bypass filters using encoding or obfuscation
 */
const ENCODING_TRICK_PATTERNS = [
  /base64\s+(encode|decode|encoded|decoded)\s+(this|the|your|my|all|every)/i,
  /rot13\s+(encode|decode|encoded|decoded)\s+(this|the|your|my|all|every)/i,
  /hex\s+(encode|decode|encoded|decoded)\s+(this|the|your|my|all|every)/i,
  /decode\s+(this|the\s+following)\s*(base64|rot13|hex)?/i,
  /encode\s+(this|the\s+following)\s*(base64|rot13|hex)?/i,
  /use\s+base64\s+to/i,
  /in\s+base64\s+to/i,
];

/**
 * Context manipulation patterns (weight: medium)
 * Attempts to change the conversation context
 */
const CONTEXT_MANIPULATION_PATTERNS = [
  /from\s+now\s+on/i,
  /starting\s+now/i,
  /new\s+context[:.]/i,
  /reset\s+(context|conversation|memory|instructions?)/i,
  /clear\s+(context|conversation|memory|instructions?)/i,
  /new\s+session/i,
  /fresh\s+start/i,
  /blank\s+slate/i,
  /ignore\s+previous\s+context/i,
  /disregard\s+context/i,
];

/**
 * Combined patterns for easy iteration
 */
const ALL_PATTERN_GROUPS = {
  system_override: SYSTEM_OVERRIDE_PATTERNS,
  role_play: ROLE_PLAY_PATTERNS,
  delimiter: DELIMITER_PATTERNS,
  instruction_override: INSTRUCTION_OVERRIDE_PATTERNS,
  prompt_extraction: PROMPT_EXTRACTION_PATTERNS,
  encoding_trick: ENCODING_TRICK_PATTERNS,
  context_manipulation: CONTEXT_MANIPULATION_PATTERNS,
};

// ─── Heuristic Analysis ─────────────────────────────────────────────────────

/**
 * Imperative verbs commonly used in prompt injection attempts
 */
const IMPERATIVE_VERBS = [
  "ignore", "forget", "disregard", "override", "replace",
  "bypass", "skip", "delete", "remove", "clear", "reset", "change",
  "modify", "update", "new", "act", "pretend", "simulate", "imagine",
  "roleplay", "repeat", "show", "output", "print", "display", "reveal",
  "tell", "explain", "describe", "decode", "encode", "execute", "run",
];

/**
 * Count imperative verbs in text (instruction density)
 * @param {string} text 
 * @returns {number}
 */
function calculateInstructionDensity(text) {
  const words = text.toLowerCase().split(/\s+/);
  let count = 0;
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, "");
    if (IMPERATIVE_VERBS.includes(cleanWord)) {
      count++;
    }
  }
  return count;
}

/**
 * Calculate special character ratio
 * @param {string} text 
 * @returns {number}
 */
function calculateSpecialCharRatio(text) {
  if (text.length === 0) return 0;
  const specialChars = text.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/g);
  return specialChars ? specialChars.length / text.length : 0;
}

/**
 * Detect suspicious tokens (LLM control tokens)
 * @param {string} text 
 * @returns {string[]}
 */
function findSuspiciousTokens(text) {
  const tokens = [];
  const tokenPatterns = [
    /\[INST\]/gi,
    /<<SYS>>/gi,
    /<\/SYS>/gi,
    /<s>/g,
    /<\/s>/g,
    /<endoftext>/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /<\|system\|>/gi,
    /<\|user\|>/gi,
    /<\|assistant\|>/gi,
  ];
  
  for (const pattern of tokenPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      tokens.push(...matches);
    }
  }
  
  return [...new Set(tokens)];
}

/**
 * Detect if input switches languages mid-sentence
 * Uses Unicode script detection as a heuristic
 * @param {string} text 
 * @returns {{ isMixed: boolean, detectedScripts: string[] }}
 */
function detectLanguageMixing(text) {
  const scripts = [];
  
  if (/[\u0041-\u005A\u0061-\u007A]/.test(text)) scripts.push("latin");
  if (/[\u0400-\u04FF]/.test(text)) scripts.push("cyrillic");
  if (/[\u4E00-\u9FFF]/.test(text)) scripts.push("chinese");
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) scripts.push("japanese");
  if (/[\uAC00-\uD7AF]/.test(text)) scripts.push("korean");
  if (/[\u0600-\u06FF]/.test(text)) scripts.push("arabic");
  if (/[\u0900-\u097F]/.test(text)) scripts.push("devanagari");
  if (/[\u0E00-\u0E7F]/.test(text)) scripts.push("thai");
  if (/[\u0590-\u05FF]/.test(text)) scripts.push("hebrew");
  
  return {
    isMixed: scripts.length > 1,
    detectedScripts: scripts,
  };
}

// ─── Main Detection Function ────────────────────────────────────────────────

/**
 * Analyze text for prompt injection patterns
 * @param {string} text - Text to analyze
 * @returns {object} Detection results
 */
export function detectPromptInjection(text) {
  const results = {
    verdict: "PASS",
    score: 0,
    layers: {
      regex: { matches: [], count: 0 },
      heuristic: {
        instruction_density: 0,
        special_char_ratio: 0,
        suspicious_tokens: [],
        language_mixing: { isMixed: false, detectedScripts: [] },
      },
    },
    details: "",
  };
  
  // Handle edge cases
  if (!text || typeof text !== "string") {
    results.details = "Empty or invalid input";
    return results;
  }
  
  // ── Regex Layer ──────────────────────────────────────────────────────
  let totalMatches = 0;
  const allMatches = [];
  
  for (const [category, patterns] of Object.entries(ALL_PATTERN_GROUPS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Only count the full match (index 0), not capture groups
        totalMatches += 1;
        allMatches.push({
          category,
          pattern: pattern.source,
          match: (match[0] || "").trim(),
        });
      }
    }
  }
  
  results.layers.regex.matches = allMatches;
  results.layers.regex.count = totalMatches;
  
  // ── Heuristic Layer ──────────────────────────────────────────────────
  results.layers.heuristic.instruction_density = calculateInstructionDensity(text);
  results.layers.heuristic.special_char_ratio = calculateSpecialCharRatio(text);
  results.layers.heuristic.suspicious_tokens = findSuspiciousTokens(text);
  results.layers.heuristic.language_mixing = detectLanguageMixing(text);
  
  // ── Scoring ──────────────────────────────────────────────────────────
  let score = 0;
  
  // Regex matches: +50 per match, capped at 80
  // A single injection pattern match is a strong signal
  score += Math.min(totalMatches * 50, 80);
  
  // Instruction density: +3 per verb, capped at 15
  score += Math.min(results.layers.heuristic.instruction_density * 3, 15);
  
  // Special char ratio: +15 if > 10%
  if (results.layers.heuristic.special_char_ratio > 0.1) {
    score += 15;
  }
  
  // Suspicious tokens: +10 per unique token, capped at 30
  score += Math.min(results.layers.heuristic.suspicious_tokens.length * 10, 30);
  
  // Language mixing: +5 if mixed
  if (results.layers.heuristic.language_mixing.isMixed) {
    score += 5;
  }
  
  // Cap score at 100
  results.score = Math.min(score, 100);
  
  // ── Verdict ──────────────────────────────────────────────────────────
  if (results.score >= 50) {
    results.verdict = "HALT";
  } else if (results.score >= 20) {
    results.verdict = "WARN";
  } else {
    results.verdict = "PASS";
  }
  
  // ── Details ──────────────────────────────────────────────────────────
  const details = [];
  if (totalMatches > 0) {
    details.push(`${totalMatches} regex pattern(s) matched`);
  }
  if (results.layers.heuristic.instruction_density > 3) {
    details.push(`High instruction density (${results.layers.heuristic.instruction_density} imperative verbs)`);
  }
  if (results.layers.heuristic.special_char_ratio > 0.1) {
    details.push(`High special character ratio (${(results.layers.heuristic.special_char_ratio * 100).toFixed(1)}%)`);
  }
  if (results.layers.heuristic.suspicious_tokens.length > 0) {
    details.push(`Suspicious tokens found: ${results.layers.heuristic.suspicious_tokens.join(", ")}`);
  }
  if (results.layers.heuristic.language_mixing.isMixed) {
    details.push(`Mixed scripts detected: ${results.layers.heuristic.language_mixing.detectedScripts.join(", ")}`);
  }
  
  results.details = details.length > 0 ? details.join("; ") : "No injection patterns detected";
  
  return results;
}

// ─── MCP Tool Registration ──────────────────────────────────────────────────

/**
 * Register prompt injection detection tool on the MCP server
 */
export function registerPromptInjectionTools(server) {
  server.tool(
    "detect_prompt_injection",
    "Detects prompt injection attacks using multi-layered regex + heuristic scoring. Analyzes text for system override attempts, role play escapes, delimiter injections, prompt extraction, encoding tricks, and context manipulation.",
    {
      text: z.string().describe("Text to analyze for injection patterns"),
    },
    async ({ text }) => {
      const rateLimitHit = rateLimiter.check("detect_prompt_injection");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      
      try {
        const results = detectPromptInjection(text);
        
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error detecting prompt injection: ${e.message}` }],
        };
      }
    }
  );
}
