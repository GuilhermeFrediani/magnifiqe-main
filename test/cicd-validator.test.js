/**
 * Tests for CI/CD Configuration Validator
 * Validates GitHub Actions, GitLab CI, and general CI/CD patterns.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateCICDConfig, registerCICDValidator } from '../src/cicd-validator.js';

const tempRoots = [];

function makeTempDir(prefix = 'cicd-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function cleanup() {
  while (tempRoots.length) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
}

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

// ─── Test fixtures ───────────────────────────────────────────────────────────

const GITHUB_ACTIONS_SHA_PINNED = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a12a133b65f1143b1d116a08d4f8d62666223a18
      - uses: actions/setup-node@56b3bdfe4d506263e311e6f07526863c469071c6
        with:
          node-version: '20'
      - run: npm test
`;

const GITHUB_ACTIONS_NO_SHA = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm test
`;

const GITHUB_ACTIONS_SCRIPT_INJECTION = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "PR title: \${{ github.event.pull_request.title }}"
`;

const GITHUB_ACTIONS_TOKEN_EXPOSURE = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Token: $GITHUB_TOKEN"
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

const GITLAB_CI_PLAIN_SECRETS = `
stages:
  - build

variables:
  DATABASE_PASSWORD: supersecret123!
  API_KEY: abcdef1234567890abcdef

build:
  stage: build
  image: node:20
  script:
    - npm run build
`;

const GITLAB_CI_PINNED_IMAGE = `
stages:
  - build

build:
  stage: build
  image: node@sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
  script:
    - npm run build
`;

const CURL_BASH_PATTERN = `
#!/bin/bash
curl -sSL https://example.com/install.sh | bash
npm install
`;

const WGET_SH_PATTERN = `
#!/bin/bash
wget -qO- https://example.com/setup.sh | sh
echo "Done"
`;

const CHMOD_777_PATTERN = `
#!/bin/bash
chmod 777 /var/www/html
cp build/* /var/www/html/
`;

const HARDCODED_CREDENTIALS = `
database:
  host: localhost
  password: "mysecretpassword123"
  port: 5432
`;

const VALID_CONFIG = `
name: Production Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@a12a133b65f1143b1d116a08d4f8d62666223a18
      - run: npm ci
      - run: npm test
      - name: Deploy
        run: echo "Deploying"
        env:
          DEPLOY_KEY: \${{ secrets.DEPLOY_KEY }}
`;

// ─── Registration tests ──────────────────────────────────────────────────────

describe('cicd-validator tool registration', () => {
  it('registers validate_cicd_config tool', () => {
    const { server, tools } = createMockServer();
    registerCICDValidator(server);
    assert.ok(tools.validate_cicd_config, 'Tool should be registered');
    assert.ok(tools.validate_cicd_config.handler, 'Handler should exist');
  });
});

// ─── GitHub Actions tests ────────────────────────────────────────────────────

describe('GitHub Actions validation', () => {
  let tempDir;
  
  before(() => { tempDir = makeTempDir('github-sha-'); });
  after(cleanup);
  
  it('PASS when all actions use SHA pinning', () => {
    const file = join(tempDir, 'sha-pinned.yml');
    writeFileSync(file, GITHUB_ACTIONS_SHA_PINNED);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'PASS');
    assert.strictEqual(result.platform, 'github-actions');
    assert.strictEqual(result.summary.critical, 0);
  });
  
  it('WARN when actions use tag references', () => {
    const file = join(tempDir, 'no-sha.yml');
    writeFileSync(file, GITHUB_ACTIONS_NO_SHA);
    const result = validateCICDConfig(file);
    assert.ok(['WARN', 'HALT'].includes(result.verdict));
    const shaIssues = result.issues.filter(i => i.rule === 'SHA_PINNING');
    assert.ok(shaIssues.length > 0, 'Should report SHA_PINNING issues');
  });
  
  it('HALT on script injection', () => {
    const file = join(tempDir, 'injection.yml');
    writeFileSync(file, GITHUB_ACTIONS_SCRIPT_INJECTION);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'HALT');
    const injectionIssues = result.issues.filter(i => i.rule === 'SCRIPT_INJECTION');
    assert.ok(injectionIssues.length > 0, 'Should report SCRIPT_INJECTION');
  });
  
  it('detects GitHub Actions from content', () => {
    const file = join(tempDir, 'detected.yml');
    writeFileSync(file, GITHUB_ACTIONS_NO_SHA);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.platform, 'github-actions');
  });
});

// ─── GitLab CI tests ─────────────────────────────────────────────────────────

describe('GitLab CI validation', () => {
  let tempDir;
  
  before(() => { tempDir = makeTempDir('gitlab-ci-'); });
  after(cleanup);
  
  it('HALT when secrets are in plain text', () => {
    const file = join(tempDir, '.gitlab-ci.yml');
    writeFileSync(file, GITLAB_CI_PLAIN_SECRETS);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'HALT');
    assert.strictEqual(result.platform, 'gitlab-ci');
    const secretIssues = result.issues.filter(i => i.rule === 'PLAIN_SECRETS');
    assert.ok(secretIssues.length > 0, 'Should report PLAIN_SECRETS');
  });
  
  it('PASS with properly pinned image', () => {
    const file = join(tempDir, 'pinned-ci.yml');
    writeFileSync(file, GITLAB_CI_PINNED_IMAGE);
    const result = validateCICDConfig(file);
    assert.ok(['PASS', 'WARN'].includes(result.verdict));
  });
  
  it('detects GitLab CI from content', () => {
    const file = join(tempDir, 'detected-ci.yml');
    writeFileSync(file, GITLAB_CI_PINNED_IMAGE);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.platform, 'gitlab-ci');
  });
});

// ─── General security checks ─────────────────────────────────────────────────

describe('General security patterns', () => {
  let tempDir;
  
  before(() => { tempDir = makeTempDir('security-'); });
  after(cleanup);
  
  it('HALT on curl | bash pattern', () => {
    const file = join(tempDir, 'curl-bash.sh');
    writeFileSync(file, CURL_BASH_PATTERN);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'HALT');
    const curlIssues = result.issues.filter(i => i.rule === 'CURL_BASH');
    assert.ok(curlIssues.length > 0, 'Should report CURL_BASH');
  });
  
  it('HALT on wget | sh pattern', () => {
    const file = join(tempDir, 'wget-sh.sh');
    writeFileSync(file, WGET_SH_PATTERN);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'HALT');
    const wgetIssues = result.issues.filter(i => i.rule === 'WGET_SH');
    assert.ok(wgetIssues.length > 0, 'Should report WGET_SH');
  });
  
  it('HALT on chmod 777', () => {
    const file = join(tempDir, 'chmod.sh');
    writeFileSync(file, CHMOD_777_PATTERN);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'HALT');
    const chmodIssues = result.issues.filter(i => i.rule === 'CHMOD_777');
    assert.ok(chmodIssues.length > 0, 'Should report CHMOD_777');
  });
  
  it('HALT on hardcoded credentials', () => {
    const file = join(tempDir, 'creds.yml');
    writeFileSync(file, HARDCODED_CREDENTIALS);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'HALT');
    const credIssues = result.issues.filter(i => i.rule === 'HARDCODED_CREDENTIALS');
    assert.ok(credIssues.length > 0, 'Should report HARDCODED_CREDENTIALS');
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  let tempDir;
  
  before(() => { tempDir = makeTempDir('edge-'); });
  after(cleanup);
  
  it('WARN on empty file', () => {
    const file = join(tempDir, 'empty.yml');
    writeFileSync(file, '');
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'WARN');
    assert.strictEqual(result.platform, 'unknown');
    assert.ok(result.issues.some(i => i.rule === 'EMPTY_FILE'));
  });
  
  it('HALT on non-existent file', () => {
    const result = validateCICDConfig('/nonexistent/path/config.yml');
    assert.strictEqual(result.verdict, 'HALT');
    assert.ok(result.issues.some(i => i.rule === 'FILE_NOT_FOUND'));
  });
  
  it('PASS on valid config with best practices', () => {
    const file = join(tempDir, 'valid.yml');
    writeFileSync(file, VALID_CONFIG);
    const result = validateCICDConfig(file);
    assert.strictEqual(result.verdict, 'PASS');
    assert.strictEqual(result.platform, 'github-actions');
    assert.strictEqual(result.summary.critical, 0);
  });
  
  it('unknown platform for non-CI files', () => {
    const file = join(tempDir, 'package.json');
    writeFileSync(file, '{"name": "test"}');
    const result = validateCICDConfig(file);
    assert.strictEqual(result.platform, 'unknown');
  });
});

// ─── Structured output validation ────────────────────────────────────────────

describe('Output format', () => {
  let tempDir;
  
  before(() => { tempDir = makeTempDir('output-'); });
  after(cleanup);
  
  it('returns correct output structure', () => {
    const file = join(tempDir, 'output-test.yml');
    writeFileSync(file, CURL_BASH_PATTERN);
    const result = validateCICDConfig(file);
    
    assert.ok(result.verdict, 'Should have verdict');
    assert.ok(result.file, 'Should have file');
    assert.ok(result.platform, 'Should have platform');
    assert.ok(Array.isArray(result.issues), 'Should have issues array');
    assert.ok(result.summary, 'Should have summary');
    assert.strictEqual(typeof result.summary.critical, 'number');
    assert.strictEqual(typeof result.summary.warning, 'number');
    assert.strictEqual(typeof result.summary.info, 'number');
    
    if (result.issues.length > 0) {
      const issue = result.issues[0];
      assert.strictEqual(typeof issue.line, 'number');
      assert.ok(['critical', 'warning', 'info'].includes(issue.severity));
      assert.strictEqual(typeof issue.rule, 'string');
      assert.strictEqual(typeof issue.message, 'string');
      assert.strictEqual(typeof issue.fix, 'string');
    }
  });
  
  it('tool handler returns structured response', async () => {
    const { server, tools } = createMockServer();
    registerCICDValidator(server);
    
    const file = join(tempDir, 'handler-test.yml');
    writeFileSync(file, CHMOD_777_PATTERN);
    
    const result = await tools.validate_cicd_config.handler({ path: file });
    assert.ok(result.content, 'Should have content');
    assert.ok(result.content[0].text, 'Should have text content');
    assert.ok(result.cicdReport, 'Should have cicdReport');
    assert.strictEqual(result.cicdReport.verdict, 'HALT');
  });
});
