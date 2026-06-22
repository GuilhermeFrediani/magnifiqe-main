/**
 * Stack Perfeita MCP — Helper utilities
 * File reading, path safety, token minification, rule file listing.
 */

import { readFileSync, readdirSync, existsSync, realpathSync, writeFileSync, renameSync, copyFileSync, unlinkSync, mkdirSync } from "fs";
import { dirname, isAbsolute, relative, resolve, join } from "path";
import { RULES_DIR, RULE_DESCRIPTIONS } from "./config.js";
import { semanticCompress as _semanticCompress, getCompressionStats as _getCompressionStats, classifyTokens as _classifyTokens } from "./semantic-compression.js";

function getExistingRealpath(inputPath) {
  if (existsSync(inputPath)) {
    return realpathSync(inputPath);
  }

  const parent = dirname(inputPath);
  if (parent === inputPath) {
    return resolve(inputPath);
  }

  if (existsSync(parent)) {
    return resolve(realpathSync(parent), inputPath.slice(parent.length + 1));
  }

  return resolve(inputPath);
}

export function safeResolvePath(base, filename) {
  let baseResolved;
  try {
    baseResolved = existsSync(base) ? realpathSync(resolve(base)) : resolve(base);
  } catch {
    // realpathSync can throw if base was deleted between existsSync and realpathSync (TOCTOU)
    baseResolved = resolve(base);
  }
  const targetResolved = resolve(baseResolved, filename);
  const targetCanonical = getExistingRealpath(targetResolved);
  const rel = relative(baseResolved, targetCanonical);

  if (rel === "") {
    return targetCanonical;
  }

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path traversal detected: ${filename}`);
  }

  return targetCanonical;
}

export function readFile(filePath) {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Minifies markdown/text output to save tokens:
 * - Removes markdown comments <!-- -->
 * - Collapses multiple blank lines to a single blank line
 * - Trims trailing whitespaces
 */
export function minifyTokens(text) {
  if (!text) return text;
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
/**
 * Atomically writes data to a file using write-to-temp + rename.
 * Keeps one backup of the previous version at <path>.bak
 */
export function atomicWrite(filePath, data) {
  const dir = dirname(resolve(filePath));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    writeFileSync(tmpPath, data, "utf-8");
    // Backup current file before overwriting
    if (existsSync(filePath)) {
      copyFileSync(filePath, `${filePath}.bak`);
    }
    renameSync(tmpPath, filePath);
  } catch (e) {
    // Clean up temp file on failure
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    throw e;
  }
}

/**
 * Validates a user-supplied absolute path for traversal attacks.
 * Unlike safeResolvePath, does NOT enforce a project-root boundary.
 * Use for tools that accept any valid filesystem path.
 */
export function validateAbsolutePath(inputPath) {
  // Check raw input BEFORE resolve() normalizes away traversal components.
  // resolve() turns "/allowed/../../../etc/passwd" into "/etc/passwd",
  // which then passes the post-resolve check. We must catch it upstream.
  const raw = String(inputPath).replace(/\\/g, "/");
  // Split into segments and reject any ".." component
  const segments = raw.split("/").filter(Boolean);
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`Path traversal detected: ${inputPath}`);
    }
  }
  const resolved = resolve(inputPath);
  const normalized = resolved.replace(/\\/g, "/");
  // Defense-in-depth: also check the resolved path
  if (normalized.includes("/../") || normalized.endsWith("/..") || normalized.includes("/./")) {
    throw new Error(`Path traversal detected: ${inputPath}`);
  }
  return resolved;
}
// ─── Text Normalization ──────────────────────────────────────────────────────
// Shared text normalization utilities.

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    return value
      .split(/\n|;|•|-/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

export function normalizeList(value, maxItems) {
  const seen = new Set();
  const output = [];
  for (const item of toArray(value)) {
    const normalized = normalizeText(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (maxItems && output.length >= maxItems) break;
  }
  return output;
}


export function listRuleFiles() {
  try {
    return readdirSync(RULES_DIR)
      .filter(f => f.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}

export function getRuleByTopic(topic) {
  const files = listRuleFiles();

  const exact = files.find(f => f === topic || f === `${topic}.md`);
  if (exact) return { file: exact, content: readFile(resolve(RULES_DIR, exact)) };

  const fuzzy = files.find(f => f.toLowerCase().includes(topic.toLowerCase()));
  if (fuzzy) return { file: fuzzy, content: readFile(resolve(RULES_DIR, fuzzy)) };

  return null;
}

export function formatRuleList(files) {
  return files.map(f => {
    const desc = RULE_DESCRIPTIONS[f] || "Custom rule file";
    return `- **${f}** — ${desc}`;
  }).join("\n");
}

/**
 * Parse YAML-like frontmatter from markdown content.
 * Extracts key: value pairs from between --- delimiters.
 */
export function parseSkillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    fm[key] = val;
  }
  return fm;
}


export function serializePretty(value) {
  return JSON.stringify(value, null, 2);
}

// ─── Semantic Compression Re-exports ─────────────────────────────────────────
// Re-export semantic compression functions for use by other modules.
export const semanticCompress = _semanticCompress;
export const getSemanticCompressionStats = _getCompressionStats;
export const classifyTokens = _classifyTokens;
