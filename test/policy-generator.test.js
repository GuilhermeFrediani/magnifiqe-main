/**
 * Test suite for src/policy-generator.js
 * Tests: classification, taxonomy completeness, severity model, policy generation, JSON export, edge cases
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  classifyContent,
  mapToTaxonomy,
  expandDefinition,
  generateCrossCutting,
  generateMarkdownPolicy,
  generateJsonTaxonomy,
  generatePolicy,
  validatePolicy,
  savePolicy,
  TAXONOMY,
  SEVERITY,
  VALID_SEVERITIES,
} from '../src/policy-generator.js';

// ─── Classification Tests ────────────────────────────────────────────────────

describe('classifyContent', () => {
  it('should classify violence-related content', () => {
    const result = classifyContent('This is about violence and assault');
    assert.ok(result.matches.length > 0, 'should find matches');
    assert.strictEqual(result.matches[0].name, 'violence');
  });

  it('should classify hate speech content', () => {
    const result = classifyContent('Content about hate speech targeting minorities');
    assert.ok(result.matches.length > 0, 'should find matches');
    assert.strictEqual(result.matches[0].name, 'hate_speech');
  });

  it('should classify illegal activity', () => {
    const result = classifyContent('Instructions for drug manufacturing and hacking');
    assert.ok(result.matches.length > 0, 'should find matches');
    const names = result.matches.map(m => m.name);
    assert.ok(names.includes('illegal_activity'), 'should include illegal_activity');
  });

  it('should classify child safety content', () => {
    const result = classifyContent('Child exploitation and grooming prevention');
    assert.ok(result.matches.length > 0, 'should find matches');
    assert.strictEqual(result.matches[0].name, 'child_safety');
  });

  it('should classify medical advice content', () => {
    const result = classifyContent('Specific medical diagnosis and prescription advice');
    assert.ok(result.matches.length > 0, 'should find matches');
    assert.strictEqual(result.matches[0].name, 'medical_advice');
  });

  it('should classify financial advice content', () => {
    const result = classifyContent('Investment recommendations and tax strategies');
    assert.ok(result.matches.length > 0, 'should find matches');
    assert.strictEqual(result.matches[0].name, 'financial_advice');
  });

  it('should classify misinformation content', () => {
    const result = classifyContent('Health misinformation and conspiracy theories');
    assert.ok(result.matches.length > 0, 'should find matches');
    assert.strictEqual(result.matches[0].name, 'misinformation');
  });

  it('should return safe for unrelated content', () => {
    const result = classifyContent('Please help me write a function to sort an array');
    assert.strictEqual(result.type, 'safe');
    assert.strictEqual(result.matches.length, 0);
  });

  it('should handle empty content', () => {
    const result = classifyContent('');
    assert.strictEqual(result.type, 'unknown');
    assert.strictEqual(result.category, null);
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result.matches.length, 0);
  });

  it('should handle null content', () => {
    const result = classifyContent(null);
    assert.strictEqual(result.type, 'unknown');
    assert.strictEqual(result.category, null);
  });

  it('should rank matches by score', () => {
    const result = classifyContent('violence and hate speech');
    assert.ok(result.matches.length >= 2, 'should find multiple matches');
    for (let i = 1; i < result.matches.length; i++) {
      assert.ok(result.matches[i - 1].score >= result.matches[i].score, 'should be sorted by score');
    }
  });

  it('should assign confidence between 0 and 1', () => {
    const result = classifyContent('violence');
    assert.ok(result.confidence >= 0 && result.confidence <= 1, 'confidence should be 0-1');
  });
});

// ─── Taxonomy Completeness Tests ─────────────────────────────────────────────

describe('TAXONOMY', () => {
  it('should have 22 or more categories', () => {
    assert.ok(TAXONOMY.length >= 22, `expected 22+ categories, got ${TAXONOMY.length}`);
  });

  it('should have unique names', () => {
    const names = TAXONOMY.map(c => c.name);
    const uniqueNames = new Set(names);
    assert.strictEqual(names.length, uniqueNames.size, 'all category names must be unique');
  });

  it('should have snake_case names', () => {
    for (const cat of TAXONOMY) {
      assert.match(cat.name, /^[a-z][a-z0-9_]*$/, `${cat.name} is not snake_case`);
    }
  });

  it('should have all required fields', () => {
    const requiredFields = ['name', 'display_name', 'definition', 'in_scope', 'out_of_scope', 'severity', 'examples_safe', 'examples_unsafe', 'edge_cases'];
    for (const cat of TAXONOMY) {
      for (const field of requiredFields) {
        assert.ok(cat[field] !== undefined, `${cat.name} missing field: ${field}`);
      }
    }
  });

  it('should have valid severity levels', () => {
    for (const cat of TAXONOMY) {
      assert.ok(VALID_SEVERITIES.includes(cat.severity), `${cat.name} has invalid severity: ${cat.severity}`);
    }
  });

  it('should have non-empty in_scope arrays', () => {
    for (const cat of TAXONOMY) {
      assert.ok(Array.isArray(cat.in_scope), `${cat.name} in_scope is not an array`);
      assert.ok(cat.in_scope.length > 0, `${cat.name} in_scope is empty`);
    }
  });

  it('should have non-empty examples_unsafe arrays', () => {
    for (const cat of TAXONOMY) {
      assert.ok(Array.isArray(cat.examples_unsafe), `${cat.name} examples_unsafe is not an array`);
      assert.ok(cat.examples_unsafe.length > 0, `${cat.name} examples_unsafe is empty`);
    }
  });
});

// ─── Severity Model Tests ────────────────────────────────────────────────────

describe('SEVERITY', () => {
  it('should define S0-S4 levels', () => {
    assert.strictEqual(Object.keys(SEVERITY).length, 5, 'should have 5 severity levels');
    for (let i = 0; i <= 4; i++) {
      assert.ok(SEVERITY[`S${i}`], `missing S${i}`);
    }
  });

  it('should have label and description for each level', () => {
    for (const [level, info] of Object.entries(SEVERITY)) {
      assert.ok(typeof info.label === 'string' && info.label.length > 0, `${level} missing label`);
      assert.ok(typeof info.description === 'string' && info.description.length > 0, `${level} missing description`);
    }
  });

  it('should have VALID_SEVERITIES array matching keys', () => {
    assert.deepStrictEqual(VALID_SEVERITIES, Object.keys(SEVERITY));
  });

  it('should enforce consistent severity across taxonomy', () => {
    // S4 categories should be the most dangerous
    const s4Categories = TAXONOMY.filter(c => c.severity === 'S4');
    assert.ok(s4Categories.length >= 3, 'should have at least 3 S4 categories');
    const s4Names = s4Categories.map(c => c.name);
    assert.ok(s4Names.includes('child_safety'), 'child_safety should be S4');
    assert.ok(s4Names.includes('hate_speech'), 'hate_speech should be S4');
    assert.ok(s4Names.includes('self_harm'), 'self_harm should be S4');
  });

  it('should have S0 as Safe (no restrictions)', () => {
    assert.strictEqual(SEVERITY.S0.label, 'Safe');
    assert.strictEqual(SEVERITY.S0.description, 'No restrictions');
  });

  it('should have S4 as Catastrophic (never allow)', () => {
    assert.strictEqual(SEVERITY.S4.label, 'Catastrophic');
    assert.strictEqual(SEVERITY.S4.description, 'Never allow');
  });
});

// ─── Taxonomy Mapping Tests ──────────────────────────────────────────────────

describe('mapToTaxonomy', () => {
  it('should map violence content', () => {
    const result = mapToTaxonomy('Content about violence and combat');
    assert.ok(result.length > 0);
    assert.strictEqual(result[0].name, 'violence');
  });

  it('should support custom categories', () => {
    const result = mapToTaxonomy('Content about custom_topic', ['custom_topic']);
    assert.ok(result.length > 0);
    assert.strictEqual(result[0].name, 'custom_topic');
    assert.ok(result[0].definition.startsWith('Custom category:'));
  });

  it('should return empty array for null content', () => {
    const result = mapToTaxonomy(null);
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array for empty string', () => {
    const result = mapToTaxonomy('');
    assert.deepStrictEqual(result, []);
  });
});

// ─── Expand Definition Tests ─────────────────────────────────────────────────

describe('expandDefinition', () => {
  it('should expand a valid entry', () => {
    const entry = TAXONOMY[0];
    const result = expandDefinition(entry);
    assert.strictEqual(result.name, entry.name);
    assert.strictEqual(result.severity, entry.severity);
    assert.ok(result.severity_info, 'should have severity_info');
  });

  it('should return null for null input', () => {
    const result = expandDefinition(null);
    assert.strictEqual(result, null);
  });

  it('should fix invalid severity to S1', () => {
    const entry = { ...TAXONOMY[0], severity: 'S99' };
    const result = expandDefinition(entry);
    assert.strictEqual(result.severity, 'S1');
  });
});

// ─── Cross-Cutting Section Tests ─────────────────────────────────────────────

describe('generateCrossCutting', () => {
  it('should generate enforcement actions', () => {
    const result = generateCrossCutting(TAXONOMY[0]);
    assert.ok(result.enforcement, 'should have enforcement');
    assert.ok(Array.isArray(result.enforcement.response_actions), 'should have response_actions');
    assert.ok(typeof result.enforcement.review_required === 'boolean', 'review_required should be boolean');
    assert.ok(typeof result.enforcement.auto_block === 'boolean', 'auto_block should be boolean');
  });

  it('should auto-block S4 categories', () => {
    const s4Cat = TAXONOMY.find(c => c.severity === 'S4');
    const result = generateCrossCutting(s4Cat);
    assert.strictEqual(result.enforcement.auto_block, true);
    assert.strictEqual(result.enforcement.review_required, true);
  });

  it('should not auto-block S0 categories', () => {
    const result = generateCrossCutting({ ...TAXONOMY[0], severity: 'S0' });
    assert.strictEqual(result.enforcement.auto_block, false);
    assert.strictEqual(result.enforcement.review_required, false);
  });

  it('should combine examples correctly', () => {
    const result = generateCrossCutting(TAXONOMY[0]);
    assert.ok(result.examples_combined, 'should have examples_combined');
    assert.deepStrictEqual(result.examples_combined.safe, TAXONOMY[0].examples_safe);
    assert.deepStrictEqual(result.examples_combined.unsafe, TAXONOMY[0].examples_unsafe);
  });
});

// ─── Markdown Policy Generation Tests ────────────────────────────────────────

describe('generateMarkdownPolicy', () => {
  it('should produce valid Markdown', () => {
    const policy = generateMarkdownPolicy(TAXONOMY, 'Test Policy');
    assert.ok(policy.startsWith('# Test Policy'), 'should start with heading');
    assert.ok(policy.includes('## Summary'), 'should have summary section');
    assert.ok(policy.includes('##'), 'should have multiple sections');
    assert.ok(policy.includes('S0') || policy.includes('S1') || policy.includes('S2') || policy.includes('S3') || policy.includes('S4'), 'should mention severity levels');
  });

  it('should handle empty entries', () => {
    const policy = generateMarkdownPolicy([], 'Empty Policy');
    assert.ok(policy.includes('No taxonomy entries provided'));
  });

  it('should include all taxonomy categories', () => {
    const policy = generateMarkdownPolicy(TAXONOMY, 'Full Policy');
    for (const cat of TAXONOMY) {
      assert.ok(policy.includes(`\`${cat.name}\``), `should include ${cat.name}`);
    }
  });

  it('should include severity and enforcement info', () => {
    const policy = generateMarkdownPolicy(TAXONOMY.slice(0, 1), 'Single Category Policy');
    assert.ok(policy.includes('Severity:'), 'should mention severity');
    assert.ok(policy.includes('Enforcement'), 'should mention enforcement');
    assert.ok(policy.includes('Response actions'), 'should mention response actions');
  });
});

// ─── JSON Taxonomy Export Tests ──────────────────────────────────────────────

describe('generateJsonTaxonomy', () => {
  it('should produce valid JSON structure', () => {
    const json = generateJsonTaxonomy(TAXONOMY);
    assert.strictEqual(json.version, '1.0');
    assert.ok(json.generated, 'should have timestamp');
    assert.deepStrictEqual(json.severity_model, SEVERITY);
    assert.strictEqual(json.total_categories, TAXONOMY.length);
  });

  it('should include all categories', () => {
    const json = generateJsonTaxonomy(TAXONOMY);
    assert.strictEqual(json.categories.length, TAXONOMY.length);
    for (const cat of TAXONOMY) {
      const found = json.categories.find(c => c.name === cat.name);
      assert.ok(found, `should include ${cat.name}`);
    }
  });

  it('should handle empty entries', () => {
    const json = generateJsonTaxonomy([]);
    assert.strictEqual(json.categories.length, 0);
    assert.deepStrictEqual(json.severity_model, SEVERITY);
  });

  it('should be JSON-stringifyable', () => {
    const json = generateJsonTaxonomy(TAXONOMY);
    const str = JSON.stringify(json);
    const parsed = JSON.parse(str);
    assert.strictEqual(parsed.version, '1.0');
    assert.strictEqual(parsed.total_categories, TAXONOMY.length);
  });
});

// ─── Full Pipeline Tests ─────────────────────────────────────────────────────

describe('generatePolicy', () => {
  it('should run full pipeline on violence content', () => {
    const result = generatePolicy('Content about violence and assault');
    assert.ok(result.classification, 'should have classification');
    assert.ok(result.taxonomy_count > 0, 'should map to taxonomy');
    assert.ok(typeof result.markdown === 'string', 'should produce markdown');
    assert.ok(result.json_taxonomy, 'should produce JSON taxonomy');
    assert.ok(result.markdown.includes('# Content Safety Policy'), 'markdown should have title');
  });

  it('should handle content with no matches', () => {
    const result = generatePolicy('Hello world');
    assert.strictEqual(result.taxonomy_count, 0);
    assert.ok(result.markdown.includes('No matching taxonomy'));
  });

  it('should accept custom title', () => {
    const result = generatePolicy('violence', { title: 'My Custom Policy' });
    assert.ok(result.markdown.includes('# My Custom Policy'));
  });

  it('should accept custom categories', () => {
    const result = generatePolicy('custom_topic content', { categories: ['custom_topic'] });
    assert.ok(result.taxonomy_count > 0, 'should find custom category');
  });
});

// ─── Policy Validation Tests ─────────────────────────────────────────────────

describe('validatePolicy', () => {
  it('should validate a well-formed policy', () => {
    const policy = generateMarkdownPolicy(TAXONOMY.slice(0, 2), 'Valid Policy');
    const result = validatePolicy(policy);
    assert.strictEqual(result.valid, true, `errors: ${result.errors.join(', ')}`);
    assert.ok(result.severity_levels_found.length > 0, 'should find severity levels');
  });

  it('should reject empty string', () => {
    const result = validatePolicy('');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('should reject null input', () => {
    const result = validatePolicy(null);
    assert.strictEqual(result.valid, false);
  });

  it('should detect missing Summary section', () => {
    const result = validatePolicy('# Bad Policy\n\nNo summary here.\n');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Summary')), 'should mention missing Summary');
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('should handle empty content in classify', () => {
    const result = classifyContent('');
    assert.strictEqual(result.type, 'unknown');
  });

  it('should handle undefined content', () => {
    const result = classifyContent(undefined);
    assert.strictEqual(result.type, 'unknown');
  });

  it('should handle numeric content', () => {
    const result = classifyContent(12345);
    assert.strictEqual(result.type, 'unknown');
  });

  it('should handle unknown categories in mapping', () => {
    const result = mapToTaxonomy('some random content about unicorns and rainbows');
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  it('should handle unknown category in expand', () => {
    const result = expandDefinition({ name: 'unknown', display_name: 'Unknown', definition: 'test', in_scope: [], out_of_scope: [], severity: 'S5', examples_safe: [], examples_unsafe: [], edge_cases: [] });
    assert.strictEqual(result.severity, 'S1', 'should default invalid severity to S1');
  });

  it('should handle very long content', () => {
    const longContent = 'violence '.repeat(10000);
    const result = classifyContent(longContent);
    assert.ok(result.matches.length > 0, 'should still classify long content');
  });

  it('should handle special characters', () => {
    const result = classifyContent('!@#$%^&*()_+<>?:{}|~`');
    assert.strictEqual(result.type, 'safe');
  });

  it('should handle Unicode content', () => {
    const result = classifyContent('こんにちは世界');
    assert.strictEqual(result.type, 'safe');
  });
});

// ─── Save Policy Tests ───────────────────────────────────────────────────────

describe('savePolicy', () => {
  it('should save policy to file', async () => {
    const content = '# Test Policy\n\nTest content.\n';
    const result = await savePolicy('/tmp/test-policy-output.md', content);
    assert.strictEqual(result.success, true);
    assert.ok(result.bytes > 0);
  });

  it('should handle invalid path gracefully', async () => {
    const result = await savePolicy('/nonexistent/deeply/nested/path/policy.md', 'test');
    // On CI, writing to /nonexistent may fail (permissions). Accept either outcome.
    assert.strictEqual(typeof result.success, 'boolean');
    assert.ok(result.path);
    if (result.success) {
      assert.ok(result.bytes > 0);
    } else {
      assert.ok(result.error);
    }
  });
});
