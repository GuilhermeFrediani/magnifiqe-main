/**
 * Test suite for JSON Schema validation in src/validators.js
 * Tests: validate_input_schema tool, security pattern detection, additionalProperties enforcement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BAD_PATTERNS } from '../src/config.js';
import { registerValidatorsTools } from '../src/validators.js';

// ─── Mock Server ──────────────────────────────────────────────────────────────

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool(name, description, schema, handler) {
        tools[name] = { description, schema, handler };
      },
    },
    tools,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseReport(text) {
  const lines = text.split('\n');
  const verdictMatch = lines[0].match(/:\s*(PASS|WARN|HALT)/);
  const verdict = verdictMatch ? verdictMatch[1] : null;

  const findings = [];
  const schemaIssues = [];

  for (const line of lines) {
    if (line.includes('[') && line.includes(']') && line.includes(':')) {
      const match = line.match(/\[([^\]]+)\]/);
      if (match) findings.push(match[1]);
    }
    if (line.trim().startsWith('-') && !line.includes('[')) {
      const issueMatch = line.match(/-\s+(.*)/);
      if (issueMatch && !issueMatch[1].includes('Security') && !issueMatch[1].includes('Schema') && !issueMatch[1].includes('Tool') && !issueMatch[1].includes('Input')) {
        schemaIssues.push(issueMatch[1].trim());
      }
    }
  }

  return { verdict, findings, schemaIssues, raw: text };
}

// ─── BAD_PATTERNS Security Tests ──────────────────────────────────────────────

describe('BAD_PATTERNS - SQL Injection', () => {
  it('should detect SELECT FROM pattern', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'sql-select-from');
    assert.ok(pattern, 'sql-select-from pattern exists');
    assert.ok(pattern.regex.test('SELECT * FROM users'));
    assert.ok(pattern.regex.test('select name from accounts'));
    assert.ok(!pattern.regex.test('normal code'));
  });

  it('should detect INSERT INTO pattern', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'sql-insert-into');
    assert.ok(pattern, 'sql-insert-into pattern exists');
    assert.ok(pattern.regex.test('INSERT INTO users VALUES'));
    assert.ok(pattern.regex.test('insert into logs values'));
    assert.ok(!pattern.regex.test('normal code'));
  });

  it('should detect DROP TABLE pattern', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'sql-drop-table');
    assert.ok(pattern, 'sql-drop-table pattern exists');
    assert.ok(pattern.regex.test('DROP TABLE users'));
    assert.ok(!pattern.regex.test('drop the table'));
  });

  it('should detect UNION SELECT pattern', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'sql-union-select');
    assert.ok(pattern, 'sql-union-select pattern exists');
    assert.ok(pattern.regex.test('1 UNION SELECT password FROM users'));
    assert.ok(!pattern.regex.test('union and select'));
  });
});

describe('BAD_PATTERNS - XSS', () => {
  it('should detect script tag', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'xss-script-tag');
    assert.ok(pattern, 'xss-script-tag pattern exists');
    assert.ok(pattern.regex.test('<script>alert(1)</script>'));
    assert.ok(pattern.regex.test('<script >'));
    assert.ok(!pattern.regex.test('<style>'));
  });

  it('should detect javascript URI', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'xss-javascript-uri');
    assert.ok(pattern, 'xss-javascript-uri pattern exists');
    assert.ok(pattern.regex.test('javascript:alert(1)'));
    assert.ok(pattern.regex.test('javascript :alert(1)'));
    assert.ok(!pattern.regex.test('http://example.com'));
  });

  it('should detect onerror attribute', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'xss-onerror');
    assert.ok(pattern, 'xss-onerror pattern exists');
    assert.ok(pattern.regex.test('onerror=alert(1)'));
    assert.ok(!pattern.regex.test('on error'));
  });

  it('should detect onload attribute', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'xss-onload');
    assert.ok(pattern, 'xss-onload pattern exists');
    assert.ok(pattern.regex.test('onload=alert(1)'));
    assert.ok(!pattern.regex.test('on load'));
  });
});

describe('BAD_PATTERNS - Command Injection', () => {
  it('should detect exec()', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'cmd-exec');
    assert.ok(pattern, 'cmd-exec pattern exists');
    assert.ok(pattern.regex.test('exec("ls")'));
    assert.ok(!pattern.regex.test('execute'));
  });

  it('should detect spawn()', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'cmd-spawn');
    assert.ok(pattern, 'cmd-spawn pattern exists');
    assert.ok(pattern.regex.test('spawn("ls")'));
    assert.ok(!pattern.regex.test('respawn'));
  });

  it('should detect system()', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'cmd-system');
    assert.ok(pattern, 'cmd-system pattern exists');
    assert.ok(pattern.regex.test('system("ls")'));
    assert.ok(!pattern.regex.test('systemd'));
  });
});

describe('BAD_PATTERNS - Path Traversal', () => {
  it('should detect forward slash traversal', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'path-traversal-fwd');
    assert.ok(pattern, 'path-traversal-fwd pattern exists');
    assert.ok(pattern.regex.test('../../../etc/passwd'));
    assert.ok(!pattern.regex.test('./file'));
  });

  it('should detect backslash traversal', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'path-traversal-back');
    assert.ok(pattern, 'path-traversal-back pattern exists');
    assert.ok(pattern.regex.test('..\\..\\windows\\system32'));
    assert.ok(!pattern.regex.test('.\\file'));
  });

  it('should detect /etc/passwd reference', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'path-etc-passwd');
    assert.ok(pattern, 'path-etc-passwd pattern exists');
    assert.ok(pattern.regex.test('/etc/passwd'));
    assert.ok(pattern.regex.test('/ETC/PASSWD'));
    assert.ok(!pattern.regex.test('/etc/hostname'));
  });
});

describe('BAD_PATTERNS - Hardcoded Secrets', () => {
  it('should detect hardcoded password', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'secret-password');
    assert.ok(pattern, 'secret-password pattern exists');
    assert.ok(pattern.regex.test("password = 'secret123'"));
    assert.ok(pattern.regex.test('password="admin"'));
    assert.ok(!pattern.regex.test('checkPassword()'));
  });

  it('should detect hardcoded API key', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'secret-api-key');
    assert.ok(pattern, 'secret-api-key pattern exists');
    assert.ok(pattern.regex.test("api_key = 'abc123'"));
    assert.ok(pattern.regex.test('apiKey="xyz"'));
    assert.ok(!pattern.regex.test('getApiKey()'));
  });

  it('should detect generic hardcoded secret', () => {
    const pattern = BAD_PATTERNS.find(p => p.id === 'secret-generic');
    assert.ok(pattern, 'secret-generic pattern exists');
    assert.ok(pattern.regex.test("secret = 'mysecret'"));
    assert.ok(pattern.regex.test('secret="token"'));
    assert.ok(!pattern.regex.test('getSecret()'));
  });
});

// ─── validate_input_schema Tool Tests ─────────────────────────────────────────

describe('validate_input_schema tool', () => {
  let tools;

  function setup() {
    const mock = createMockServer();
    registerValidatorsTools(mock.server);
    tools = mock.tools;
  }

  it('should be registered in validators', () => {
    setup();
    assert.ok(tools.validate_input_schema, 'validate_input_schema tool is registered');
    assert.ok(tools.validate_input_schema.handler, 'handler exists');
  });

  it('should PASS for clean input', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: { name: 'John', email: 'john@example.com' },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'PASS');
    assert.deepStrictEqual(report.findings, []);
  });

  it('should HALT on SQL injection in string field', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'query',
      input: { search: 'SELECT * FROM users' },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.includes('sql-select-from'));
  });

  it('should HALT on XSS pattern', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'render',
      input: { content: '<script>alert(1)</script>' },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.includes('xss-script-tag'));
  });

  it('should HALT on command injection', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'execute',
      input: { command: 'exec("rm -rf /")' },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.includes('cmd-exec'));
  });

  it('should HALT on path traversal', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'readFile',
      input: { path: '../../../etc/passwd' },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.some(f => f.includes('path-traversal') || f.includes('path-etc-passwd')));
  });

  it('should HALT on hardcoded password', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'config',
      input: { password: "password = 'admin123'" },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.includes('secret-password'));
  });
});

// ─── Schema Validation Tests ──────────────────────────────────────────────────

describe('validate_input_schema - Schema Validation', () => {
  let tools;

  function setup() {
    const mock = createMockServer();
    registerValidatorsTools(mock.server);
    tools = mock.tools;
  }

  it('should enforce additionalProperties: false', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: { name: 'John', email: 'john@example.com', extraField: 'not allowed' },
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' } },
        required: ['name'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'WARN');
    assert.ok(report.schemaIssues.some(i => i.includes('additionalProperties')));
  });

  it('should PASS when all properties are in schema', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: { name: 'John', email: 'john@example.com' },
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' } },
        required: ['name', 'email'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'PASS');
    assert.ok(!report.schemaIssues.some(i => i.includes('additionalProperties')));
  });

  it('should detect missing required fields', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: { name: 'John' },
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' } },
        required: ['name', 'email'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'WARN');
    assert.ok(report.schemaIssues.some(i => i.includes('Missing required field')));
  });

  it('should detect type mismatches', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: { name: 123, email: 'john@example.com' },
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' } },
        required: ['name'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'WARN');
    assert.ok(report.schemaIssues.some(i => i.includes('expected type "string"')));
  });

  it('should handle nested objects', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: {
        name: 'John',
        address: {
          street: '123 Main St',
          city: 'SELECT * FROM cities',
        },
      },
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { type: 'object' },
        },
        required: ['name'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.includes('sql-select-from'));
  });

  it('should handle arrays with string elements', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'tagUser',
      input: { tags: ['admin', '<script>alert(1)</script>'] },
      schema: {
        type: 'object',
        properties: { tags: { type: 'array' } },
        required: ['tags'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.includes('xss-script-tag'));
  });

  it('should handle empty objects', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'noop',
      input: {},
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: [],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'PASS');
  });

  it('should detect multiple security findings', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'malicious',
      input: {
        query: 'SELECT * FROM users',
        script: '<script>alert(1)</script>',
        cmd: 'exec("ls")',
      },
      schema: {
        type: 'object',
        properties: { query: { type: 'string' }, script: { type: 'string' }, cmd: { type: 'string' } },
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.findings.length >= 3, `Expected at least 3 findings, got ${report.findings.length}`);
  });

  it('should handle input without schema gracefully', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'test',
      input: { value: 'safe input' },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'PASS');
    assert.ok(!report.raw.includes('Schema validation'));
  });

  it('should detect multiple additional properties', async () => {
    setup();
    const result = await tools.validate_input_schema.handler({
      toolName: 'createUser',
      input: { name: 'John', extra1: 'a', extra2: 'b', extra3: 'c' },
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    });
    const report = parseReport(result.content[0].text);
    assert.strictEqual(report.verdict, 'WARN');
    assert.ok(report.schemaIssues.some(i => i.includes('extra1, extra2, extra3')));
  });
});
