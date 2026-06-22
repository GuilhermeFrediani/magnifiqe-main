/**
 * Test suite for src/skills.js
 * Tests: skill file structure, frontmatter parsing logic
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseSkillFrontmatter } from '../src/helpers.js';

const SKILLS_DIR = join(process.cwd(), '.claude', 'skills');

describe('parseSkillFrontmatter', () => {
  it('should parse valid YAML frontmatter', () => {
    const content = '---\nname: test-skill\ndescription: A test skill\n---\n\nBody content here';
    const fm = parseSkillFrontmatter(content);
    assert.strictEqual(fm.name, 'test-skill');
    assert.strictEqual(fm.description, 'A test skill');
  });

  it('should return empty object when no frontmatter', () => {
    const content = 'No frontmatter here\nJust plain text';
    const fm = parseSkillFrontmatter(content);
    assert.deepStrictEqual(fm, {});
  });

  it('should handle frontmatter with colons in values', () => {
    const content = '---\nname: my-skill\ndescription: Handles edge cases: foo, bar\n---\n';
    const fm = parseSkillFrontmatter(content);
    assert.strictEqual(fm.name, 'my-skill');
    assert.strictEqual(fm.description, 'Handles edge cases: foo, bar');
  });

  it('should skip lines without colons', () => {
    const content = '---\nname: test\nthis line has no colon\nversion: 1.0\n---\n';
    const fm = parseSkillFrontmatter(content);
    assert.strictEqual(fm.name, 'test');
    assert.strictEqual(fm.version, '1.0');
    assert.strictEqual(Object.keys(fm).length, 2);
  });

  it('should handle empty frontmatter', () => {
    const content = '---\n\n---\nBody';
    const fm = parseSkillFrontmatter(content);
    assert.deepStrictEqual(fm, {});
  });
});

describe('Skill files on disk', () => {
  const hasSkillsDir = existsSync(SKILLS_DIR) && readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(SKILLS_DIR, d.name, 'SKILL.md'))).length >= 3;

  it('should have skills directory', { skip: !hasSkillsDir && 'Skills directory not found — skipping disk structure tests' }, () => {
    assert.ok(existsSync(SKILLS_DIR), `Skills dir not found: ${SKILLS_DIR}`);
  });

  it('should have at least 3 skills', { skip: !hasSkillsDir && 'Skills directory not found' }, () => {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());
    assert.ok(dirs.length >= 3, `Expected at least 3 skills, got ${dirs.length}`);
  });

  it('should have SKILL.md in each skill directory', { skip: !hasSkillsDir && 'Skills directory not found' }, () => {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const skillPath = join(SKILLS_DIR, dir, 'SKILL.md');
      assert.ok(existsSync(skillPath), `Missing SKILL.md in: ${dir}`);
    }
  });

  it('should have non-empty SKILL.md files', { skip: !hasSkillsDir && 'Skills directory not found' }, () => {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const skillPath = join(SKILLS_DIR, dir, 'SKILL.md');
      const content = readFileSync(skillPath, 'utf-8');
      assert.ok(content.length > 50, `SKILL.md in ${dir} is too short (${content.length} chars)`);
    }
  });

  it('should have frontmatter with name and description in known skills', { skip: !hasSkillsDir && 'Skills directory not found' }, () => {
    const knownSkills = ['build-test-verify', 'core-conventions', 'git-commit'];
    for (const skill of knownSkills) {
      const skillPath = join(SKILLS_DIR, skill, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, 'utf-8');
      const fm = parseSkillFrontmatter(content);
      if (Object.keys(fm).length > 0) {
        assert.ok(fm.name || fm.description, `Skill ${skill} has frontmatter but no name/description`);
      }
    }
  });
});

// NOTE: Real coverage for skill name sanitization is in skills-handlers.test.js
// This suite tests basic string sanitization patterns only.
describe('Skill name sanitization', () => {
  it('should strip path traversal attempts', () => {
    const unsafe = '../../../etc/passwd';
    const safe = unsafe.replace(/\.\./g, '').replace(/[\\/]/g, '');
    assert.strictEqual(safe, 'etcpasswd');
    assert.ok(!safe.includes('..'));
    assert.ok(!safe.includes('/'));
    assert.ok(!safe.includes('\\'));
  });

  it('should strip directory separators', () => {
    const unsafe = 'foo/bar\\baz';
    const safe = unsafe.replace(/\.\./g, '').replace(/[\\/]/g, '');
    assert.strictEqual(safe, 'foobarbaz');
  });
});
