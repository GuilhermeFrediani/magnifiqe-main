# src/compression/content-detector.js

- kind: js
- lines: 121
- bytes: 3658

## Summary
Stack Perfeita MCP — Content Type Detector Detects content type of tool output for routing to appropriate compressor. Port of Headroom's content_detector.py pattern.

## Imports
- none

## Exports
- `ContentType`
- `detectContentType`
- `splitIntoSections`

## Source
```js
/**
 * Stack Perfeita MCP — Content Type Detector
 * Detects content type of tool output for routing to appropriate compressor.
 * Port of Headroom's content_detector.py pattern.
 */

/** @enum {string} */
export const ContentType = {
  JSON_ARRAY: "json_array",
  JSON_OBJECT: "json_object",
  SOURCE_CODE: "source_code",
  SEARCH_RESULTS: "search_results",
  BUILD_OUTPUT: "build_output",
  GIT_DIFF: "git_diff",
  HTML: "html",
  LOG_OUTPUT: "log_output",
  PLAIN_TEXT: "text",
};

const SEARCH_RESULT_PATTERN = /^[^\s:]+:\d+:/m;
const DIFF_HEADER_PATTERN = /^diff --git|^diff --combined|^diff --cc/m;
const DIFF_HUNK_PATTERN = /^@@|@@@/m;
const HTML_DOCTYPE_PATTERN = /^\s*<!doctype\s+html/i;
const HTML_TAG_PATTERN = /<html[\s>]/i;
const LOG_PATTERNS = [
  /^\s*(PASS|FAIL|OK|ERROR|WARN)\s/m,
  /^\s*\d+\s+(passing|failing|tests?)\s/m,
  /Traceback \(most recent call last\):/m,
  /^\s*at\s+.*\(\S+:\d+:\d+\)/m,
];
const CODE_INDICATORS = [
  /\bfunction\s+\w+\s*\(/,
  /\bclass\s+\w+\s*[{(:]/,
  /\b(const|let|var)\s+\w+\s*=/,
  /\bimport\s+.*from\s+["']/,
  /\bexport\s+(default\s+)?/,
  /^\s*(def|class|import|from)\s+/m,
  /\binterface\s+\w+/,
  /\btype\s+\w+\s*=/,
];

/**
 * Detect content type of a text block.
 * @param {string} text
 * @returns {ContentType}
 */
export function detectContentType(text) {
  if (!text || typeof text !== "string") return ContentType.PLAIN_TEXT;
  const trimmed = text.trim();
  if (trimmed.length === 0) return ContentType.PLAIN_TEXT;

  // JSON detection
  if (/^\s*[[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return ContentType.JSON_ARRAY;
      return ContentType.JSON_OBJECT;
    } catch { /* not JSON */ }
  }

  // Diff detection
  if (DIFF_HEADER_PATTERN.test(trimmed) || DIFF_HUNK_PATTERN.test(trimmed)) {
    return ContentType.GIT_DIFF;
  }

  // HTML detection
  if (HTML_DOCTYPE_PATTERN.test(trimmed) || HTML_TAG_PATTERN.test(trimmed)) {
    return ContentType.HTML;
  }

  // Search results (grep -n style)
  const lines = trimmed.split("\n");
  const searchMatchCount = lines.filter(l => SEARCH_RESULT_PATTERN.test(l)).length;
  if (searchMatchCount > lines.length * 0.3 && lines.length > 3) {
    return ContentType.SEARCH_RESULTS;
  }

  // Log output
  const logMatchCount = LOG_PATTERNS.filter(p => p.test(trimmed)).length;
  if (logMatchCount >= 2) return ContentType.LOG_OUTPUT;
  if (/^\s*(FAIL|ERROR|PASS|ok)\s/m.test(trimmed) && lines.length > 5) {
    return ContentType.BUILD_OUTPUT;
  }

  // Source code
  const codeMatches = CODE_INDICATORS.filter(p => p.test(trimmed)).length;
  if (codeMatches >= 2) return ContentType.SOURCE_CODE;

  return ContentType.PLAIN_TEXT;
}

/**
 * Split mixed content into typed sections.
 * Handles code fences, JSON blocks, and mixed text.
 * @param {string} content
 * @returns {{ type: ContentType, text: string }[]}
 */
export function splitIntoSections(content) {
  if (!content) return [];
  const sections = [];
  const fencePattern = /^```(\w*)\n([\s\S]*?)^```/gm;
  let lastIdx = 0;
  let match;

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIdx) {
      const text = content.slice(lastIdx, match.index);
      sections.push({ type: detectContentType(text), text });
    }
    sections.push({ type: ContentType.SOURCE_CODE, text: match[2].trim() });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < content.length) {
    const text = content.slice(lastIdx);
    sections.push({ type: detectContentType(text), text });
  }

  return sections.length > 0 ? sections : [{ type: detectContentType(content), text: content }];
}

```
