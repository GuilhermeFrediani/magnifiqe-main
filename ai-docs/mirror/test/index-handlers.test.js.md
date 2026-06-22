# test/index-handlers.test.js

- kind: js
- lines: 131
- bytes: 4086

## Summary
Handler-level tests for src/index.js compress_markdown tool. The compress_markdown handler is registered inline in src/index.js (not via a registerXxxTools export), so we test the two core helpers that implement its behavior: minifyTokens (compression) and readFile (file loading / error path).

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`
- `os`
- `../src/helpers.js`

## Exports
- none

## Source
```js
/**
 * Handler-level tests for src/index.js compress_markdown tool.
 *
 * The compress_markdown handler is registered inline in src/index.js
 * (not via a registerXxxTools export), so we test the two core helpers
 * that implement its behavior: minifyTokens (compression) and readFile
 * (file loading / error path).
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { minifyTokens, readFile } from '../src/helpers.js';

const tempRoots = [];

function makeTempDir(prefix = 'stack-perfeita-index-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length) {
    const dir = tempRoots.pop();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('compress_markdown — happy path: compress a valid markdown file', () => {
  it('should remove HTML comments, collapse blank lines, and trim whitespace', () => {
    const input = [
      '# Title',
      '',
      'This is a paragraph.',
      '',
      '',
      '',
      'Another paragraph.  ',
      '<!-- TODO: remove later -->',
      'Final line.',
    ].join('\n');

    const result = minifyTokens(input);

    // HTML comment removed
    assert.ok(!result.includes('<!--'), 'HTML comment should be removed');
    assert.ok(!result.includes('TODO: remove later'), 'comment body should be gone');

    // Multiple blank lines collapsed to one
    assert.ok(!result.includes('\n\n\n'), 'should not contain triple blank lines');

    // Trailing whitespace trimmed
    assert.ok(!result.includes('  \n'), 'trailing spaces should be trimmed');

    // Content preserved
    assert.ok(result.includes('# Title'), 'heading preserved');
    assert.ok(result.includes('This is a paragraph.'), 'body text preserved');
    assert.ok(result.includes('Another paragraph.'), 'second paragraph preserved');
    assert.ok(result.includes('Final line.'), 'final line preserved');
  });

  it('should produce a smaller output than the input', () => {
    const dir = makeTempDir();
    const mdPath = join(dir, 'sample.md');
    const original = [
      '# Hello World',
      '',
      'This is a test file.',
      '',
      '',
      '',
      'With lots of blank lines.',
      '',
      '',
      '',
      '',
      '',
      'And some trailing spaces   ',
      '<!-- old comment -->',
    ].join('\n');

    writeFileSync(mdPath, original, 'utf-8');
    const content = readFile(mdPath);
    const compressed = minifyTokens(content);

    assert.ok(compressed.length < original.length,
      `compressed (${compressed.length}) should be smaller than original (${original.length})`);
  });

  it('should preserve markdown structure (headings, lists, code blocks)', () => {
    const input = [
      '## Section',
      '',
      '- item 1',
      '- item 2',
      '',
      '',
      '```js',
      'const x = 1;',
      '```',
    ].join('\n');

    const result = minifyTokens(input);

    assert.ok(result.includes('## Section'), 'heading preserved');
    assert.ok(result.includes('- item 1'), 'list items preserved');
    assert.ok(result.includes('```js'), 'code fence preserved');
    assert.ok(result.includes('const x = 1;'), 'code content preserved');
  });
});

describe('compress_markdown — error path: non-existent file', () => {
  it('readFile should return null for a non-existent path', () => {
    const result = readFile('/absolutely/nonexistent/path/to/file.md');
    assert.strictEqual(result, null, 'readFile returns null for missing file');
  });

  it('minifyTokens should handle null input gracefully', () => {
    const result = minifyTokens(null);
    assert.strictEqual(result, null, 'minifyTokens passes through null');
  });

  it('minifyTokens should handle empty string input', () => {
    const result = minifyTokens('');
    assert.strictEqual(result, '', 'minifyTokens passes through empty string');
  });
});

```
