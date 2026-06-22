/**
 * Stack Perfeita MCP — CCR Reversible Compression Store
 * Stores original content with hash key, emits sentinel markers in compressed output.
 * LLM can retrieve originals on demand via magnifiqe_retrieve(hash).
 * Port of Headroom's compression_store.py + smart_crusher.py sentinel pattern.
 */

import { createHash } from "crypto";

/** Sentinel key visible in compressed output */
export const SENTINEL_KEY = "_ccr_dropped";

/** Default TTL: 300 seconds (5 minutes) */
const DEFAULT_TTL_MS = 300_000;

/** Max store entries before eviction */
const DEFAULT_MAX_ENTRIES = 1000;

/**
 * Check if an object is a CCR sentinel.
 * @param {*} item
 * @returns {boolean}
 */
export function isCcrSentinel(item) {
  return typeof item === "object" && item !== null && SENTINEL_KEY in item;
}

/**
 * Create a sentinel object for compressed/dropped content.
 * @param {string} hash - Storage key
 * @param {number} rowsOffloaded - Number of rows dropped
 * @returns {object}
 */
export function createSentinel(hash, rowsOffloaded) {
  return { [SENTINEL_KEY]: `<<ccr:${hash} ${rowsOffloaded}_rows_offloaded>>` };
}

/**
 * Thread-safe compression store with TTL-based expiration.
 */
export class CompressionStore {
  #store = new Map(); // hash → { original, compressed, metadata, createdAt }
  #accessOrder = [];  // LRU tracking
  #maxEntries;
  #defaultTtl;

  /**
   * @param {object} opts
   * @param {number} [opts.maxEntries=1000]
   * @param {number} [opts.defaultTtl=300000] - TTL in milliseconds
   */
  constructor({ maxEntries = DEFAULT_MAX_ENTRIES, defaultTtl = DEFAULT_TTL_MS } = {}) {
    this.#maxEntries = maxEntries;
    this.#defaultTtl = defaultTtl;
  }

  /**
   * Store original content and return a hash key.
   * @param {string} original - Original content
   * @param {string} compressed - Compressed version
   * @param {object} [metadata={}] - Extra metadata (toolName, queryContext, etc.)
   * @returns {string} hash key (SHA-256 truncated to 24 chars)
   */
  store(original, compressed, metadata = {}) {
    const hash = createHash("sha256").update(original).digest("hex").slice(0, 24);
    this.#store.set(hash, {
      original,
      compressed,
      metadata,
      createdAt: Date.now(),
    });
    this.#accessOrder.push(hash);
    this.#evict();
    return hash;
  }

  /**
   * Retrieve original content by hash.
   * @param {string} hash
   * @param {string} [query] - Optional BM25-style query filter
   * @returns {{ original: string, compressed: string, metadata: object } | null}
   */
  retrieve(hash, query = null) {
    const entry = this.#store.get(hash);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > this.#defaultTtl) {
      this.#store.delete(hash);
      this.#accessOrder = this.#accessOrder.filter(h => h !== hash);
      return null;
    }

    // Update LRU
    this.#accessOrder = this.#accessOrder.filter(h => h !== hash);
    this.#accessOrder.push(hash);

    // Optional query filter (simple substring match as BM25 approximation)
    if (query && typeof entry.original === "string") {
      const lowerQuery = query.toLowerCase();
      const lowerOriginal = entry.original.toLowerCase();
      if (!lowerOriginal.includes(lowerQuery)) {
        return { ...entry, original: `[Content does not match query: "${query}"]` };
      }
    }

    return { original: entry.original, compressed: entry.compressed, metadata: entry.metadata };
  }

  /**
   * Get metadata without fetching full content.
   * @param {string} hash
   * @returns {object | null}
   */
  getMetadata(hash) {
    const entry = this.#store.get(hash);
    if (!entry) return null;
    return { ...entry.metadata, createdAt: entry.createdAt, size: entry.original.length };
  }

  /** @returns {number} Current entry count */
  get size() { return this.#store.size; }

  /** Evict oldest entries when over capacity */
  #evict() {
    while (this.#store.size > this.#maxEntries) {
      const oldest = this.#accessOrder.shift();
      if (oldest) this.#store.delete(oldest);
    }
  }

  /** Clear all entries */
  clear() {
    this.#store.clear();
    this.#accessOrder = [];
  }
}

/** Singleton store instance */
export const compressionStore = new CompressionStore();
