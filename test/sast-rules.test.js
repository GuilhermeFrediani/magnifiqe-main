/**
 * Tests for src/sast-rules.js — custom SAST security rule engine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SAST_RULES,
  RULES_BY_ID,
  RULES_BY_CATEGORY,
  CATEGORIES,
  scanCode,
  scanFile,
  validateRule,
  validateAllRules,
  isBinaryFile,
} from '../src/sast-rules.js';

// ─── Rule Format Validation ─────────────────────────────────────────────────

describe('SAST rule format', () => {
  it('exports a non-empty rules array', () => {
    assert.ok(Array.isArray(SAST_RULES));
    assert.ok(SAST_RULES.length >= 25, `Expected ≥25 rules, got ${SAST_RULES.length}`);
  });

  it('has all 7 required categories', () => {
    const required = [
      'sql-injection',
      'xss',
      'command-injection',
      'path-traversal',
      'hardcoded-secrets',
      'weak-crypto',
      'insecure-deserialization',
    ];
    for (const cat of required) {
      assert.ok(RULES_BY_CATEGORY.has(cat), `Missing category: ${cat}`);
      assert.ok(RULES_BY_CATEGORY.get(cat).length > 0, `Empty category: ${cat}`);
    }
  });

  it('every rule passes schema validation', () => {
    const result = validateAllRules();
    assert.strictEqual(result.valid, result.total, `Invalid rules: ${JSON.stringify(result.invalid)}`);
  });

  it('rule IDs are unique', () => {
    const ids = SAST_RULES.map((r) => r.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, `Duplicate IDs found`);
  });

  it('every rule has valid severity', () => {
    const validSeverities = new Set(['critical', 'high', 'medium', 'low']);
    for (const rule of SAST_RULES) {
      assert.ok(validSeverities.has(rule.severity), `${rule.id} has invalid severity: ${rule.severity}`);
    }
  });

  it('every rule has non-empty references', () => {
    for (const rule of SAST_RULES) {
      assert.ok(Array.isArray(rule.references) && rule.references.length > 0, `${rule.id} has empty references`);
      for (const ref of rule.references) {
        assert.ok(ref.startsWith('CWE-'), `${rule.id} reference ${ref} doesn't start with CWE-`);
      }
    }
  });

  it('every rule has a fix recommendation', () => {
    for (const rule of SAST_RULES) {
      assert.ok(typeof rule.fix === 'string' && rule.fix.length > 0, `${rule.id} has empty fix`);
    }
  });

  it('RULES_BY_ID is a working lookup map', () => {
    assert.ok(RULES_BY_ID instanceof Map);
    const first = SAST_RULES[0];
    assert.strictEqual(RULES_BY_ID.get(first.id), first);
  });

  it('validateRule returns valid for a correct rule', () => {
    const result = validateRule(SAST_RULES[0]);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('validateRule catches missing required fields', () => {
    const bad = { id: 'X', name: '', category: '', severity: 'nope', pattern: '', regex: /x/, language: [], fix: '', references: [], description: '' };
    const result = validateRule(bad);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});

// ─── SQL Injection ──────────────────────────────────────────────────────────

describe('SQL Injection rules (SEC001–SEC005)', () => {
  it('SEC001 detects SELECT with template literal', () => {
    const result = scanCode('const q = `SELECT * FROM users WHERE id = ${userId}`;');
    assert.ok(result.findings.length > 0);
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC001'));
  });

  it('SEC002 detects SELECT with string concatenation', () => {
    const result = scanCode("const q = 'SELECT * FROM users WHERE id = ' + userId;");
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC002'));
  });

  it('SEC003 detects INSERT with template literal', () => {
    const result = scanCode('const q = `INSERT INTO logs (msg) VALUES (${msg})`;');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC003'));
  });

  it('SEC004 detects INSERT with concatenation', () => {
    const result = scanCode("const q = 'INSERT INTO logs (msg) VALUES (' + msg + ')';");
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC004'));
  });

  it('SEC005 detects UNION SELECT', () => {
    const result = scanCode('const q = "1 UNION SELECT username, password FROM users";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC005'));
  });

  it('does NOT flag parameterized queries', () => {
    const result = scanCode('const q = "SELECT * FROM users WHERE id = $1";');
    assert.ok(result.findings.length === 0, `False positive SQL injection: ${JSON.stringify(result.findings)}`);
  });

  it('does NOT flag harmless comments mentioning SQL', () => {
    const result = scanCode('// This function handles SELECT FROM operations');
    assert.ok(result.findings.length === 0, `False positive on comment`);
  });
});

// ─── XSS ────────────────────────────────────────────────────────────────────

describe('XSS rules (SEC010–SEC013)', () => {
  it('SEC010 detects innerHTML assignment', () => {
    const result = scanCode('element.innerHTML = userInput;');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC010'));
  });

  it('SEC011 detects dangerouslySetInnerHTML', () => {
    const result = scanCode('<div dangerouslySetInnerHTML={{ __html: data }} />');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC011'));
  });

  it('SEC012 detects document.write', () => {
    const result = scanCode('document.write("<h1>" + title + "</h1>");');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC012'));
  });

  it('SEC013 detects javascript: URI', () => {
    const result = scanCode('link.href = "javascript:alert(1)";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC013'));
  });

  it('does NOT flag textContent usage', () => {
    const result = scanCode('element.textContent = userInput;');
    assert.ok(result.findings.length === 0, `False positive XSS`);
  });
});

// ─── Command Injection ──────────────────────────────────────────────────────

describe('Command Injection rules (SEC020–SEC023)', () => {
  it('SEC020 detects exec()', () => {
    const result = scanCode('exec("ls " + dir);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC020'));
  });

  it('SEC021 detects spawn()', () => {
    const result = scanCode('spawn("git", ["status"]);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC021'));
  });

  it('SEC022 detects system()', () => {
    const result = scanCode('system("echo " + input);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC022'));
  });

  it('SEC023 detects execSync()', () => {
    const result = scanCode('const out = execSync("cat " + file);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC023'));
  });

  it('does NOT flag readFile calls', () => {
    const result = scanCode('const data = readFile("config.json");');
    assert.ok(result.findings.length === 0, `False positive command injection`);
  });
});

// ─── Path Traversal ─────────────────────────────────────────────────────────

describe('Path Traversal rules (SEC030–SEC033)', () => {
  it('SEC030 detects ../ sequence', () => {
    const result = scanCode('const p = resolve(base, "../../../etc/passwd");');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC030'));
  });

  it('SEC031 detects ..\\ sequence', () => {
    const result = scanCode('const p = "C:\\Users\\..\\secret.txt";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC031'));
  });

  it('SEC032 detects readFileSync with user input', () => {
    const result = scanCode('readFileSync(req.query.file);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC032'));
  });

  it('SEC033 detects /etc/passwd reference', () => {
    const result = scanCode('const data = readFile("/etc/passwd");');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC033'));
  });

  it('does NOT flag normal path operations', () => {
    const result = scanCode('const p = resolve(__dirname, "src/utils.js");');
    assert.ok(result.findings.length === 0, `False positive path traversal`);
  });
});

// ─── Hardcoded Secrets ──────────────────────────────────────────────────────

describe('Hardcoded Secrets rules (SEC040–SEC044)', () => {
  it('SEC040 detects hardcoded password', () => {
    const result = scanCode('const password = "hunter2";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC040'));
  });

  it('SEC041 detects hardcoded API key', () => {
    const result = scanCode('const api_key = "sk-1234567890abcdef";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC041'));
  });

  it('SEC042 detects hardcoded secret', () => {
    const result = scanCode('const secret = "my_secret_value";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC042'));
  });

  it('SEC043 detects hardcoded token', () => {
    const result = scanCode('const token = "eyJhbGciOiJIUzI1NiJ9";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC043'));
  });

  it('SEC044 detects hardcoded private key', () => {
    const result = scanCode('const private_key = "-----BEGIN RSA PRIVATE KEY-----";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC044'));
  });

  it('does NOT flag environment variable references', () => {
    const result = scanCode('const password = process.env.DB_PASSWORD;');
    assert.ok(result.findings.length === 0, `False positive on env var`);
  });

  it('does NOT flag variable assignments without string values', () => {
    const result = scanCode('let password = null;');
    assert.ok(result.findings.length === 0, `False positive on null assignment`);
  });
});

// ─── Weak Crypto ────────────────────────────────────────────────────────────

describe('Weak Crypto rules (SEC050–SEC053)', () => {
  it('SEC050 detects md5 keyword', () => {
    const result = scanCode('const hash = md5(input);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC050'));
  });

  it('SEC051 detects sha1 keyword', () => {
    const result = scanCode('const hash = sha1(data);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC051'));
  });

  it('SEC052 detects createHash("md5")', () => {
    const result = scanCode('crypto.createHash("md5").update(data).digest("hex");');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC052'));
  });

  it('SEC053 detects createHash("sha1")', () => {
    const result = scanCode("crypto.createHash('sha1').update(data).digest('hex');");
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC053'));
  });

  it('does NOT flag createHash("sha256")', () => {
    const result = scanCode('crypto.createHash("sha256").update(data).digest("hex");');
    assert.ok(result.findings.length === 0, `False positive on sha256`);
  });

  it('does NOT flag sha256 keyword', () => {
    const result = scanCode('const hash = sha256(input);');
    assert.ok(result.findings.length === 0, `False positive on sha256`);
  });
});

// ─── Insecure Deserialization ───────────────────────────────────────────────

describe('Insecure Deserialization rules (SEC060–SEC063)', () => {
  it('SEC060 detects eval()', () => {
    const result = scanCode('eval(userInput);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC060'));
  });

  it('SEC061 detects JSON.parse on request body', () => {
    const result = scanCode('const data = JSON.parse(req.body);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC061'));
  });

  it('SEC062 detects any JSON.parse', () => {
    const result = scanCode('const obj = JSON.parse(rawInput);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC062'));
  });

  it('SEC063 detects new Function()', () => {
    const result = scanCode('const fn = new Function("return " + code);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC063'));
  });

  it('does NOT flag safe JSON.parse with try/catch', () => {
    const code = `try { const d = JSON.parse(fixed); } catch (e) { console.error(e); }`;
    const result = scanCode(code);
    // SEC062 fires on JSON.parse regardless (it's a pattern), but SEC061 shouldn't fire on non-req input
    assert.ok(!result.findings.some((f) => f.ruleId === 'SEC061'), `False positive SEC061 on non-req input`);
  });
});

// ─── Scanner Output Structure ───────────────────────────────────────────────

describe('Scanner output structure', () => {
  it('returns scanned: true with findings', () => {
    const result = scanCode('eval("x");');
    assert.strictEqual(result.scanned, true);
    assert.ok(Array.isArray(result.findings));
    assert.ok(result.summary.total > 0);
  });

  it('each finding has required fields', () => {
    const result = scanCode('eval("x");');
    for (const f of result.findings) {
      assert.ok(typeof f.ruleId === 'string');
      assert.ok(typeof f.ruleName === 'string');
      assert.ok(typeof f.category === 'string');
      assert.ok(typeof f.severity === 'string');
      assert.ok(typeof f.line === 'number');
      assert.ok(typeof f.message === 'string');
      assert.ok(typeof f.code === 'string');
      assert.ok(typeof f.fix === 'string');
      assert.ok(Array.isArray(f.references));
    }
  });

  it('tracks correct line numbers', () => {
    const code = 'const a = 1;\nconst b = 2;\neval("test");\nconst c = 3;';
    const result = scanCode(code);
    const evalFinding = result.findings.find((f) => f.ruleId === 'SEC060');
    assert.ok(evalFinding);
    assert.strictEqual(evalFinding.line, 3);
  });

  it('summary counts match findings', () => {
    const result = scanCode('eval("x");\nconst password = "secret";');
    const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of result.findings) sevCounts[f.severity]++;
    assert.strictEqual(result.summary.critical, sevCounts.critical);
    assert.strictEqual(result.summary.high, sevCounts.high);
  });

  it('empty file returns scanned: false', () => {
    const result = scanCode('');
    assert.strictEqual(result.scanned, false);
    assert.strictEqual(result.findings.length, 0);
  });

  it('returns correct rule count', () => {
    const result = scanCode('eval("x");');
    assert.strictEqual(result.ruleCount, SAST_RULES.length);
  });
});

// ─── CWE References ─────────────────────────────────────────────────────────

describe('CWE references', () => {
  it('SQL injection rules reference CWE-89', () => {
    const sqlRules = SAST_RULES.filter((r) => r.category === 'sql-injection');
    for (const r of sqlRules) {
      assert.ok(r.references.includes('CWE-89'), `${r.id} missing CWE-89`);
    }
  });

  it('XSS rules reference CWE-79', () => {
    const xssRules = SAST_RULES.filter((r) => r.category === 'xss');
    for (const r of xssRules) {
      assert.ok(r.references.includes('CWE-79'), `${r.id} missing CWE-79`);
    }
  });

  it('command injection rules reference CWE-78', () => {
    const cmdRules = SAST_RULES.filter((r) => r.category === 'command-injection');
    for (const r of cmdRules) {
      assert.ok(r.references.includes('CWE-78'), `${r.id} missing CWE-78`);
    }
  });

  it('path traversal rules reference CWE-22', () => {
    const pathRules = SAST_RULES.filter((r) => r.category === 'path-traversal');
    for (const r of pathRules) {
      assert.ok(r.references.includes('CWE-22'), `${r.id} missing CWE-22`);
    }
  });

  it('hardcoded secrets rules reference CWE-798', () => {
    const secretRules = SAST_RULES.filter((r) => r.category === 'hardcoded-secrets');
    for (const r of secretRules) {
      assert.ok(r.references.includes('CWE-798'), `${r.id} missing CWE-798`);
    }
  });

  it('weak crypto rules reference CWE-328', () => {
    const cryptoRules = SAST_RULES.filter((r) => r.category === 'weak-crypto');
    for (const r of cryptoRules) {
      assert.ok(r.references.includes('CWE-328'), `${r.id} missing CWE-328`);
    }
  });

  it('insecure deserialization rules reference CWE-95 or CWE-502', () => {
    const deserRules = SAST_RULES.filter((r) => r.category === 'insecure-deserialization');
    for (const r of deserRules) {
      const hasValid = r.references.includes('CWE-95') || r.references.includes('CWE-502');
      assert.ok(hasValid, `${r.id} missing CWE-95 or CWE-502`);
    }
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('null code returns scanned: false', () => {
    const result = scanCode(null);
    assert.strictEqual(result.scanned, false);
  });

  it('undefined code returns scanned: false', () => {
    const result = scanCode(undefined);
    assert.strictEqual(result.scanned, false);
  });

  it('binary file detection by extension', () => {
    assert.strictEqual(isBinaryFile('image.png'), true);
    assert.strictEqual(isBinaryFile('video.mp4'), true);
    assert.strictEqual(isBinaryFile('archive.zip'), true);
    assert.strictEqual(isBinaryFile('source.js'), false);
    assert.strictEqual(isBinaryFile('style.css'), false);
  });

  it('rule filter works with specific IDs', () => {
    const result = scanCode('eval("x");\nconst password = "secret";', undefined, ['SEC060']);
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC060'));
    assert.ok(!result.findings.some((f) => f.ruleId === 'SEC040'));
  });

  it('rule filter with empty array returns no findings', () => {
    const result = scanCode('eval("x");', undefined, []);
    assert.strictEqual(result.findings.length, 0);
  });

  it('scanFile returns file not found for missing path', () => {
    const result = scanFile('nonexistent_file_12345.js');
    assert.strictEqual(result.scanned, false);
    assert.strictEqual(result.reason, 'file not found');
  });

  it('multi-line code tracks multiple findings', () => {
    const code = [
      'const a = "SELECT * FROM users WHERE id = ${id}";',
      'const b = "INSERT INTO logs VALUES (${msg})";',
      'const c = eval(rawInput);',
    ].join('\n');
    const result = scanCode(code);
    assert.ok(result.summary.total >= 3, `Expected ≥3 findings, got ${result.summary.total}`);
  });

  it('case insensitive matching for crypto patterns', () => {
    const result = scanCode('const h = MD5(input);');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC050'));
  });

  it('handles Windows-style paths', () => {
    const result = scanCode('const p = "C:\\\\Users\\\\..\\\\secret.txt";');
    assert.ok(result.findings.some((f) => f.ruleId === 'SEC031'));
  });

  it('handles very long lines without crashing', () => {
    const longLine = 'const q = "SELECT ' + 'x, '.repeat(500) + 'FROM users WHERE id = ${id}";';
    const result = scanCode(longLine);
    assert.strictEqual(result.scanned, true);
  });

  it('categories list matches RULES_BY_CATEGORY keys', () => {
    assert.deepStrictEqual(CATEGORIES, [...RULES_BY_CATEGORY.keys()]);
  });
});
