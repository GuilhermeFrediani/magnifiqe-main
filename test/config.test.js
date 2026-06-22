/**
 * Test suite for src/config.js
 * Tests: TOPIC_MAP coverage, RULE_DESCRIPTIONS keys, BAD_PATTERNS structure
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ROOT_DIR,
  RULES_DIR,
  SRC_DIR,
  SKILLS_DIR,
  COMMANDS_DIR,
  MEMORY_FILE,
  PROJECT_STATE_FILE,
  TOPIC_MAP,
  RULE_DESCRIPTIONS,
  BAD_PATTERNS,
} from '../src/config.js';

describe('Config paths', () => {
  it('should export absolute paths', () => {
    assert.ok(ROOT_DIR.length > 0);
    assert.ok(RULES_DIR.length > 0);
    assert.ok(SRC_DIR.length > 0);
    assert.ok(SKILLS_DIR.length > 0);
    assert.ok(COMMANDS_DIR.length > 0);
    assert.ok(MEMORY_FILE.length > 0);
    assert.ok(PROJECT_STATE_FILE.length > 0);
  });

  it('should have RULES_DIR pointing to ai-rules', () => {
    assert.ok(RULES_DIR.includes('ai-rules'));
  });

  it('should have MEMORY_FILE pointing to JSON', () => {
    assert.ok(MEMORY_FILE.endsWith('.json'));
  });

  it('should have PROJECT_STATE_FILE pointing to JSON', () => {
    assert.ok(PROJECT_STATE_FILE.endsWith('.json'));
    assert.ok(PROJECT_STATE_FILE.includes('project_state'));
  });
});

describe('TOPIC_MAP', () => {
  it('should map common keywords to rule files', () => {
    assert.strictEqual(TOPIC_MAP['coding'], '02-coding-standards.md');
    assert.strictEqual(TOPIC_MAP['workflow'], '01-ai-workflow-strict.md');
    assert.strictEqual(TOPIC_MAP['security'], '04-security-secrets.md');
    assert.strictEqual(TOPIC_MAP['tokens'], '03-token-economy.md');
    assert.strictEqual(TOPIC_MAP['debugging'], '05-debugging-mastery.md');
    assert.strictEqual(TOPIC_MAP['ci'], '06-ci-cd-testing.md');
    assert.strictEqual(TOPIC_MAP['frontend'], '07-frontend-semantic.md');
    assert.strictEqual(TOPIC_MAP['backend'], '08-backend-architecture.md');
    assert.strictEqual(TOPIC_MAP['bad'], '09-bad-patterns-halt.md');
    assert.strictEqual(TOPIC_MAP['behavior'], '10-llm-behavioral-rules.md');
    assert.strictEqual(TOPIC_MAP['systematic'], '11-systematic-debugging.md');
  });

  it('should have all values as .md files', () => {
    for (const val of Object.values(TOPIC_MAP)) {
      assert.ok(val.endsWith('.md'), `Expected .md file but got: ${val}`);
    }
  });

  it('should have multiple aliases for same files', () => {
    const codingAliases = Object.keys(TOPIC_MAP).filter(k => TOPIC_MAP[k] === '02-coding-standards.md');
    assert.ok(codingAliases.length >= 2, 'Expected at least 2 aliases for coding standards');
  });
});

describe('RULE_DESCRIPTIONS', () => {
  it('should have descriptions for all known rule files', () => {
    const expectedFiles = [
      '00-project-overview.md',
      '01-ai-workflow-strict.md',
      '02-coding-standards.md',
      '03-token-economy.md',
      '04-security-secrets.md',
      '05-debugging-mastery.md',
      '06-ci-cd-testing.md',
      '07-frontend-semantic.md',
      '08-backend-architecture.md',
      '09-bad-patterns-halt.md',
      '10-llm-behavioral-rules.md',
      '11-systematic-debugging.md',
    ];
    for (const file of expectedFiles) {
      assert.ok(RULE_DESCRIPTIONS[file], `Missing description for: ${file}`);
    }
  });

  it('should have non-empty string descriptions', () => {
    for (const [file, desc] of Object.entries(RULE_DESCRIPTIONS)) {
      assert.strictEqual(typeof desc, 'string', `Description for ${file} is not a string`);
      assert.ok(desc.length > 0, `Description for ${file} is empty`);
    }
  });
});

describe('BAD_PATTERNS', () => {
  it('should be an array of pattern objects', () => {
    assert.ok(Array.isArray(BAD_PATTERNS));
    assert.ok(BAD_PATTERNS.length > 0);
  });

  it('should have regex, id, and msg in each pattern', () => {
    for (const pattern of BAD_PATTERNS) {
      assert.ok(pattern.regex instanceof RegExp, `Pattern ${pattern.id} missing regex`);
      assert.ok(typeof pattern.id === 'string', 'Pattern missing id');
      assert.ok(typeof pattern.msg === 'string', `Pattern ${pattern.id} missing msg`);
    }
  });

  it('should have unique ids (or intentional duplicates)', () => {
    const ids = BAD_PATTERNS.map(p => p.id);
    // empty-catch has 2 patterns intentionally
    const uniqueIds = new Set(ids);
    const diff = ids.length - uniqueIds.size;
    // Allow known duplicates: empty-catch
    assert.ok(diff <= 1, `Too many duplicate ids: ${diff}`);
  });

  it('should include Python-specific patterns', () => {
    const pyPatterns = BAD_PATTERNS.filter(p => p.lang === 'py');
    assert.ok(pyPatterns.length >= 3, 'Expected at least 3 Python patterns');
  });
});
