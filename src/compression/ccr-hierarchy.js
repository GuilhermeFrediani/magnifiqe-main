/**
 * Stack Perfeita MCP — CCR Hierarchy (Compression-Compression-Restore)
 * Unified 4-level compression pipeline:
 *   Level 1 (Lossless): strip HTML comments, collapse whitespace
 *   Level 2 (Structural): clip head/tail, preserve structure markers
 *   Level 3 (Semantic): extract key points, drop redundancy
 *   Level 4 (Aggressive): drop entire sections by priority
 *
 * Combines Headroom's content routing with Magnifiqe's existing minifyTokens/clipText.
 */

import { detectContentType, splitIntoSections, ContentType } from "./content-detector.js";
import { CompressionLevel, recommendLevel, THRESHOLDS } from "./thresholds.js";
import { CompressionStore, createSentinel, SENTINEL_KEY } from "./store.js";
import { cacheAligner } from "./cache-aligner.js";

// ─── Level 1: Lossless ──────────────────────────────────────────────────────

/**
 * Strip HTML comments, collapse whitespace, normalize blank lines.
 * Equivalent to helpers.minifyTokens but standalone.
 * @param {string} text
 * @returns {string}
 */
export function losslessCompress(text) {
  if (!text) return "";
  return text
    .replace(/<!--[\s\S]*?-->/g, "")           // HTML comments
    .replace(/[ \t]+/g, " ")                    // Collapse spaces
    .replace(/\n{3,}/g, "\n\n")                 // Max 2 consecutive newlines
    .trim();
}

// ─── Level 2: Structural ────────────────────────────────────────────────────

/**
 * Clip text keeping head/tail with marker.
 * Head gets 40%, tail gets remaining.
 * @param {string} text
 * @param {number} [maxChars=2000]
 * @returns {string}
 */
export function structuralCompress(text, maxChars = 2000) {
  if (!text || text.length <= maxChars) return text || "";
  const headRatio = 0.4;
  const headEnd = Math.floor(maxChars * headRatio);
  const tailStart = text.length - (maxChars - headEnd);
  const head = text.slice(0, headEnd);
  const tail = text.slice(tailStart);
  const dropped = text.length - headEnd - (text.length - tailStart);
  return `${head}\n…[structural: ${dropped} chars trimmed]…\n${tail}`;
}

// ─── Level 3: Semantic ──────────────────────────────────────────────────────

/**
 * Content-type-aware semantic compression.
 * Routes to type-specific strategy.
 * @param {string} text
 * @param {ContentType} contentType
 * @returns {string}
 */
export function semanticCompress(text, contentType) {
  if (!text) return "";

  switch (contentType) {
    case ContentType.JSON_ARRAY:
      return semanticCompressJson(text);
    case ContentType.SEARCH_RESULTS:
      return semanticCompressSearchResults(text);
    case ContentType.GIT_DIFF:
      return semanticCompressDiff(text);
    case ContentType.LOG_OUTPUT:
    case ContentType.BUILD_OUTPUT:
      return semanticCompressLogs(text);
    case ContentType.SOURCE_CODE:
      return semanticCompressCode(text);
    default:
      return structuralCompress(text, 3000);
  }
}

function semanticCompressJson(text) {
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr) || arr.length <= 10) return text;
    // Keep first 5 + last 2 + summary sentinel
    const head = arr.slice(0, 5);
    const tail = arr.slice(-2);
    const hash = "json_" + Date.now().toString(36);
    const sentinel = createSentinel(hash, arr.length - 7);
    return JSON.stringify([...head, sentinel, ...tail], null, 2);
  } catch {
    return structuralCompress(text, 3000);
  }
}

function semanticCompressSearchResults(text) {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length <= 10) return text;
  // Keep first 8 results + count summary
  const kept = lines.slice(0, 8);
  kept.push(`\n…[${lines.length - 8} additional results truncated]`);
  return kept.join("\n");
}

function semanticCompressDiff(text) {
  const lines = text.split("\n");
  // Keep diff headers + file list, drop context lines
  const meaningful = lines.filter(l =>
    l.startsWith("diff ") || l.startsWith("---") || l.startsWith("+++") ||
    l.startsWith("@@") || l.startsWith("+") || l.startsWith("-") ||
    l.startsWith("new file") || l.startsWith("deleted")
  );
  if (meaningful.length >= lines.length * 0.7) return text;
  return meaningful.join("\n") || structuralCompress(text, 3000);
}

