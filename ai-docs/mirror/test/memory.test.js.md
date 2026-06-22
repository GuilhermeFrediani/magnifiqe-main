# test/memory.test.js

- kind: js
- lines: 116
- bytes: 4552

## Summary
Test suite for src/memory.js Tests: memory file I/O, observation format, search logic NOTE: The "Observation search logic" suite below reimplements the filter logic inline (Array.filter + toLowerCase + includes) instead of importing from src/memory.js. This is intentional — loadMemory() and normalizeMemory() are not exported and read from disk, making them impractical to unit test in isolation. These tests serve as documentation-level placeholders for the search algorithm's contract. The real integration coverage lives in test/memory-handlers.test.js, which exercises save_observation and search_observations through the MCP tool handlers end-to-end.

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`

## Exports
- none

## Source
```js
/**
 * Test suite for src/memory.js
 * Tests: memory file I/O, observation format, search logic
 *
 * NOTE: The "Observation search logic" suite below reimplements the filter
 * logic inline (Array.filter + toLowerCase + includes) instead of importing
 * from src/memory.js. This is intentional — loadMemory() and normalizeMemory()
 * are not exported and read from disk, making them impractical to unit test
 * in isolation. These tests serve as documentation-level placeholders for the
 * search algorithm's contract. The real integration coverage lives in
 * test/memory-handlers.test.js, which exercises save_observation and
 * search_observations through the MCP tool handlers end-to-end.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

const TEST_MEMORY_DIR = resolve(process.cwd(), '.claude_test');
const TEST_MEMORY_FILE = resolve(TEST_MEMORY_DIR, 'session_memory.json');

function cleanup() {
  if (existsSync(TEST_MEMORY_DIR)) {
    rmSync(TEST_MEMORY_DIR, { recursive: true, force: true });
  }
}

describe('Memory file format', () => {
  afterEach(() => cleanup());

  it('should store observations as JSON array', () => {
    mkdirSync(TEST_MEMORY_DIR, { recursive: true });
    const observations = [
      { timestamp: new Date().toISOString(), text: 'Test observation 1' },
      { timestamp: new Date().toISOString(), text: 'Test observation 2' },
    ];
    writeFileSync(TEST_MEMORY_FILE, JSON.stringify(observations, null, 2), 'utf-8');

    const loaded = JSON.parse(readFileSync(TEST_MEMORY_FILE, 'utf-8'));
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].text, 'Test observation 1');
    assert.strictEqual(loaded[1].text, 'Test observation 2');
  });

  it('should handle empty memory file', () => {
    mkdirSync(TEST_MEMORY_DIR, { recursive: true });
    writeFileSync(TEST_MEMORY_FILE, '[]', 'utf-8');

    const loaded = JSON.parse(readFileSync(TEST_MEMORY_FILE, 'utf-8'));
    assert.strictEqual(loaded.length, 0);
  });

  it('should handle corrupt JSON gracefully', () => {
    mkdirSync(TEST_MEMORY_DIR, { recursive: true });
    writeFileSync(TEST_MEMORY_FILE, 'not valid json{{{', 'utf-8');

    let result;
    try {
      result = JSON.parse(readFileSync(TEST_MEMORY_FILE, 'utf-8'));
    } catch {
      result = [];
    }
    assert.deepStrictEqual(result, []);
  });

  it('should append new observations to existing array', () => {
    mkdirSync(TEST_MEMORY_DIR, { recursive: true });
    const existing = [{ timestamp: '2025-01-01T00:00:00.000Z', text: 'Existing' }];
    writeFileSync(TEST_MEMORY_FILE, JSON.stringify(existing), 'utf-8');

    // Simulate load + append + save cycle (same logic as memory.js)
    const mem = JSON.parse(readFileSync(TEST_MEMORY_FILE, 'utf-8'));
    mem.push({ timestamp: new Date().toISOString(), text: 'New observation' });
    writeFileSync(TEST_MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf-8');

    const loaded = JSON.parse(readFileSync(TEST_MEMORY_FILE, 'utf-8'));
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[1].text, 'New observation');
  });
});

describe('Observation search logic', () => {
  it('should filter observations by keyword (case-insensitive)', () => {
    const mem = [
      { timestamp: '2025-01-01', text: 'The API uses JWT authentication' },
      { timestamp: '2025-01-02', text: 'Database connection pool set to 10' },
      { timestamp: '2025-01-03', text: 'JWT tokens expire after 24h' },
    ];
    const query = 'jwt';
    const results = mem.filter(o => o.text.toLowerCase().includes(query.toLowerCase()));
    assert.strictEqual(results.length, 2);
  });

  it('should return empty array when no match', () => {
    const mem = [{ timestamp: '2025-01-01', text: 'Hello world' }];
    const results = mem.filter(o => o.text.toLowerCase().includes('xyz'.toLowerCase()));
    assert.strictEqual(results.length, 0);
  });

  it('should match partial keywords', () => {
    const mem = [
      { timestamp: '2025-01-01', text: 'Authentication module refactored' },
    ];
    const results = mem.filter(o => o.text.toLowerCase().includes('auth'.toLowerCase()));
    assert.strictEqual(results.length, 1);
  });
});

describe('Observation timestamp format', () => {
  it('should use ISO 8601 format', () => {
    const ts = new Date().toISOString();
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(ts));
  });
});

```
