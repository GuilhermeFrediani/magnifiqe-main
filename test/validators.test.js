/**
 * Test suite for validator internals
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BAD_PATTERNS } from '../src/config.js';
import { analyzeCodeMetrics } from '../src/code-reading.js';
import { analyzeResponseStyle, buildCodeValidationReport } from '../src/validators.js';

describe('BAD_PATTERNS', () => {
  it('should detect TypeScript any', () => {
    const code = 'const data: any = fetchData()';
    const anyPattern = BAD_PATTERNS.find((p) => p.id === 'any');
    assert.ok(anyPattern.regex.test(code));
  });

  it('should detect empty catch blocks', () => {
    const code1 = 'try { foo() } catch (e) {}';
    const code2 = 'try { foo() } catch {}';
    const emptyCatchPatterns = BAD_PATTERNS.filter((p) => p.id === 'empty-catch');
    assert.ok(emptyCatchPatterns.some((p) => p.regex.test(code1)));
    assert.ok(emptyCatchPatterns.some((p) => p.regex.test(code2)));
  });

  it('should detect blind console.log but allow structured logging', () => {
    const blindLog = 'console.log("got here")';
    const structuredLog = 'console.log({ msg: "error", userId, error: String(err) })';
    const consolePattern = BAD_PATTERNS.find((p) => p.id === 'console-log');
    assert.ok(consolePattern.regex.test(blindLog));
    assert.ok(!consolePattern.regex.test(structuredLog));
  });

  it('should detect var usage', () => {
    const code = 'var x = 10';
    const varPattern = BAD_PATTERNS.find((p) => p.id === 'var');
    assert.ok(varPattern.regex.test(code));
  });

  it('should detect eval', () => {
    const code = 'eval("dangerous code")';
    const evalPattern = BAD_PATTERNS.find((p) => p.id === 'eval');
    assert.ok(evalPattern.regex.test(code));
  });

  it('should detect innerHTML', () => {
    const code = 'element.innerHTML = userInput';
    const innerHTMLPattern = BAD_PATTERNS.find((p) => p.id === 'innerhtml');
    assert.ok(innerHTMLPattern.regex.test(code));
  });

  it('should detect dangerouslySetInnerHTML', () => {
    const code = 'return <div dangerouslySetInnerHTML={html} />';
    const pattern = BAD_PATTERNS.find((p) => p.id === 'dangerous-react-html');
    assert.ok(pattern.regex.test(code));
  });

  it('should detect child_process exec usage', () => {
    const code = 'exec(userSuppliedCommand)';
    const pattern = BAD_PATTERNS.find((p) => p.id === 'child-process-exec');
    assert.ok(pattern.regex.test(code));
  });

  it('should detect sensitive localStorage token usage', () => {
    const code = 'localStorage.setItem("token", jwt)';
    const pattern = BAD_PATTERNS.find((p) => p.id === 'sensitive-localstorage');
    assert.ok(pattern.regex.test(code));
  });

  it('should detect inline TODO/FIXME', () => {
    const code1 = '// TODO: fix this later';
    const code2 = '// FIXME: broken logic';
    const todoPattern = BAD_PATTERNS.find((p) => p.id === 'todo-inline');
    assert.ok(todoPattern.regex.test(code1));
    assert.ok(todoPattern.regex.test(code2));
  });

  it('should detect Python empty except', () => {
    const code = 'try:\n    foo()\nexcept:\n    pass';
    const exceptPattern = BAD_PATTERNS.find((p) => p.id === 'empty-except');
    assert.ok(exceptPattern.regex.test(code));
  });

  it('should detect Python print debug', () => {
    const code = 'print("debug value:", x)';
    const printPattern = BAD_PATTERNS.find((p) => p.id === 'print-debug');
    assert.ok(printPattern.regex.test(code));
  });
});

describe('analyzeCodeMetrics (AST)', () => {
  it('should count lines and functions', () => {
    const code = `function foo() {
  return 1;
}
function bar(x) {
  if (x) return x;
  return 0;
}`;
    const metrics = analyzeCodeMetrics(code);
    assert.ok(metrics.lineCount > 0);
    assert.ok(metrics.functions.length >= 2);
  });

  it('should detect cyclomatic complexity', () => {
    const code = `function complex(x, y, z) {
  if (x) { for (let i = 0; i < y; i++) { if (z && x) {} } }
  while (x) { switch(y) { case 1: break; case 2: break; } }
  return x || y || z;
}`;
    const metrics = analyzeCodeMetrics(code);
    const fn = metrics.functions[0];
    assert.ok(fn.complexity > 1, `Expected complexity > 1, got ${fn.complexity}`);
  });

  it('should detect nesting depth', () => {
    const code = `function deep() {
  if (true) {
    for (let i = 0; i < 10; i++) {
      while (true) {
        if (false) {
          // depth 5
        }
      }
    }
  }
}`;
    const metrics = analyzeCodeMetrics(code);
    assert.ok(metrics.maxNesting >= 4, `Expected maxNesting >= 4, got ${metrics.maxNesting}`);
  });

  it('should handle parse errors gracefully', () => {
    const code = 'this is not valid {{{{ javascript';
    const metrics = analyzeCodeMetrics(code);
    assert.ok(metrics.lineCount > 0);
    assert.deepStrictEqual(metrics.functions, []);
  });

  it('should report hasReturnType=false for untyped JS functions', () => {
    const code = `function calculateTotal(items) {
  return items.reduce((sum, i) => sum + i.price, 0);
}
function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}`;
    const metrics = analyzeCodeMetrics(code);
    const calcFn = metrics.functions.find((f) => f.name === 'calculateTotal');
    const fmtFn = metrics.functions.find((f) => f.name === 'formatCurrency');
    assert.ok(calcFn);
    assert.strictEqual(calcFn.hasReturnType, false);
    assert.ok(fmtFn);
    assert.strictEqual(fmtFn.hasReturnType, false);
  });

  it('should include hasReturnType field in every function entry', () => {
    const code = `export function greet(name) {
  return 'Hello ' + name;
}
export const add = (a, b) => a + b;`;
    const metrics = analyzeCodeMetrics(code);
    assert.ok(metrics.functions.length >= 1);
    for (const fn of metrics.functions) {
      assert.ok(typeof fn.hasReturnType === 'boolean', `${fn.name} missing hasReturnType`);
    }
  });
});

describe('buildCodeValidationReport', () => {
  it('should HALT on blocker patterns', () => {
    const report = buildCodeValidationReport({
      code: 'const input: any = value',
      filePath: '/tmp/example.ts',
    });
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.blockers.some((item) => item.includes('[any]')));
  });

  it('should ignore Python-only patterns for JS files', () => {
    const report = buildCodeValidationReport({
      code: 'function demo() { return 1; }',
      filePath: '/tmp/example.js',
    });
    assert.ok(!report.blockers.some((item) => item.includes('empty-except')));
  });
});

describe('analyzeResponseStyle', () => {
  it('should HALT on explicit hesitation/process filler', () => {
    const report = analyzeResponseStyle('Humm, let me think. Vou analisar e já volto.', 'adaptive');
    assert.strictEqual(report.verdict, 'HALT');
    assert.ok(report.blockers.length >= 1);
  });

  it('should WARN on verbose caveman output', () => {
    const longText = Array.from({ length: 130 }, () => 'token').join(' ');
    const report = analyzeResponseStyle(longText, 'caveman');
    assert.strictEqual(report.verdict, 'WARN');
    assert.ok(report.warnings.some((item) => item.includes('verbosity')));
  });

  it('should PASS on direct compact response', () => {
    const report = analyzeResponseStyle('Root cause found -> fix applied -> tests green.', 'caveman');
    assert.strictEqual(report.verdict, 'PASS');
  });
});
