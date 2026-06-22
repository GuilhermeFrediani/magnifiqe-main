# test/memory-handlers.test.js

- kind: js
- lines: 185
- bytes: 7155

## Summary
Handler-level tests for src/memory.js tools Tests save_observation and search_observations via mock server.

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`
- `../src/memory.js`
- `../src/config.js`
- `../src/rate-limiter.js`

## Exports
- none

## Source
```js
/**
 * Handler-level tests for src/memory.js tools
 * Tests save_observation and search_observations via mock server.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { registerMemoryTools } from '../src/memory.js';
import { MEMORY_FILE } from '../src/config.js';
import { rateLimiter } from '../src/rate-limiter.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, desc, schema, handler) => {
        tools[name] = { desc, schema, handler };
      },
    },
    tools,
  };
}

function mockResponse(result) {
  return result?.content?.[0]?.text || '';
}

// ─── File isolation ───────────────────────────────────────────────────────────

let originalContent = null;

function ensureMemoryDir() {
  const dir = dirname(MEMORY_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function blankMemory() {
  writeFileSync(MEMORY_FILE, '[]', 'utf-8');
}

describe('memory handler tools', () => {
  before(() => {
    // Back up existing memory file so tests don't pollute real memory
    ensureMemoryDir();
    if (existsSync(MEMORY_FILE)) {
      originalContent = readFileSync(MEMORY_FILE, 'utf-8');
    }
    blankMemory();
  });

  after(() => {
    // Restore original memory file
    if (originalContent !== null) {
      writeFileSync(MEMORY_FILE, originalContent, 'utf-8');
    } else if (existsSync(MEMORY_FILE)) {
      writeFileSync(MEMORY_FILE, '[]', 'utf-8');
    }
  });

  beforeEach(() => {
    // Reset rate limiter counters so tests don't trip over limits
    rateLimiter.counters = {};
    // Start each test with a clean memory file
    blankMemory();
  });

  // ─── save_observation ─────────────────────────────────────────────────────

  describe('save_observation', () => {
    it('should save an observation and confirm', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      const result = await tools.save_observation.handler({
        observation: 'The API uses Bearer tokens for auth',
      });
      const text = mockResponse(result);

      assert.ok(text.includes('Observation saved'), 'should confirm save');
    });

    it('should persist the observation to the memory file', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      await tools.save_observation.handler({
        observation: 'Config lives in src/config.js',
      });

      const saved = JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'));
      assert.strictEqual(saved.length, 1, 'should have one entry');
      assert.strictEqual(saved[0].text, 'Config lives in src/config.js');
    });

    it('should deduplicate observations with the same text', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      await tools.save_observation.handler({ observation: 'Dedup test entry' });
      await tools.save_observation.handler({ observation: 'Dedup test entry' });

      const saved = JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'));
      assert.strictEqual(saved.length, 1, 'duplicate should be collapsed to one entry');
    });
  });

  // ─── search_observations ──────────────────────────────────────────────────

  describe('search_observations', () => {
    it('should find observations matching the query (case-insensitive)', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      await tools.save_observation.handler({ observation: 'The database uses PostgreSQL' });
      await tools.save_observation.handler({ observation: 'Redis caches session tokens' });

      const result = await tools.search_observations.handler({ query: 'postgres' });
      const text = mockResponse(result);

      assert.ok(text.includes('PostgreSQL'), 'should contain the matched observation');
      assert.ok(text.includes('Observations matching'), 'should have results header');
      assert.ok(!text.includes('Redis'), 'should not contain unrelated observation');
    });

    it('should return a "no observations found" message when nothing matches', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      await tools.save_observation.handler({ observation: 'Some unrelated note' });

      const result = await tools.search_observations.handler({ query: 'zzz_nonexistent_keyword' });
      const text = mockResponse(result);

      assert.ok(text.includes('No observations found'), 'should report no matches');
      assert.ok(text.includes('zzz_nonexistent_keyword'), 'should echo the query');
    });

    it('should return no-match message when memory is empty', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      const result = await tools.search_observations.handler({ query: 'anything' });
      const text = mockResponse(result);

      assert.ok(text.includes('No observations found'), 'should report no matches on empty memory');
    });
  });

  // ─── save then search round-trip ──────────────────────────────────────────

  describe('save and search round-trip', () => {
    it('should find a freshly saved observation', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      await tools.save_observation.handler({ observation: 'MCP tools use Zod schemas' });

      const result = await tools.search_observations.handler({ query: 'MCP' });
      const text = mockResponse(result);

      assert.ok(text.includes('MCP tools use Zod schemas'), 'should find the just-saved observation');
    });

    it('should handle case-insensitive search across multiple saves', async () => {
      const { server, tools } = createMockServer();
      registerMemoryTools(server);

      await tools.save_observation.handler({ observation: 'Error handling uses try/catch' });
      await tools.save_observation.handler({ observation: 'Tests use node:test runner' });

      const result = await tools.search_observations.handler({ query: 'ERROR' });
      const text = mockResponse(result);

      assert.ok(text.includes('Error handling uses try/catch'), 'should match case-insensitively');
      assert.ok(!text.includes('Tests use'), 'should not match unrelated entry');
    });
  });
});

```
