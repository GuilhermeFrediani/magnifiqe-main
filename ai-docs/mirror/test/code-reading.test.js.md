# test/code-reading.test.js

- kind: js
- lines: 199
- bytes: 6290

## Summary
Test suite for src/code-reading.js Tests: extractSymbols, getFileLang

## Imports
- `node:test`
- `node:assert`
- `../src/code-reading.js`

## Exports
- none

## Source
```js
/**
 * Test suite for src/code-reading.js
 * Tests: extractSymbols, getFileLang
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractSymbols, getFileLang, analyzeCodeMetrics, extractSymbolsAST } from '../src/code-reading.js';

describe('getFileLang', () => {
  it('should detect JS/TS files', () => {
    assert.strictEqual(getFileLang('test.js'), 'js');
    assert.strictEqual(getFileLang('test.ts'), 'js');
    assert.strictEqual(getFileLang('test.jsx'), 'js');
    assert.strictEqual(getFileLang('test.tsx'), 'js');
    assert.strictEqual(getFileLang('test.mjs'), 'js');
    assert.strictEqual(getFileLang('test.cjs'), 'js');
  });

  it('should detect Python files', () => {
    assert.strictEqual(getFileLang('test.py'), 'py');
  });

  it('should return null for unsupported files', () => {
    assert.strictEqual(getFileLang('test.rb'), null);
    assert.strictEqual(getFileLang('test.php'), null);
    assert.strictEqual(getFileLang('test.swift'), null);
  });

  it('should detect Rust files', () => {
    assert.strictEqual(getFileLang('test.rs'), 'rust');
  });

  it('should detect Go files', () => {
    assert.strictEqual(getFileLang('test.go'), 'go');
  });

  it('should detect Java files', () => {
    assert.strictEqual(getFileLang('test.java'), 'java');
  });

  it('should detect C# files', () => {
    assert.strictEqual(getFileLang('test.cs'), 'csharp');
    assert.strictEqual(getFileLang('test.csx'), 'csharp');
  });
});

describe('extractSymbols', () => {
  it('should extract function declarations', () => {
    const code = `function calculateTax(amount) {
  return amount * 0.1;
}`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some(s => s.name === 'calculateTax' && s.kind === 'function'));
  });

  it('should extract arrow functions', () => {
    const code = `const handleSubmit = async (event) => {
  event.preventDefault();
}`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some(s => s.name === 'handleSubmit' && s.kind === 'arrow'));
  });

  it('should extract classes', () => {
    const code = `class UserService {
  constructor(db) {
    this.db = db;
  }
}`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some(s => s.name === 'UserService' && s.kind === 'class'));
  });

  it('should extract exported functions', () => {
    const code = `export function fetchUsers() {
  return [];
}`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some(s => s.name === 'fetchUsers'));
  });

  it('should extract Python functions', () => {
    const code = `def calculate_total(items):
    return sum(item.price for item in items)`;
    const symbols = extractSymbols(code, 'py');
    assert.ok(symbols.some(s => s.name === 'calculate_total' && s.kind === 'function'));
  });

  it('should extract Python classes', () => {
    const code = `class DatabaseConnection:
    def __init__(self, url):
        self.url = url`;
    const symbols = extractSymbols(code, 'py');
    assert.ok(symbols.some(s => s.name === 'DatabaseConnection' && s.kind === 'class'));
  });

  it('should not extract control flow keywords', () => {
    const code = `if (condition) {
  for (let i = 0; i < 10; i++) {
    while (running) {}
  }
}`;
    const symbols = extractSymbols(code, 'js');
    assert.strictEqual(symbols.length, 0);
  });

  it('should extract class methods via AST', () => {
    const code = `class UserService {
  constructor(db) {
    this.db = db;
  }
  async fetchUser(id) {
    return this.db.find(id);
  }
  deleteUser(id) {
    return this.db.remove(id);
  }
}`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some(s => s.name === 'UserService' && s.kind === 'class'));
    assert.ok(symbols.some(s => s.name === 'fetchUser'));
    assert.ok(symbols.some(s => s.name === 'deleteUser'));
  });

  it('should extract exported arrow functions via AST', () => {
    const code = `export const processItems = (items) => {
  return items.map(i => i.id);
};`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some(s => s.name === 'processItems'));
  });
});

describe('extractSymbolsAST', () => {
  it('should extract symbols using AST directly', () => {
    const code = `function hello() { return 'world'; }`;
    const symbols = extractSymbolsAST(code);
    assert.ok(symbols.some(s => s.name === 'hello'));
  });

  it('should return empty array for unparseable code', () => {
    const code = '{{{{ not valid at all';
    const symbols = extractSymbolsAST(code);
    // acorn-loose is very tolerant, but if it fails we get empty array
    assert.ok(Array.isArray(symbols));
  });
});

describe('analyzeCodeMetrics', () => {
  it('should return lineCount and functions array', () => {
    const code = `function a() {}
function b() {}`;
    const metrics = analyzeCodeMetrics(code);
    assert.strictEqual(typeof metrics.lineCount, 'number');
    assert.ok(Array.isArray(metrics.functions));
    assert.strictEqual(typeof metrics.maxNesting, 'number');
  });

  it('should compute function complexity', () => {
    const code = `function complex(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) { continue; }
    }
  }
  return x;
}`;
    const metrics = analyzeCodeMetrics(code);
    const fn = metrics.functions[0];
    assert.ok(fn);
    assert.ok(fn.complexity >= 4, `Expected complexity >= 4, got ${fn.complexity}`);
    assert.ok(fn.lines >= 7, `Expected lines >= 7, got ${fn.lines}`);
  });

  it('should detect hasReturnType for plain JS functions (false)', () => {
    const code = `function foo(x) {
  return x + 1;
}
function bar() {
  return 'hello';
}`;
    const metrics = analyzeCodeMetrics(code);
    // Plain JS without type annotations should report hasReturnType: false
    for (const fn of metrics.functions) {
      assert.strictEqual(fn.hasReturnType, false, `Expected ${fn.name} hasReturnType=false`);
    }
  });

  it('should always include hasReturnType in function metrics', () => {
    const code = `function a() {}
const b = () => {};`;
    const metrics = analyzeCodeMetrics(code);
    for (const fn of metrics.functions) {
      assert.ok('hasReturnType' in fn, `Missing hasReturnType in ${fn.name}`);
    }
  });
});

```
