/**
 * Handler-level tests for src/validators.js tools.
 * Uses createMockServer pattern — invokes handlers directly via mock registration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerValidatorsTools } from '../src/validators.js';

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

function mockText(result) {
  return result?.content?.[0]?.text || '';
}

const tempRoots = [];

function makeTempDir(prefix = 'validators-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function cleanup() {
  while (tempRoots.length) {
    rmSync(tempRoots.pop(), { recursive: 'force', force: true });
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

describe('validators tool registration', () => {
  it('should register all five tools', () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);
    assert.ok(tools.validate_bad_code, 'validate_bad_code registered');
    assert.ok(tools.validate_response_style, 'validate_response_style registered');
    assert.ok(tools.validate_git_commit, 'validate_git_commit registered');
    assert.ok(tools.dependency_validate, 'dependency_validate registered');
    assert.ok(tools.detect_typosquat, 'detect_typosquat registered');
  });

  it('each handler should be a function', () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);
    for (const [name, tool] of Object.entries(tools)) {
      assert.strictEqual(typeof tool.handler, 'function', `${name} handler is a function`);
    }
  });
});

// ─── validate_bad_code ────────────────────────────────────────────────────────

describe('validate_bad_code', () => {
  it('should PASS for clean JavaScript code with no bad patterns', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const code = `
function greet(name) {
  const msg = "Hello, " + name;
  return msg;
}
export { greet };
`;
    const result = await tools.validate_bad_code.handler({ code });
    const text = mockText(result);

    assert.ok(text.includes('RISK SCORE:'), 'contains risk score');
    assert.ok(text.includes('PASS'), 'verdict is PASS');
    assert.ok(text.includes('BLOCKERS: none'), 'no blockers');
  });

  it('should HALT for TypeScript code containing the any keyword', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const code = `
function parse(data: any): any {
  return JSON.parse(data);
}
`;
    const result = await tools.validate_bad_code.handler({
      code,
      file_path: '/src/parser.ts',
    });
    const text = mockText(result);

    assert.ok(text.includes('HALT'), 'verdict is HALT');
    assert.ok(text.includes('any'), 'reports any usage');
  });

  it('should HALT for code with an empty catch block', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const code = `
try {
  doWork();
} catch (err) {
}
`;
    const result = await tools.validate_bad_code.handler({ code });
    const text = mockText(result);

    assert.ok(text.includes('HALT'), 'verdict is HALT');
    assert.ok(text.includes('empty-catch'), 'reports empty-catch');
  });
});

// ─── validate_response_style ──────────────────────────────────────────────────

describe('validate_response_style', () => {
  it('should PASS for clean, concise text', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const text = 'The function returns a boolean indicating success.';
    const result = await tools.validate_response_style.handler({
      text,
      mode: 'adaptive',
    });
    const out = mockText(result);

    assert.ok(out.includes('STYLE CHECK: PASS'), 'verdict is PASS');
  });

  it('should HALT when text contains hesitation tokens', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const text = 'Hmm, I think the solution is to update the config file.';
    const result = await tools.validate_response_style.handler({
      text,
      mode: 'adaptive',
    });
    const out = mockText(result);

    assert.ok(out.includes('HALT'), 'verdict is HALT');
    assert.ok(out.includes('hesitation'), 'reports hesitation blocker');
  });

  it('should HALT when text contains process commentary', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const text = 'Let me think about the best approach here and I will analyze the options.';
    const result = await tools.validate_response_style.handler({
      text,
      mode: 'adaptive',
    });
    const out = mockText(result);

    assert.ok(out.includes('HALT'), 'verdict is HALT');
    assert.ok(out.includes('process-commentary') || out.includes('hesitation'), 'reports process commentary or hesitation');
  });
});

// ─── validate_git_commit ──────────────────────────────────────────────────────

describe('validate_git_commit', () => {
  it('should PASS for a valid conventional commit without scope', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const result = await tools.validate_git_commit.handler({
      message: 'feat: add user authentication',
    });
    const text = mockText(result);

    assert.ok(text.startsWith('PASS'), 'valid commit is PASS');
  });

  it('should PASS for a valid conventional commit with scope', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const result = await tools.validate_git_commit.handler({
      message: 'fix(auth): repair expired token refresh',
    });
    const text = mockText(result);

    assert.ok(text.startsWith('PASS'), 'scoped commit is PASS');
  });

  it('should HALT for a commit missing the type prefix', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const result = await tools.validate_git_commit.handler({
      message: 'added new feature',
    });
    const text = mockText(result);

    assert.ok(text.startsWith('HALT'), 'missing type prefix is HALT');
    assert.ok(text.includes('Invalid format'), 'error message present');
  });
});

// ─── dependency_validate ──────────────────────────────────────────────────────

describe('dependency_validate', () => {
  it('should HALT for a non-existent file', async () => {
    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const result = await tools.dependency_validate.handler({
      file_path: '/nonexistent/path/does/not/exist.js',
    });
    const text = mockText(result);

    assert.ok(text.startsWith('HALT'), 'non-existent file is HALT');
    assert.ok(text.includes('does not exist'), 'error mentions missing file');
  });

  it('should PASS for a file with only Node built-in imports', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'valid.js');
    writeFileSync(filePath, 'import { join } from "path";\nconst p = join("a", "b");\nexport { p };\n');

    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const result = await tools.dependency_validate.handler({ file_path: filePath });
    const text = mockText(result);

    assert.ok(text.startsWith('PASS'), 'built-in imports resolve as PASS');
  });

  it('should HALT for a file with a hallucinated relative import', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'broken.js');
    writeFileSync(filePath, 'import { helper } from "./nonexistent-module.js";\nconsole.log(helper);\n');

    const { server, tools } = createMockServer();
    registerValidatorsTools(server);

    const result = await tools.dependency_validate.handler({ file_path: filePath });
    const text = mockText(result);

    assert.ok(text.startsWith('HALT'), 'missing import is HALT');
    assert.ok(text.includes('missing reference') || text.includes('missing'), 'reports missing references');
  });
});
