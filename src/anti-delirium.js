/**
 * Stack Perfeita MCP — Anti-Delirium System
 * Detects fabricated knowledge in AI output.
 *
 * Different from hallucination (wrong file paths / symbols):
 * Delirium = AI inventing plausible-sounding facts that are false.
 *
 * Tools:
 *   verify_claims        — Check claims against project ground truth
 *   extract_claims       — Parse AI output into typed factual claims
 *   confidence_check     — Score AI output confidence 0-100
 *   fact_check_pipeline  — Orchestrates extract → verify → score
 */

import { z } from "zod";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, extname } from "path";
import { rateLimiter } from "./rate-limiter.js";
import { readFile, safeResolvePath } from "./helpers.js";
import { PROJECT_ROOT, RULE_DESCRIPTIONS } from "./config.js";

// ── Constants ───────────────────────────────────────────────────────────────

const VERDICT = { PASS: "PASS", WARN: "WARN", HALT: "HALT" };

/** Hedging language — presence lowers confidence */
const HEDGE_WORDS = [
  "maybe", "perhaps", "possibly", "might", "could",
  "probably", "likely", "seems", "appears", "generally",
  "typically", "usually", "roughly", "approximately",
  "i think", "i believe", "in my opinion", "arguably",
  "it seems", "one could say", "some people think",
  "tend to", "tends to", "often", "mostly",
];

/** Certainty markers — presence raises confidence (or risk if wrong) */
const CERTAINTY_WORDS = [
  "definitely", "certainly", "always", "never", "must",
  "is exactly", "precisely", "guaranteed", "without doubt",
  "100%", "every single", "all of them", "none of them",
  "it is a fact", "it is known", "proven that", "established that",
];

/** Words that suggest the AI is making a factual assertion */
const ASSERTION_SIGNALS = [
  /\b(?:is|are|was|were)\s+a\b/,
  /\b(?:is|are|was|were)\s+an?\b/,
  /\b(?:has|have|had)\s+\d/,
  /\b(?:uses?|uses?d|supports?|implements?|provides?)\b/,
  /\b(?:returns?|produces?|yields?)\b/,
  /\b(?:faster|slower|better|worse|more|less)\s+than\b/,
  /\bapproximately\s+\d/,
  /\babout\s+\d/,
  /\bover\s+\d+/,
  /\bunder\s+\d+/,
  /\b\dx\b/,
];

/** Opinion signals — factual-sounding but actually subjective */
const OPINION_SIGNALS = [
  /\b(?:best|worst|ideal|perfect|optimal|superior|inferior)\b/i,
  /\b(?:should|ought to|need to|must)\b/i,
  /\b(?:recommend|suggested|advised)\b/i,
  /\b(?:good|bad|great|terrible|awesome|horrible)\b/i,
  /\b(?:easy|hard|simple|complex|tricky)\b/i,
  /\b(?:fast|slow|efficient|inefficient)\b/i,
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load project ground truth for claim verification.
 * Returns a snapshot of known facts from package.json, config, and file tree.
 */
function loadProjectContext(projectRoot) {
  const ctx = {
    root: projectRoot,
    files: [],
    packageJson: null,
    configExports: [],
    ruleDescriptions: {},
    srcFiles: [],
  };

  // Gather file tree (src/ only for efficiency)
  const srcDir = resolve(projectRoot, "src");
  if (existsSync(srcDir)) {
    try {
      ctx.srcFiles = readdirSync(srcDir)
        .filter((f) => /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f))
        .map((f) => f);
    } catch { /* dir may be unreadable */ }
  }

  // Top-level file list
  try {
    ctx.files = readdirSync(projectRoot)
      .filter((f) => !f.startsWith("."))
      .map((f) => f);
  } catch { /* fallback */ }

  // package.json
  const pkgPath = resolve(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      ctx.packageJson = JSON.parse(raw);
    } catch { /* malformed */ }
  }

  // Rule descriptions (maps topic -> description)
  if (RULE_DESCRIPTIONS && typeof RULE_DESCRIPTIONS === "object") {
    ctx.ruleDescriptions = RULE_DESCRIPTIONS;
  }

  // Config exports (known exported constants from config.js)
  const configPath = resolve(projectRoot, "src", "config.js");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const exportMatches = content.matchAll(
        /export\s+(?:const|let|var|function|class)\s+(\w+)/g
      );
      for (const m of exportMatches) {
        ctx.configExports.push(m[1]);
      }
    } catch { /* skip */ }
  }

  return ctx;
}

