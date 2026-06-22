/**
 * Stack Perfeita MCP — CacheAligner (Detector-Only)
 * Detects volatile content (UUIDs, timestamps, JWTs, hex hashes) in text.
 * Does NOT mutate — emits warnings and tracks prefix stability.
 * Port of Headroom's cache_aligner.py pattern.
 */

const HEX_HASH_LENGTHS = new Set([32, 40, 64]);
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const ISO8601_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const HEX_HASH_PATTERN = /\b[0-9a-f]{32,64}\b/g;

/**
 * Detect volatile content in text.
 * @param {string} text
 * @returns {{ uuid: number, iso8601: number, jwt: number, hexHash: number }}
 */
export function detectVolatileContent(text) {
  if (!text || typeof text !== "string") return { uuid: 0, iso8601: 0, jwt: 0, hexHash: 0 };

  const uuidMatches = text.match(UUID_PATTERN) || [];
  const isoMatches = text.match(ISO8601_PATTERN) || [];
  const jwtMatches = text.match(JWT_PATTERN) || [];
  const hexMatches = text.match(HEX_HASH_PATTERN) || [];

  // Filter hex hashes that are actually UUIDs (avoid double-counting)
  const uuidSet = new Set(uuidMatches.map(u => u.replace(/-/g, "")));
  const realHexHashes = hexMatches.filter(h => !uuidSet.has(h) && HEX_HASH_LENGTHS.has(h.length));

  return {
    uuid: uuidMatches.length,
    iso8601: isoMatches.length,
    jwt: jwtMatches.length,
    hexHash: realHexHashes.length,
  };
}

/**
 * Compute a stable hash of text for prefix stability tracking.
 * @param {string} text
 * @returns {string} hex hash (first 16 chars)
 */
export function computePrefixHash(text) {
  if (!text) return "";
  // Simple hash — not cryptographic, just for stability tracking
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 16);
}

/**
 * CacheAligner class — tracks volatile content and prefix stability.
 * Detector-only: never mutates input.
 */
export class CacheAligner {
  #previousHash = null;
  #totalDetections = 0;

  /**
   * Analyze text for volatile content.
   * @param {string} text
   * @returns {{ volatile: { uuid: number, iso8601: number, jwt: number, hexHash: number }, prefixHash: string, prefixChanged: boolean, totalVolatile: number }}
   */
  analyze(text) {
    const volatile = detectVolatileContent(text);
    const totalVolatile = volatile.uuid + volatile.iso8601 + volatile.jwt + volatile.hexHash;
    const prefixHash = computePrefixHash(text);
    const prefixChanged = this.#previousHash !== null && this.#previousHash !== prefixHash;
    this.#previousHash = prefixHash;
    this.#totalDetections += totalVolatile;

    return { volatile, prefixHash, prefixChanged, totalVolatile };
  }

  /** @returns {number} Total volatile items detected across all analyze() calls */
  get totalDetections() { return this.#totalDetections; }

  /** Reset state */
  reset() {
    this.#previousHash = null;
    this.#totalDetections = 0;
  }
}

/** Singleton instance for request-scoped usage */
export const cacheAligner = new CacheAligner();
