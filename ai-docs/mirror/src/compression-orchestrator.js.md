# src/compression-orchestrator.js

- kind: js
- lines: 221
- bytes: 8529

## Summary
Stack Perfeita MCP — Compression Orchestrator Wires the CCR pipeline (content-detector → cache-aligner → ccr-hierarchy → store) into a simple compress/decompress API for tool outputs. Flow: 1. CacheAligner detects volatile content (UUIDs, timestamps, JWTs) 2. ContentDetector determines content type 3. CCR hierarchy applies appropriate compression level 4. CompressionStore saves originals with sentinel markers 5. CircuitBreaker skips compression on repeated failures

## Imports
- `zod`
- `./compression/content-detector.js`
- `./compression/ccr-hierarchy.js`
- `./compression/store.js`
- `./compression/cache-aligner.js`
- `./interceptors/base.js`
- `./compression/circuit-breaker.js`
- `./compression/thresholds.js`

## Exports
- `compressToolOutput`
- `decompressOutput`
- `getCompressionStats`
- `registerCompressionTools`

## Source
```js
/**
 * Stack Perfeita MCP — Compression Orchestrator
 * Wires the CCR pipeline (content-detector → cache-aligner → ccr-hierarchy → store)
 * into a simple compress/decompress API for tool outputs.
 *
 * Flow:
 *   1. CacheAligner detects volatile content (UUIDs, timestamps, JWTs)
 *   2. ContentDetector determines content type
 *   3. CCR hierarchy applies appropriate compression level
 *   4. CompressionStore saves originals with sentinel markers
 *   5. CircuitBreaker skips compression on repeated failures
 */

import { z } from "zod";
import { detectContentType } from "./compression/content-detector.js";
import { compress, recommendLevel, CompressionLevel } from "./compression/ccr-hierarchy.js";
import { compressionStore } from "./compression/store.js";
import { cacheAligner } from "./compression/cache-aligner.js";
import { interceptorRegistry } from "./interceptors/base.js";
import { circuitBreaker } from "./compression/circuit-breaker.js";
import { evaluateCompressionNeed } from "./compression/thresholds.js";

/**
 * Estimate token count from text (rough: ~4 chars per token).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Compress tool output through the full CCR pipeline.
 *
 * @param {string} text - Raw tool output
 * @param {object} [opts]
 * @param {string} [opts.toolName] - Tool name for metrics tracking
 * @param {number} [opts.targetTokens] - Target token count for compression
 * @param {number} [opts.contextWindow] - Model context window size
 * @returns {{ compressed: string, original: string, stats: object, sentinel: string|null }}
 */
export function compressToolOutput(text, opts = {}) {
  const { toolName = "unknown", targetTokens, contextWindow } = opts;

  if (!text || typeof text !== "string") {
    return { compressed: text || "", original: text || "", stats: { level: 0, saved: 0 }, sentinel: null };
  }

  // Circuit breaker: if pipeline keeps failing, pass through
  if (circuitBreaker.shouldSkip()) {
    return {
      compressed: text,
      original: text,
      stats: { level: 0, saved: 0, circuitBreakerOpen: true },
      sentinel: null,
    };
  }

  const originalTokens = estimateTokens(text);
  const originalChars = text.length;

  // Step 1: Cache alignment analysis
  const volatileAnalysis = cacheAligner.analyze(text);

  // Step 1.5: Interceptor pre-processing (tool-specific compression)
  let processedText = text;
  if (toolName && toolName !== "unknown") {
    const interceptorResult = interceptorRegistry.process(toolName, {}, text);
    if (interceptorResult) {
      processedText = interceptorResult.transformed;
    }
  }

  // Step 2: Content type detection
  const contentType = detectContentType(processedText);

  // Step 3: Determine compression level
  let level;
  if (targetTokens) {
    const ratio = targetTokens / originalTokens;
    if (ratio >= 0.9) level = CompressionLevel.NONE;
    else if (ratio >= 0.6) level = CompressionLevel.LOSSLESS;
    else if (ratio >= 0.3) level = CompressionLevel.STRUCTURAL;
    else level = CompressionLevel.SEMANTIC;
  } else if (contextWindow) {
    const evaluation = evaluateCompressionNeed(originalTokens, contextWindow);
    level = evaluation.recommendedLevel;
  } else {
    level = recommendLevel(originalTokens);
  }

  // Step 4: Apply compression
  try {
    const ccrResult = compress(processedText, { forceLevel: level, contentType });
    const compressed = ccrResult.compressed;

    // Step 5: Store original if compression happened
    let sentinel = null;
    if (level > CompressionLevel.NONE && compressed.length < processedText.length) {
      const hash = compressionStore.store(text, compressed, {
        toolName,
        contentType,
        level,
        volatileAnalysis,
      });
      sentinel = hash;
    }

    const compressedTokens = estimateTokens(compressed);
    const stats = {
      level,
      contentType,
      originalChars,
      compressedChars: compressed.length,
      originalTokens,
      compressedTokens,
      savedTokens: originalTokens - compressedTokens,
      savingsPercent: originalTokens > 0 ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 100) : 0,
      volatileItems: volatileAnalysis.totalVolatile,
    };

    circuitBreaker.recordSuccess();
    return { compressed, original: text, stats, sentinel };
  } catch (error) {
    circuitBreaker.recordFailure();
    return {
      compressed: text,
      original: text,
      stats: { level: 0, saved: 0, error: error.message },
      sentinel: null,
    };
  }
}

/**
 * Decompress a sentinel-marked output by retrieving the original.
 * @param {string} hash - Sentinel hash from compressToolOutput
 * @param {string} [query] - Optional query for filtered retrieval
 * @returns {{ found: boolean, original: string|null, metadata: object|null }}
 */
export function decompressOutput(hash, query = null) {
  const result = compressionStore.retrieve(hash, query);
  if (!result) {
    return { found: false, original: null, metadata: null };
  }
  return { found: true, original: result.original, metadata: result.metadata };
}

/**
 * Get compression stats for observability.
 * @returns {{ storeSize: number, circuitBreaker: object, cacheAlignerDetections: number }}
 */
export function getCompressionStats() {
  return {
    storeSize: compressionStore.size,
    circuitBreaker: circuitBreaker.status(),
    cacheAlignerDetections: cacheAligner.totalDetections,
  };
}

/**
 * Register compression tools on the MCP server.
 * Tools: compress_tool_output, decompress_tool_output, compression_stats
 */
export function registerCompressionTools(server) {
  // ── compress_tool_output ──────────────────────────────────────────────────
  server.tool(
    "compress_tool_output",
    "Compresses large tool output through the CCR (Compression-Compression-Restore) pipeline. Detects content type, applies appropriate compression level, and stores the original for decompression. Returns compressed output with stats.",
    {
      text: z.string().describe("Raw tool output text to compress."),
      tool_name: z.string().optional().describe("Name of the tool that produced this output."),
      target_tokens: z.number().optional().describe("Target token count for compression."),
    },
    async ({ text, tool_name, target_tokens }) => {
      const result = compressToolOutput(text, {
        toolName: tool_name || "unknown",
        targetTokens: target_tokens,
      });

      return {
        content: [{
          type: "text",
          text: result.sentinel
            ? `[Compressed: ${result.stats.originalTokens} → ${result.stats.compressedTokens} tokens (${result.stats.savingsPercent}% saved)]\nDecompress with hash: ${result.sentinel}\n\n${result.compressed}`
            : `[No compression needed: ${result.stats.originalTokens} tokens]\n\n${result.compressed}`,
        }],
      };
    }
  );

  // ── decompress_tool_output ────────────────────────────────────────────────
  server.tool(
    "decompress_tool_output",
    "Retrieves the original uncompressed content from a CCR sentinel hash. Use when compressed output needs to be restored to full detail.",
    {
      hash: z.string().describe("Sentinel hash from compress_tool_output."),
      query: z.string().optional().describe("Optional query to filter retrieval."),
    },
    async ({ hash, query }) => {
      const result = decompressOutput(hash, query);
      if (!result.found) {
        return { content: [{ type: "text", text: `HALT — Compressed content not found for hash: ${hash}. It may have expired (TTL: 5 min).` }] };
      }
      return { content: [{ type: "text", text: result.original }] };
    }
  );

  // ── compression_stats ─────────────────────────────────────────────────────
  server.tool(
    "compression_stats",
    "Returns compression pipeline statistics: store size, circuit breaker status, volatile content detections. Use to monitor compression health.",
    {},
    async () => {
      const stats = getCompressionStats();
      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    }
  );
}

```