/**
 * Extract numeric statistics from text.
 * Matches patterns like "3.5x faster", "99%", "over 500 tools", "10,000 lines".
 */
function extractNumbers(text) {
  const nums = [];
  const patterns = [
    /(\d[\d,]*\.?\d*)\s*x\b/gi,           // 3.5x, 2x
    /(\d[\d,]*\.?\d*)\s*%/g,              // 99%, 50.5%
    /(\d[\d,]*\.?\d*)\s*(?:ms|sec|min|hour|day|s|m|h)\b/gi, // time
    /(?:approximately|about|over|under|roughly)\s+(\d[\d,]*\.?\d*)/gi,
    /(\d[\d,]*\.?\d*)\s*(?:tools?|files?|lines?|functions?|modules?|packages?)/gi,
  ];
  for (const p of patterns) {
    let match;
    while ((match = p.exec(text)) !== null) {
      nums.push(match[0].trim());
    }
  }
  return nums;
}

/**
 * Classify a single claim sentence into a type.
 */
function classifyClaim(claim) {
  const lower = claim.toLowerCase();

  // File reference: mentions a path or file extension
  if (/[\\/]/.test(claim) || /\.\w{2,4}\b/.test(claim)) {
    return { type: "file", verifiable: true };
  }

  // API reference: mentions an API, endpoint, method, or library
  if (/\b(?:API|REST|GraphQL|gRPC|WebSocket|HTTP|GET|POST|PUT|DELETE|PATCH)\b/i.test(claim) ||
      /\b(?:npm|pip|cargo|gem|module|package)\s+install\b/i.test(claim) ||
      /\bfetch\(|\baxios\b|\brequest\(.*\)/i.test(claim)) {
    return { type: "api", verifiable: true };
  }

  // Statistic: contains numbers that look like measurements
  const numbers = extractNumbers(claim);
  if (numbers.length > 0) {
    return { type: "statistic", verifiable: false };
  }

  // Opinion: uses subjective language
  if (OPINION_SIGNALS.some((p) => p.test(lower))) {
    return { type: "opinion", verifiable: false };
  }

  // Default: factual assertion (may or may not be verifiable)
  return { type: "fact", verifiable: false };
}

/**
 * Check if a claim contradicts known project facts.
 * Returns { verdict, reason }.
 */
function verifySingleClaim(claim, projectCtx) {
  const lower = claim.toLowerCase();

  // ── Package.json checks ──────────────────────────────────────────────
  if (projectCtx.packageJson) {
    const pkg = projectCtx.packageJson;

    // Claim: "project is called X" or "project is named X"
    const nameMatch = lower.match(/(?:project|package|server)\s+(?:is\s+(?:called|named)|named?)\s+["'`]?([a-z0-9._@/-]+)["'`]?\s*(?:v[\d.]+)?\s*[.\n]?\s*$/);
    if (nameMatch) {
      const claimedName = nameMatch[1].trim().replace(/["'`]/g, "");
      if (pkg.name && claimedName !== pkg.name) {
        return { verdict: VERDICT.HALT, reason: `Package name mismatch: claimed "${claimedName}" but project is "${pkg.name}"` };
      }
      if (pkg.name) {
        return { verdict: VERDICT.PASS, reason: `Package name matches: "${pkg.name}"` };
      }
    }

    // Claim: "version is X" or version embedded in package name claim (e.g. "v4.8.0")
    const verMatch = lower.match(/(?:version\s+(?:is|:)\s*)?v?([\d]+\.[\d]+(?:\.[\d]+)?)\b/);
    if (verMatch) {
      const claimedVer = verMatch[1];
      if (pkg.version && claimedVer !== pkg.version) {
        return { verdict: VERDICT.HALT, reason: `Version mismatch: claimed "${claimedVer}" but project is v${pkg.version}` };
      }
      if (pkg.version) {
        return { verdict: VERDICT.PASS, reason: `Version matches: v${pkg.version}` };
      }
    }

    // Claim about number of tools
    const toolCountMatch = lower.match(/(\d+)\s*(?:\+?\s*)?(?:tools?|functions?|commands?)/);
    if (toolCountMatch && /tools?\b/.test(lower)) {
      const claimedCount = parseInt(toolCountMatch[1], 10);
      const desc = pkg.description || "";
      const descCountMatch = desc.match(/(\d+)\+?\s*tools/);
      if (descCountMatch) {
        const actualCount = parseInt(descCountMatch[1], 10);
        if (claimedCount > actualCount + 10) {
          return { verdict: VERDICT.WARN, reason: `Claimed ${claimedCount} tools but description mentions ~${actualCount}` };
        }
      }
    }

    // Claim about dependencies
    if (/\b(?:uses?|depends?|requires?|needs?)\b/.test(lower)) {
      const depMatch = claim.match(/(?:uses?|depends?|requires?|needs?)\s+(?:the\s+)?(?:npm\s+package\s+)?[`"']?([a-z@][a-z0-9._/-]*)[`"']?/i);
      if (depMatch) {
        const dep = depMatch[1].replace(/["'`]/g, "");
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        const baseDep = dep.startsWith("@") ? dep.split("/").slice(0, 2).join("/") : dep.split("/")[0];
        if (allDeps && !allDeps[baseDep] && !allDeps[dep]) {
          return { verdict: VERDICT.WARN, reason: `Claimed dependency "${dep}" not found in package.json` };
        }
        if (allDeps && (allDeps[baseDep] || allDeps[dep])) {
          return { verdict: VERDICT.PASS, reason: `Dependency "${dep}" confirmed in package.json` };
        }
      }
    }
  }

  // ── File existence checks ────────────────────────────────────────────
  const fileRefMatch = claim.match(/[`"']?(?:src\/)?([a-zA-Z0-9_./-]+\.(?:js|ts|jsx|tsx|json|md|css|html))['" ]?/i);
  if (fileRefMatch) {
    const filePath = fileRefMatch[1];
    const absPath = resolve(projectCtx.root, filePath);
    if (existsSync(absPath)) {
      return { verdict: VERDICT.PASS, reason: `File exists: ${filePath}` };
    }
    // Also check in src/
    const srcPath = resolve(projectCtx.root, "src", filePath);
    if (existsSync(srcPath)) {
      return { verdict: VERDICT.PASS, reason: `File exists: src/${filePath}` };
    }
    return { verdict: VERDICT.WARN, reason: `Referenced file not found: ${filePath}` };
  }

  // ── Export/function claims ────────────────────────────────────────────
  const exportMatch = claim.match(/(?:export(?:ed)?|defines?|has)\s+(?:a\s+)?(?:function|const|class|export)\s+(\w+)/i);
  if (exportMatch) {
    const name = exportMatch[1];
    const found = projectCtx.srcFiles.some((f) => {
      const content = readFile(resolve(projectCtx.root, "src", f));
      if (!content) return false;
      return new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(content);
    });
    if (found) {
      return { verdict: VERDICT.PASS, reason: `Export '${name}' found in src/` };
    }
    return { verdict: VERDICT.WARN, reason: `Export '${name}' not found in any src/ file` };
  }

  // ── Engine/runtime claims ────────────────────────────────────────────
  const engineMatch = lower.match(/(?:uses?|runs?\s+on|built\s+with|powered\s+by)\s+(node\.?js|express|fastify|koa|react|vue|angular|svelte|next\.?js|typescript)/i);
  if (engineMatch) {
    const claimedEngine = engineMatch[1].toLowerCase().replace(/\.?js$/, "");
    if (projectCtx.packageJson) {
      const allDeps = {
        ...projectCtx.packageJson.dependencies,
        ...projectCtx.packageJson.devDependencies,
      };
      const depKeys = Object.keys(allDeps || {}).map((k) => k.toLowerCase());
      // Check if claimed engine is actually a dependency
      const engineMap = {
        "express": "express",
        "fastify": "fastify",
        "koa": "koa",
        "react": "react",
        "vue": "vue",
        "angular": "@angular/core",
        "svelte": "svelte",
        "next": "next",
      };
      const depKey = engineMap[claimedEngine];
      if (depKey && depKeys.includes(depKey)) {
        return { verdict: VERDICT.PASS, reason: `"${claimedEngine}" confirmed as dependency` };
      }
      // Node.js is always present for a Node project, so skip that check
      if (claimedEngine === "node") {
        return { verdict: VERDICT.PASS, reason: "Node.js is the runtime (always true for this project)" };
      }
    }
  }

  // ── API count claims ─────────────────────────────────────────────────
  const apiCountMatch = lower.match(/(\d+)\+?\s*(?:api|endpoint|route|tool)/);
  if (apiCountMatch) {
    return { verdict: VERDICT.WARN, reason: `Cannot verify count claim (${apiCountMatch[0]}) — unverifiable without code scan` };
  }

  // ── Claim mentions a specific config export ──────────────────────────
  const configExportMatch = claim.match(/\b(PROJECT_ROOT|RULES_DIR|SRC_DIR|SKILLS_DIR|COMMANDS_DIR|BUNDLED_RULES_DIR|PROJECT_RULES_DIR|MEMORY_FILE|SESSION_STATE_FILE|PROJECT_STATE_FILE|TODO_STATE_FILE|STATE_LIMITS|TOPIC_MAP|RULE_DESCRIPTIONS|BAD_PATTERNS|RESPONSE_STYLE_PATTERNS)\b/);
  if (configExportMatch) {
    const name = configExportMatch[1];
    if (projectCtx.configExports.includes(name)) {
      return { verdict: VERDICT.PASS, reason: `Config export '${name}' confirmed` };
    }
    return { verdict: VERDICT.WARN, reason: `Config export '${name}' not found in config.js` };
  }

  // ── Unverifiable — cannot check against known facts ──────────────────
  return { verdict: VERDICT.WARN, reason: "Claim cannot be verified against known project facts" };
}

// ── Tool: extract_claims ────────────────────────────────────────────────────

function extractClaimsFromText(text) {
  const claims = [];
  if (!text || typeof text !== "string") return claims;

  // Split on sentence boundaries
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5 && s.length < 500);

  for (const sentence of sentences) {
    // Skip very short fragments, code blocks, markdown headings, lists
    if (/^[#*>`\-\d.]+\s/.test(sentence)) continue;
    if (/^```/.test(sentence)) continue;
    if (sentence.split(/\s+/).length < 3) continue;

    // Must contain at least one signal to be extracted as a claim
    const hasAssertion = ASSERTION_SIGNALS.some((p) => p.test(sentence));
    const hasNumber = /\d/.test(sentence);
    const hasFilePath = /[\\/]/.test(sentence) || /\.\w{2,4}\b/.test(sentence);
    const hasApiRef = /\b(?:API|REST|GET|POST|PUT|DELETE|endpoint|route)\b/i.test(sentence);
    const hasOpinion = OPINION_SIGNALS.some((p) => p.test(sentence));

    if (hasAssertion || hasNumber || hasFilePath || hasApiRef || hasOpinion) {
      const { type, verifiable } = classifyClaim(sentence);
      claims.push({
        claim: sentence,
        type,
        verifiable,
      });
    }
  }

  return claims;
}

// ── Tool: confidence_check scoring ──────────────────────────────────────────

function computeConfidence(text) {
  if (!text || typeof text !== "string") {
    return { score: 0, verdict: "LOW", warnings: ["Empty input"] };
  }

  const lower = text.toLowerCase();
  const warnings = [];
  let score = 70; // Start at baseline

  // 1. Hedge words reduce confidence
  const hedgeCount = HEDGE_WORDS.filter((w) => lower.includes(w)).length;
  score -= hedgeCount * 4;

  // 2. Certainty markers without grounding raise risk
  const certaintyCount = CERTAINTY_WORDS.filter((w) => lower.includes(w)).length;
  if (certaintyCount > 3) {
    score -= certaintyCount * 3;
    warnings.push(`High certainty language (${certaintyCount} markers) — elevated delirium risk`);
  } else {
    score += certaintyCount * 1; // Mild positive for measured certainty
  }

  // 3. Claim density: too many claims per paragraph is suspicious
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 10);
  const claims = extractClaimsFromText(text);
  const claimDensity = sentences.length > 0 ? claims.length / sentences.length : 0;
  if (claimDensity > 0.8) {
    score -= 15;
    warnings.push(`Very high claim density (${Math.round(claimDensity * 100)}% of sentences contain claims)`);
  } else if (claimDensity > 0.6) {
    score -= 8;
    warnings.push(`Elevated claim density (${Math.round(claimDensity * 100)}% of sentences contain claims)`);
  }

  // 4. Statistics without sources
  const stats = extractNumbers(text);
  if (stats.length > 5) {
    score -= 10;
    warnings.push(`${stats.length} statistics/numbers found — verify sources for accuracy`);
  } else if (stats.length > 2) {
    score -= 4;
  }

  // 5. Unverifiable claims ratio
  const unverifiable = claims.filter((c) => !c.verifiable).length;
  const verifiable = claims.filter((c) => c.verifiable).length;
  if (claims.length > 0 && unverifiable / claims.length > 0.7) {
    score -= 12;
    warnings.push(`${unverifiable}/${claims.length} claims are unverifiable — higher fabrication risk`);
  }

  // 6. File references without existence checks
  const fileRefs = text.match(/`[^`]*\.\w{2,4}`/g) || [];
  const pathRefs = text.match(/(?:src|lib|dist|test|tests)\/[\w./-]+/g) || [];
  if (fileRefs.length > 3 || pathRefs.length > 3) {
    score -= 5;
    warnings.push(`${fileRefs.length + pathRefs.length} file/path references detected — run verify_claims to check`);
  }

  // 7. Code blocks without explanation are risky
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []).length;
  if (codeBlocks > 3) {
    score -= 5;
    warnings.push(`${codeBlocks} code blocks — verify code accuracy independently`);
  }

  // 8. Length heuristics
  if (text.length > 5000) {
    score -= 5;
    warnings.push("Very long output — longer text has more surface for fabrication");
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // Verdict
  let verdict;
  if (score >= 70) verdict = "HIGH";
  else if (score >= 45) verdict = "MEDIUM";
  else verdict = "LOW";

  return { score, verdict, warnings };
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerAntiDeliriumTools(server) {
  // ── verify_claims ────────────────────────────────────────────────────
  server.tool(
    "verify_claims",
    "Verifies factual claims against known project context (package.json, file tree, config, rule system). Returns PASS/WARN/HALT for each claim. Use this when you suspect AI-generated text may contain fabricated facts.",
    {
      claims: z.array(z.string()).min(1).describe("Factual claims to verify against project ground truth."),
      context: z.string().optional().describe("Project area for context (e.g. 'auth', 'compression', 'rules'). Improves verification accuracy."),
    },
    async ({ claims, context }) => {
      const rateLimitHit = rateLimiter.check("verify_claims");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const projectCtx = loadProjectContext(PROJECT_ROOT);
        const results = [];

        for (const claim of claims) {
          const trimmed = claim.trim();
          if (!trimmed) continue;

          const { verdict, reason } = verifySingleClaim(trimmed, projectCtx);
          results.push({ claim: trimmed, verdict, reason });
        }

        const passCount = results.filter((r) => r.verdict === VERDICT.PASS).length;
        const warnCount = results.filter((r) => r.verdict === VERDICT.WARN).length;
        const haltCount = results.filter((r) => r.verdict === VERDICT.HALT).length;

        const overallVerdict = haltCount > 0 ? VERDICT.HALT : warnCount > 0 ? VERDICT.WARN : VERDICT.PASS;

        const lines = [
          `ANTI-DELIRIUM VERIFY: ${overallVerdict}`,
          `- Claims checked: ${results.length}`,
          `- PASS: ${passCount} | WARN: ${warnCount} | HALT: ${haltCount}`,
          "",
          ...results.map((r) => `${r.verdict} — ${r.claim}`),
          ...results.map((r) => `  ↳ ${r.reason}`),
        ];

        if (context) {
          lines.splice(1, 0, `- Context: ${context}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error verifying claims: ${e.message}` }] };
      }
    }
  );

  // ── extract_claims ───────────────────────────────────────────────────
  server.tool(
    "extract_claims",
    "Extracts factual claims from AI output text. Parses sentences for assertions, statistics, file references, API references. Returns typed list with verifiability flags.",
    {
      text: z.string().min(1).describe("AI output text to extract claims from."),
    },
    async ({ text }) => {
      const rateLimitHit = rateLimiter.check("extract_claims");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const claims = extractClaimsFromText(text);

        if (claims.length === 0) {
          return {
            content: [{ type: "text", text: "EXTRACTION: No factual claims detected in the input text.\nThis may indicate opinion-heavy or conversational output." }],
          };
        }

        const verifiableCount = claims.filter((c) => c.verifiable).length;
        const byType = {};
        for (const c of claims) {
          byType[c.type] = (byType[c.type] || 0) + 1;
        }

        const typeBreakdown = Object.entries(byType)
          .map(([type, count]) => `${type}: ${count}`)
          .join(" | ");

        const lines = [
          `EXTRACTED CLAIMS: ${claims.length} total (${verifiableCount} verifiable)`,
          `Type breakdown: ${typeBreakdown}`,
          "",
          ...claims.map((c, i) => `${i + 1}. [${c.type}${c.verifiable ? " ✓" : " ?"}] ${c.claim}`),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error extracting claims: ${e.message}` }] };
      }
    }
  );

  // ── confidence_check ─────────────────────────────────────────────────
  server.tool(
    "confidence_check",
    "Scores AI output confidence 0-100 based on claim density, verifiability, hedge words, and certainty markers. Returns confidence score, verdict (HIGH/MEDIUM/LOW), and specific warnings.",
    {
      text: z.string().min(1).describe("AI output text to score for confidence/delirium risk."),
    },
    async ({ text }) => {
      const rateLimitHit = rateLimiter.check("confidence_check");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const { score, verdict, warnings } = computeConfidence(text);

        const lines = [
          `CONFIDENCE SCORE: ${score}/100`,
          `Verdict: ${verdict}`,
          "",
        ];

        if (warnings.length > 0) {
          lines.push(`Warnings (${warnings.length}):`);
          for (const w of warnings) {
            lines.push(`  ⚠ ${w}`);
          }
        } else {
          lines.push("No warnings — output appears grounded.");
        }

        lines.push("");
        if (score >= 70) {
          lines.push("Interpretation: HIGH confidence. Claims appear consistent and grounded. Minor fabrication risk.");
        } else if (score >= 45) {
          lines.push("Interpretation: MEDIUM confidence. Some claims may be ungrounded. Run verify_claims on suspicious assertions.");
        } else {
          lines.push("Interpretation: LOW confidence. High delirium risk. Verify all claims independently before trusting this output.");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error checking confidence: ${e.message}` }] };
      }
    }
  );

  // ── fact_check_pipeline ──────────────────────────────────────────────
  server.tool(
    "fact_check_pipeline",
    "Full anti-delirium pipeline: extracts claims from AI output, verifies each against project context, then scores overall confidence. One-call comprehensive fact-check.",
    {
      text: z.string().min(1).describe("AI output text to fact-check end-to-end."),
      strict: z.boolean().optional().default(false).describe("When true, WARN results are treated as HALT. Use for high-stakes output."),
    },
    async ({ text, strict }) => {
      const rateLimitHit = rateLimiter.check("fact_check_pipeline");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        // ── Step 1: Extract ──────────────────────────────────────────
        const claims = extractClaimsFromText(text);

        // ── Step 2: Verify ───────────────────────────────────────────
        const projectCtx = loadProjectContext(PROJECT_ROOT);
        const verifiedClaims = [];

        for (const c of claims) {
          const { verdict, reason } = verifySingleClaim(c.claim, projectCtx);
          const effectiveVerdict = strict && verdict === VERDICT.WARN ? VERDICT.HALT : verdict;
          verifiedClaims.push({ ...c, verdict: effectiveVerdict, reason });
        }

        // ── Step 3: Confidence ───────────────────────────────────────
        const { score, verdict: confVerdict, warnings } = computeConfidence(text);

        // ── Step 4: Consolidate ──────────────────────────────────────
        const passCount = verifiedClaims.filter((r) => r.verdict === VERDICT.PASS).length;
        const warnCount = verifiedClaims.filter((r) => r.verdict === VERDICT.WARN).length;
        const haltCount = verifiedClaims.filter((r) => r.verdict === VERDICT.HALT).length;
        const unverifiableCount = verifiedClaims.filter((r) => !r.verifiable).length;

        const overallVerdict = haltCount > 0 ? VERDICT.HALT : warnCount > 0 ? VERDICT.WARN : VERDICT.PASS;

        const lines = [
          "═══════════════════════════════════════════════",
          "  ANTI-DELIRIUM FACT-CHECK PIPELINE REPORT",
          "═══════════════════════════════════════════════",
          "",
          `OVERALL VERDICT: ${overallVerdict}`,
          `Confidence Score: ${score}/100 (${confVerdict})`,
          strict ? "Mode: STRICT (WARN escalated to HALT)" : "Mode: STANDARD",
          "",
          "── Claims ─────────────────────────────────────",
          `- Total extracted: ${claims.length}`,
          `- Verified PASS: ${passCount}`,
          `- WARN (unverifiable): ${warnCount}`,
          `- HALT (contradicted): ${haltCount}`,
          `- Type-classified: ${unverifiableCount} unverifiable`,
          "",
        ];

        if (verifiedClaims.length > 0) {
          lines.push("── Detailed Results ───────────────────────────");
          for (const c of verifiedClaims) {
            lines.push(`${c.verdict} [${c.type}] ${c.claim}`);
            lines.push(`    ↳ ${c.reason}`);
          }
          lines.push("");
        }

        if (warnings.length > 0) {
          lines.push("── Confidence Warnings ────────────────────────");
          for (const w of warnings) {
            lines.push(`  ⚠ ${w}`);
          }
          lines.push("");
        }

        lines.push("═══════════════════════════════════════════════");

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in fact-check pipeline: ${e.message}` }] };
      }
    }
  );
}
