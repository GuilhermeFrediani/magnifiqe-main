/**
 * Handler-level tests for src/skills.js MCP tools.
 * Tests: list_skills, get_skill via createMockServer pattern.
 *
 * Since the project may not have a .claude/skills directory, we create
 * temporary skill fixtures before the suite and clean up after.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { SKILLS_DIR } from '../src/config.js';
import { registerSkillsTools } from '../src/skills.js';
import { rateLimiter } from '../src/rate-limiter.js';

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, desc, schema, handler) => {
        tools[name] = { handler };
      },
    },
    tools,
  };
}

const FIXTURE_SKILLS = [
  {
    dir: 'test-alpha',
    content: '---\nname: test-alpha\ndescription: Alpha test skill\n---\n\n# Alpha\n\nAlpha body content.',
  },
  {
    dir: 'test-beta',
    content: '---\nname: test-beta\ndescription: Beta test skill\ncompatibility: universal\n---\n\n# Beta\n\nBeta body content.',
  },
];

before(() => {
  for (const skill of FIXTURE_SKILLS) {
    const skillDir = join(SKILLS_DIR, skill.dir);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), skill.content, 'utf-8');
  }
});

after(() => {
  for (const skill of FIXTURE_SKILLS) {
    rmSync(join(SKILLS_DIR, skill.dir), { recursive: true, force: true });
  }
});

afterEach(() => {
  rateLimiter.counters = {};
});

describe('list_skills handler', () => {
  const { server, tools } = createMockServer();
  registerSkillsTools(server);

  it('should list available skills with name and description', async () => {
    const result = await tools.list_skills.handler();
    const text = result.content[0].text;

    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(text.includes('test-alpha'), 'should include test-alpha skill');
    assert.ok(text.includes('Alpha test skill'), 'should include alpha description');
    assert.ok(text.includes('test-beta'), 'should include test-beta skill');
    assert.ok(text.includes('Beta test skill'), 'should include beta description');
    assert.ok(text.includes('get_skill'), 'should instruct user to use get_skill');
  });

  it('should include compatibility tag when present', async () => {
    const result = await tools.list_skills.handler();
    const text = result.content[0].text;

    // test-beta has compatibility: universal in frontmatter
    assert.ok(text.includes('[universal]'), 'should display compatibility tag');
  });
});

describe('get_skill handler', () => {
  const { server, tools } = createMockServer();
  registerSkillsTools(server);

  it('should return full content for an existing skill', async () => {
    const result = await tools.get_skill.handler({ name: 'test-alpha' });
    const text = result.content[0].text;

    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(text.includes('Skill: test-alpha'), 'should include skill name header');
    assert.ok(text.includes('Alpha body content'), 'should include SKILL.md body');
  });

  it('should return "Skill not found" for a non-existent skill', async () => {
    const result = await tools.get_skill.handler({ name: 'totally-fake-skill-name' });
    const text = result.content[0].text;

    assert.ok(text.includes('Skill not found'), 'should report skill not found');
    assert.ok(text.includes('totally-fake-skill-name'), 'should echo the requested name');
    assert.ok(text.includes('Available skills'), 'should list available skills');
  });

  it('should sanitize path traversal attempts and return "not found"', async () => {
    // Unix-style traversal: ../../etc/passwd
    // Sanitization strips ".." and "/" chars, collapsing to "etcpasswd" which won't exist
    const result = await tools.get_skill.handler({ name: '../../etc/passwd' });
    const text = result.content[0].text;

    assert.ok(text.includes('Skill not found'), 'should not traverse, should report not found');
    assert.ok(text.includes('Available skills'), 'should list available skills (not-found path)');

    // Windows-style traversal: ..\..\windows\system32
    const resultWin = await tools.get_skill.handler({ name: '..\\..\\windows\\system32' });
    const textWin = resultWin.content[0].text;

    assert.ok(textWin.includes('Skill not found'), 'should block Windows-style traversal');
    assert.ok(textWin.includes('Available skills'), 'should list available skills (not-found path)');
  });
});
