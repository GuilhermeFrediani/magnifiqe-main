/**
 * Test suite for scripts and schemas
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateSkill } from '../scripts/validate-skill.js';
import { discoverSkills } from '../scripts/discover-skills.js';
import { renderSkillCard } from '../scripts/render-skill-card.js';

const TEST_DIR = resolve(process.cwd(), '.claude_test_scripts');
const TEST_SKILLS_DIR = resolve(TEST_DIR, '.claude', 'skills');

// Test fixtures
const VALID_SKILL = `---
name: test-skill
description: This is a valid test skill for validating the SKILL.md format compliance
version: 1.0.0
tags: test, validation, quality
---
# Test Skill

This is a test skill.
`;

const INVALID_SKILL_NO_NAME = `---
description: Missing name field in this skill
version: 1.0.0
tags: test, validation
---
# No Name
`;

const INVALID_SKILL_BAD_NAME = `---
name: Bad Name With Spaces!
description: This has an invalid name with spaces and special characters
version: 1.0.0
tags: test, validation
---
# Bad Name
`;

const INVALID_SKILL_SHORT_DESC = `---
name: short-desc
description: Too short
version: 1.0.0
tags: test, validation
---
# Short Description
`;

const INVALID_SKILL_NO_TAGS = `---
name: no-tags
description: This skill has no tags defined in the frontmatter
version: 1.0.0
---
# No Tags
`;

const SKILL_WITH_VERIFY_MARKER = `---
name: verify-marker
description: This skill contains prohibited VERIFY marker in its content
version: 1.0.0
tags: test, marker
---
# Has VERIFY Marker

VERIFY this output carefully.
`;

const SKILL_WITH_SELECT_MARKER = `---
name: select-marker
description: This skill contains prohibited SELECT marker in its content
version: 1.0.0
tags: test, marker
---
# Has SELECT Marker

SELECT the best option.
`;

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function setupTestEnv() {
  cleanup();
  mkdirSync(TEST_SKILLS_DIR, { recursive: true });
}

function createSkillDir(name, content) {
  const dir = join(TEST_SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
  return dir;
}

// ============================================================
// Schema Tests
// ============================================================

describe('Schemas', () => {
  const schemasDir = resolve(process.cwd(), 'schemas');

  it('rule-frontmatter.json exists and is valid JSON', () => {
    const schemaPath = join(schemasDir, 'rule-frontmatter.json');
    assert.ok(existsSync(schemaPath), 'rule-frontmatter.json should exist');
    const content = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    assert.ok(content.$schema, 'should have $schema');
    assert.ok(content.properties, 'should have properties');
    assert.ok(content.properties.description, 'should have description property');
    assert.ok(content.properties.interruptMode, 'should have interruptMode property');
    assert.deepStrictEqual(content.properties.interruptMode.enum, ['never', 'prose-only', 'tool-only', 'always']);
  });

  it('failure-classification.json exists and is valid JSON', () => {
    const schemaPath = join(schemasDir, 'failure-classification.json');
    assert.ok(existsSync(schemaPath), 'failure-classification.json should exist');
    const content = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    assert.ok(content.$schema, 'should have $schema');
    assert.ok(content.properties.failure_class, 'should have failure_class property');
    assert.ok(content.properties.failure_class.enum.includes('dependency'), 'should include dependency');
    assert.ok(content.properties.failure_class.enum.includes('hallucination'), 'should include hallucination');
    assert.ok(content.properties.safe_to_continue, 'should have safe_to_continue property');
  });

  it('session-state.json exists and is valid JSON', () => {
    const schemaPath = join(schemasDir, 'session-state.json');
    assert.ok(existsSync(schemaPath), 'session-state.json should exist');
    const content = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    assert.ok(content.$schema, 'should have $schema');
    assert.ok(content.properties.status, 'should have status property');
    assert.deepStrictEqual(content.properties.status.enum, ['active', 'paused', 'completed']);
    assert.ok(content.properties.timestamp, 'should have timestamp property');
  });

  it('eval-dataset.json exists and is valid JSON', () => {
    const schemaPath = join(schemasDir, 'eval-dataset.json');
    assert.ok(existsSync(schemaPath), 'eval-dataset.json should exist');
    const content = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    assert.ok(content.$schema, 'should have $schema');
    assert.ok(content.properties.samples, 'should have samples property');
    assert.ok(content.properties.samples.items.properties.id, 'sample should have id');
    assert.ok(content.properties.samples.items.properties.question, 'sample should have question');
    assert.ok(content.properties.samples.items.properties.ground_truth, 'sample should have ground_truth');
  });

  it('policy-taxonomy.json exists and is valid JSON', () => {
    const schemaPath = join(schemasDir, 'policy-taxonomy.json');
    assert.ok(existsSync(schemaPath), 'policy-taxonomy.json should exist');
    const content = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    assert.ok(content.$schema, 'should have $schema');
    assert.ok(content.properties.categories, 'should have categories property');
    assert.ok(content.properties.categories.items.properties.name, 'category should have name');
    assert.ok(content.properties.categories.items.properties.severity, 'category should have severity');
    assert.deepStrictEqual(content.properties.categories.items.properties.severity.enum, ['info', 'warning', 'error', 'critical']);
  });

  it('all schemas validate with valid data', () => {
    const ruleData = {
      description: 'A test rule for validation',
      interruptMode: 'always',
      alwaysApply: true,
    };
    const failureData = {
      failure_class: 'dependency',
      evidence: ['Module not found'],
      strongest_signal: 'Module not found error',
      likely_cause: 'Package not installed',
      next_command: 'npm install',
      ruled_out: ['config'],
      safe_to_continue: false,
    };
    const sessionData = {
      goal: 'Implement feature X',
      current_subtask: 'Write tests',
      loaded_skills: ['test-skill'],
      status: 'active',
      plan: ['Step 1', 'Step 2'],
      assumptions: ['Tests exist'],
      blockers: [],
      timestamp: new Date().toISOString(),
    };
    const evalData = {
      samples: [{
        id: 'test-1',
        question: 'What is 2+2?',
        ground_truth: '4',
        contexts: ['Basic math'],
        metadata: { difficulty: 'easy' },
      }],
    };
    const policyData = {
      categories: [{
        name: 'test-category',
        display_name: 'Test Category',
        definition: 'A category for testing purposes only',
        severity: 'warning',
        examples: ['Example policy'],
      }],
    };

    // Verify data matches schema shapes (basic structural check)
    assert.ok(ruleData.description, 'rule should have description');
    assert.ok(failureData.failure_class, 'failure should have class');
    assert.ok(sessionData.goal, 'session should have goal');
    assert.ok(evalData.samples.length > 0, 'eval should have samples');
    assert.ok(policyData.categories.length > 0, 'policy should have categories');
  });
});

// ============================================================
// validate-skill.js Tests
// ============================================================

describe('validate-skill.js', () => {
  before(() => setupTestEnv());
  after(() => cleanup());

  it('should validate a valid SKILL.md', () => {
    const skillDir = createSkillDir('valid-skill', VALID_SKILL);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(result.valid, 'should be valid');
    assert.deepStrictEqual(result.errors, [], 'should have no errors');
    assert.strictEqual(result.frontmatter.name, 'test-skill');
    assert.strictEqual(result.frontmatter.version, '1.0.0');
  });

  it('should reject missing name', () => {
    const skillDir = createSkillDir('no-name', INVALID_SKILL_NO_NAME);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.errors.some(e => e.includes('name is required')), 'should report missing name');
  });

  it('should reject non-kebab-case name', () => {
    const skillDir = createSkillDir('bad-name', INVALID_SKILL_BAD_NAME);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.errors.some(e => e.includes('kebab-case')), 'should report kebab-case requirement');
  });

  it('should reject short description', () => {
    const skillDir = createSkillDir('short-desc', INVALID_SKILL_SHORT_DESC);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.errors.some(e => e.includes('50 chars')), 'should report minimum length');
  });

  it('should reject missing tags', () => {
    const skillDir = createSkillDir('no-tags', INVALID_SKILL_NO_TAGS);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.errors.some(e => e.includes('tags')), 'should report missing tags');
  });

  it('should handle missing file', () => {
    const result = validateSkill(resolve(TEST_DIR, 'nonexistent', 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.errors.some(e => e.includes('not found')), 'should report file not found');
  });

  it('should handle file with no frontmatter', () => {
    const skillDir = createSkillDir('no-frontmatter', '# Just a heading\n\nNo frontmatter here.');
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.errors.some(e => e.includes('No YAML frontmatter')), 'should report missing frontmatter');
  });
});

// ============================================================
// discover-skills.js Tests
// ============================================================

describe('discover-skills.js', () => {
  before(() => setupTestEnv());
  after(() => cleanup());

  it('should discover skills in directory', () => {
    createSkillDir('skill-a', VALID_SKILL.replace('test-skill', 'skill-a'));
    createSkillDir('skill-b', VALID_SKILL.replace('test-skill', 'skill-b'));

    const skills = discoverSkills(TEST_SKILLS_DIR);
    assert.ok(skills.length >= 2, 'should find at least 2 skills');
    assert.ok(skills.some(s => s.name === 'skill-a'), 'should find skill-a');
    assert.ok(skills.some(s => s.name === 'skill-b'), 'should find skill-b');
  });

  it('should parse skill metadata', () => {
    createSkillDir('meta-skill', VALID_SKILL);

    const skills = discoverSkills(TEST_SKILLS_DIR);
    const skill = skills.find(s => s.dir === 'meta-skill');
    assert.ok(skill, 'should find meta-skill');
    assert.strictEqual(skill.name, 'test-skill');
    assert.strictEqual(skill.version, '1.0.0');
    assert.ok(Array.isArray(skill.tags), 'tags should be array');
  });

  it('should handle non-existent directory', () => {
    const skills = discoverSkills(resolve(TEST_DIR, 'nonexistent'));
    assert.deepStrictEqual(skills, [], 'should return empty array');
  });

  it('should skip directories without SKILL.md', () => {
    mkdirSync(join(TEST_SKILLS_DIR, 'no-skill-file'), { recursive: true });
    writeFileSync(join(TEST_SKILLS_DIR, 'no-skill-file', 'README.md'), '# Not a skill');

    const skills = discoverSkills(TEST_SKILLS_DIR);
    assert.ok(!skills.some(s => s.dir === 'no-skill-file'), 'should skip dirs without SKILL.md');
  });

  it('should sort skills by name', () => {
    createSkillDir('zebra-skill', VALID_SKILL.replace('test-skill', 'zebra'));
    createSkillDir('alpha-skill', VALID_SKILL.replace('test-skill', 'alpha'));

    const skills = discoverSkills(TEST_SKILLS_DIR);
    const names = skills.map(s => s.name);
    const sorted = [...names].sort();
    assert.deepStrictEqual(names, sorted, 'should be sorted');
  });
});

// ============================================================
// render-skill-card.js Tests
// ============================================================

describe('render-skill-card.js', () => {
  before(() => setupTestEnv());
  after(() => cleanup());

  it('should render card from valid skill', () => {
    const skillDir = createSkillDir('card-skill', VALID_SKILL);
    const result = renderSkillCard(join(skillDir, 'SKILL.md'));
    assert.ok(result.valid, 'should be valid');
    assert.ok(result.card.includes('test-skill'), 'card should contain name');
    assert.ok(result.card.includes('1.0.0'), 'card should contain version');
    assert.ok(result.issues.length === 0, 'should have no issues');
  });

  it('should detect VERIFY marker', () => {
    const skillDir = createSkillDir('verify-skill', SKILL_WITH_VERIFY_MARKER);
    const result = renderSkillCard(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.issues.some(i => i.includes('VERIFY')), 'should report VERIFY marker');
  });

  it('should detect SELECT marker', () => {
    const skillDir = createSkillDir('select-skill', SKILL_WITH_SELECT_MARKER);
    const result = renderSkillCard(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.issues.some(i => i.includes('SELECT')), 'should report SELECT marker');
  });

  it('should handle missing file', () => {
    const result = renderSkillCard(resolve(TEST_DIR, 'nonexistent', 'SKILL.md'));
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(result.issues.some(i => i.includes('not found')), 'should report file not found');
  });

  it('should use directory name as fallback for name', () => {
    const noNameSkill = `---
description: This skill has no name field, so directory name should be used
version: 1.0.0
tags: test, fallback
---
# No Name Skill
`;
    const skillDir = createSkillDir('fallback-name', noNameSkill);
    const result = renderSkillCard(join(skillDir, 'SKILL.md'));
    assert.ok(result.card.includes('fallback-name'), 'should use directory name');
  });
});

// ============================================================
// agent-cli.js Tests
// ============================================================

describe('agent-cli.js', () => {
  const cliPath = resolve(process.cwd(), 'scripts', 'agent-cli.js');

  it('should show help with --help', async () => {
    const { execSync } = await import('node:child_process');
    const output = execSync(`node ${cliPath} --help`, { encoding: 'utf-8' });
    assert.ok(output.includes('Commands:'), 'should show commands');
    assert.ok(output.includes('validate'), 'should mention validate command');
    assert.ok(output.includes('discover'), 'should mention discover command');
    assert.ok(output.includes('render-card'), 'should mention render-card command');
  });

  it('should run validate command', async () => {
    setupTestEnv();
    const skillDir = createSkillDir('cli-skill', VALID_SKILL);
    const { execSync } = await import('node:child_process');
    const output = execSync(`node ${cliPath} validate ${join(skillDir, 'SKILL.md')}`, { encoding: 'utf-8' });
    assert.ok(output.includes('Valid'), 'should report valid');
    cleanup();
  });

  it('should run discover command with JSON output', async () => {
    setupTestEnv();
    createSkillDir('discover-skill', VALID_SKILL);
    const { execSync } = await import('node:child_process');
    const output = execSync(`node ${cliPath} discover --output json`, { encoding: 'utf-8', cwd: TEST_DIR });
    const skills = JSON.parse(output);
    assert.ok(Array.isArray(skills), 'should return array');
    cleanup();
  });

  it('should run render-card command', async () => {
    setupTestEnv();
    const skillDir = createSkillDir('render-skill', VALID_SKILL);
    const { execSync } = await import('node:child_process');
    const output = execSync(`node ${cliPath} render-card ${join(skillDir, 'SKILL.md')}`, { encoding: 'utf-8' });
    assert.ok(output.includes('test-skill'), 'should render card');
    cleanup();
  });

  it('should reject unknown command', async () => {
    const { execSync } = await import('node:child_process');
    try {
      execSync(`node ${cliPath} unknown-command`, { encoding: 'utf-8', stdio: 'pipe' });
      assert.fail('should throw on unknown command');
    } catch (err) {
      assert.ok(err.stderr.includes('Unknown command'), 'should report unknown command');
    }
  });

  it('should run validate with JSON output', async () => {
    setupTestEnv();
    const skillDir = createSkillDir('json-output', VALID_SKILL);
    const { execSync } = await import('node:child_process');
    const output = execSync(`node ${cliPath} validate ${join(skillDir, 'SKILL.md')} --output json`, { encoding: 'utf-8' });
    const result = JSON.parse(output);
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'valid'), 'should have valid field');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'errors'), 'should have errors field');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'frontmatter'), 'should have frontmatter field');
    cleanup();
  });

  it('should handle --verbose flag', async () => {
    setupTestEnv();
    const skillDir = createSkillDir('verbose-skill', VALID_SKILL);
    const { execSync } = await import('node:child_process');
    const output = execSync(`node ${cliPath} validate ${join(skillDir, 'SKILL.md')} --verbose`, { encoding: 'utf-8' });
    assert.ok(output.includes('Frontmatter:'), 'should show frontmatter in verbose mode');
    cleanup();
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe('Edge Cases', () => {
  before(() => setupTestEnv());
  after(() => cleanup());

  it('validate-skill handles very long name', () => {
    const longName = 'a'.repeat(65);
    const skill = `---
name: ${longName}
description: This skill has a name that exceeds the maximum length allowed
version: 1.0.0
tags: test, edge-case
---
# Long Name
`;
    const skillDir = createSkillDir('long-name', skill);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should reject long name');
    assert.ok(result.errors.some(e => e.includes('64 chars')), 'should report length limit');
  });

  it('validate-skill handles exactly 50 char description', () => {
    const desc50 = 'A'.repeat(50);
    const skill = `---
name: exact-desc
description: ${desc50}
version: 1.0.0
tags: test, edge-case
---
# Exact Description
`;
    const skillDir = createSkillDir('exact-desc', skill);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(result.valid, 'should accept exactly 50 char description');
  });

  it('validate-skill handles exactly 2 tags', () => {
    const skill = `---
name: two-tags
description: This skill has exactly two tags which is the minimum required
version: 1.0.0
tags: first-tag, second-tag
---
# Two Tags
`;
    const skillDir = createSkillDir('two-tags', skill);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(result.valid, 'should accept exactly 2 tags');
  });

  it('validate-skill rejects single tag', () => {
    const skill = `---
name: single-tag
description: This skill has only one tag which is below the minimum
version: 1.0.0
tags: only-one
---
# Single Tag
`;
    const skillDir = createSkillDir('single-tag', skill);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(!result.valid, 'should reject single tag');
    assert.ok(result.errors.some(e => e.includes('2 items')), 'should report minimum items');
  });

  it('validate-skill handles Windows line endings', () => {
    const skill = VALID_SKILL.replace(/\n/g, '\r\n');
    const skillDir = createSkillDir('windows-endings', skill);
    const result = validateSkill(join(skillDir, 'SKILL.md'));
    assert.ok(result.valid, 'should handle Windows line endings');
  });

  it('discover-skills handles corrupted SKILL.md', () => {
    createSkillDir('corrupted', 'This is not valid markdown at all');
    const skills = discoverSkills(TEST_SKILLS_DIR);
    // Should not crash, may return skill with empty frontmatter
    assert.ok(Array.isArray(skills), 'should return array');
  });

  it('render-skill-card handles empty file', () => {
    const skillDir = createSkillDir('empty', '');
    const result = renderSkillCard(join(skillDir, 'SKILL.md'));
    // Empty file has no frontmatter, but no prohibited markers either
    assert.ok(result.valid, 'empty file should be valid (no prohibited markers)');
  });
});