function semanticCompressLogs(text) {
  // Keep only ERROR, FAIL, WARN lines + last 5 lines
  const lines = text.split("\n");
  const errors = lines.filter(l => /\b(ERROR|FAIL|WARN|Exception|Traceback)\b/i.test(l));
  const tail = lines.slice(-5);
  const combined = [...new Set([...errors, ...tail])];
  return combined.length > 0 ? combined.join("\n") : `[${lines.length} log lines, no errors]`;
}

function semanticCompressCode(text) {
  // Extract function/class signatures only (outline mode)
  const lines = text.split("\n");
  const signatures = lines.filter(l =>
    /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var|interface|type|def|pub\s+fn|pub\s+struct)\s+\w+/.test(l) ||
    /^\s*(if|else|for|while|switch|try|catch)\s*\(/.test(l) ||
    l.trim() === "}" || l.trim() === "});"
  );
  if (signatures.length === 0) return structuralCompress(text, 2000);
  return signatures.join("\n");
}

// ─── Level 4: Aggressive ────────────────────────────────────────────────────

/**
 * Aggressive compression: drop everything except critical markers.
 * Used when token budget is severely constrained.
 * @param {string} text
 * @param {string}保留标记 (keep markers like errors, HALT, etc.)
 * @returns {string}
 */
export function aggressiveCompress(text) {
  if (!text) return "";
  const lines = text.split("\n");
  const critical = lines.filter(l =>
    /\b(HALT|ERROR|FAIL|CRITICAL|FATAL|Exception)\b/i.test(l) ||
    /^\s*#|^\s*\/\//.test(l) && /\b(TODO|FIXME|HACK|NOTE)\b/i.test(l)
  );
  if (critical.length > 0) {
    return `[Aggressively compressed: ${lines.length} → ${critical.length} lines]\n${critical.join("\n")}`;
  }
  return `[Aggressively compressed: ${lines.length} lines reduced to summary]`;
}

// ─── Pipeline Orchestrator ──────────────────────────────────────────────────

/**
 * Run the full CCR compression pipeline.
 * Detects content type, applies CacheAligner, selects compression level, stores originals.
 *
 * @param {string} text - Input text to compress
 * @param {object} [opts]
 * @param {number} [opts.forceLevel] - Force a specific compression level
 * @param {number} [opts.contextWindow] - Model context window size
 * @param {string} [opts.toolName] - Source tool name for metadata
 * @returns {{ compressed: string, level: number, contentType: string, volatileCount: number, stored: boolean, hash: string|null }}
 */
export function compress(text, opts = {}) {
  if (!text || text.length === 0) {
    return { compressed: text || "", level: CompressionLevel.NONE, contentType: "empty", volatileCount: 0, stored: false, hash: null };
  }

  // 1. Detect content type
  const contentType = detectContentType(text);

  // 2. Run CacheAligner (detector-only)
  const { totalVolatile } = cacheAligner.analyze(text);

  // 3. Determine compression level
  const level = opts.forceLevel ?? recommendLevel(text.length);

  if (level === CompressionLevel.NONE) {
    return { compressed: text, level, contentType, volatileCount: totalVolatile, stored: false, hash: null };
  }

  // 4. Apply compression
  let compressed;
  switch (level) {
    case CompressionLevel.LOSSLESS:
      compressed = losslessCompress(text);
      break;
    case CompressionLevel.STRUCTURAL:
      compressed = structuralCompress(losslessCompress(text));
      break;
    case CompressionLevel.SEMANTIC:
      compressed = semanticCompress(losslessCompress(text), contentType);
      break;
    case CompressionLevel.AGGRESSIVE:
      compressed = aggressiveCompress(text);
      break;
    default:
      compressed = text;
  }

  // 5. Store original in CCR store if significant compression occurred
  const savingsRatio = 1 - (compressed.length / text.length);
  let stored = false;
  let hash = null;
  if (savingsRatio > 0.2 && text.length > THRESHOLDS.MIN_SAVINGS * 4) {
    const store = new CompressionStore();
    hash = store.store(text, compressed, { toolName: opts.toolName || "unknown", contentType });
    stored = true;
  }

  return { compressed, level, contentType, volatileCount: totalVolatile, stored, hash };
}

export {
  CompressionLevel,
  recommendLevel,
  THRESHOLDS,
  ContentType,
  detectContentType,
  splitIntoSections,
  createSentinel,
  SENTINEL_KEY,
};
