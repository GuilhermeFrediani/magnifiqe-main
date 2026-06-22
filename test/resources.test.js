/**
 * Test suite for src/resources.js
 * Tests: registerResources function, resource registrations via mock server.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { registerResources } from '../src/resources.js';
import { listRuleFiles } from '../src/helpers.js';

/* ── Mock server ─────────────────────────────────────────── */

function createMockServer() {
  const resources = [];       // all registrations in order
  const byUri = {};           // keyed by URI
  return {
    server: {
      resource(name, uri, handler) {
        const entry = { name, uri, handler };
        resources.push(entry);
        byUri[uri] = entry;
      },
    },
    resources,
    byUri,
  };
}

/* ── Setup ───────────────────────────────────────────────── */

let mock;

beforeEach(() => {
  mock = createMockServer();
  registerResources(mock.server);
});

/* ── registerResources ───────────────────────────────────── */

describe('registerResources', () => {
  it('should be a function', () => {
    assert.strictEqual(typeof registerResources, 'function');
  });

  it('should register the ai-rules-list index resource', () => {
    assert.ok(mock.byUri['ai-rules://list'], 'ai-rules-list resource should be registered');
    assert.strictEqual(mock.byUri['ai-rules://list'].name, 'ai-rules-list');
  });

  it('should register a resource for each rule file on disk', () => {
    const ruleFiles = listRuleFiles();
    assert.ok(ruleFiles.length > 0, 'listRuleFiles should return at least one file');

    for (const file of ruleFiles) {
      const uri = `ai-rules://${file}`;
      assert.ok(
        mock.byUri[uri],
        `Resource should be registered for rule file: ${file} (uri: ${uri})`,
      );
    }
  });

  it('should register the project-state resource', () => {
    assert.ok(mock.byUri['state://project'], 'project-state resource should be registered');
    assert.strictEqual(mock.byUri['state://project'].name, 'project-state');
  });


  it('should register the session-memory resource', () => {
    assert.ok(mock.byUri['state://memory'], 'session-memory resource should be registered');
    assert.strictEqual(mock.byUri['state://memory'].name, 'session-memory');
  });

  it('should register at least 14 rule file resources plus the index', () => {
    const ruleFiles = listRuleFiles();
    assert.ok(
      mock.resources.length >= ruleFiles.length + 1,
      `Expected at least ${ruleFiles.length + 1} registrations (rules + index), got ${mock.resources.length}`,
    );
  });

  it('should register all 4 fixed resources (index + 2 state + memory)', () => {
    // ai-rules-list, project-state, session-memory
    const fixedUris = ['ai-rules://list', 'state://project', 'state://memory'];
    for (const uri of fixedUris) {
      assert.ok(mock.byUri[uri], `Fixed resource ${uri} should be registered`);
    }
  });
});

/* ── ai-rules-list handler ──────────────────────────────── */

describe('ai-rules-list resource handler', () => {
  it('should return markdown listing of rule files', async () => {
    const result = await mock.byUri['ai-rules://list'].handler();
    const text = result.contents[0].text;

    assert.ok(text.includes('Available rule files'), 'should mention "Available rule files"');
    assert.ok(text.includes('.md'), 'should contain at least one .md filename');
  });

  it('should use text/markdown mime type', async () => {
    const result = await mock.byUri['ai-rules://list'].handler();
    assert.strictEqual(result.contents[0].mimeType, 'text/markdown');
  });

  it('should use ai-rules://list as uri', async () => {
    const result = await mock.byUri['ai-rules://list'].handler();
    assert.strictEqual(result.contents[0].uri, 'ai-rules://list');
  });
});
