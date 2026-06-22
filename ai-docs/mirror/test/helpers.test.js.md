# test/helpers.test.js

- kind: js
- lines: 90
- bytes: 2741

## Summary
Test suite for src/helpers.js

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`
- `os`
- `../src/helpers.js`

## Exports
- none

## Source
```js
/**
 * Test suite for src/helpers.js
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { minifyTokens, safeResolvePath } from '../src/helpers.js';

const tempRoots = [];

function makeTempDir(prefix = 'stack-perfeita-helpers-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe('minifyTokens', () => {
  it('should remove HTML comments', () => {
    const input = 'Hello <!-- this is a comment --> world';
    const result = minifyTokens(input);
    assert.ok(!result.includes('<!--'));
    assert.ok(!result.includes('-->'));
    assert.ok(result.includes('Hello'));
    assert.ok(result.includes('world'));
  });

  it('should collapse multiple blank lines', () => {
    const input = 'Line 1\n\n\n\n\nLine 2';
    const expected = 'Line 1\n\nLine 2';
    assert.strictEqual(minifyTokens(input), expected);
  });

  it('should trim trailing whitespace', () => {
    const input = 'Hello   \nWorld\t\t';
    const expected = 'Hello\nWorld';
    assert.strictEqual(minifyTokens(input), expected);
  });

  it('should return null/undefined as-is', () => {
    assert.strictEqual(minifyTokens(null), null);
    assert.strictEqual(minifyTokens(undefined), undefined);
    assert.strictEqual(minifyTokens(''), '');
  });
});

describe('safeResolvePath', () => {
  it('should resolve valid paths inside base', () => {
    const base = makeTempDir();
    mkdirSync(join(base, 'src'));
    const result = safeResolvePath(base, 'src/index.js');
    assert.ok(result.startsWith(base));
    assert.ok(result.includes('src'));
  });

  it('should reject path traversal', () => {
    const base = makeTempDir();
    assert.throws(() => safeResolvePath(base, '../../../etc/passwd'), /Path traversal/);
  });

  it('should reject prefix-collision escapes', () => {
    const root = makeTempDir();
    const base = join(root, 'base');
    const sibling = join(root, 'base2');
    mkdirSync(base);
    mkdirSync(sibling);

    assert.throws(() => safeResolvePath(base, '../base2/evil.md'), /Path traversal/);
  });

  it('should reject symlink escapes', { skip: process.platform === 'win32' }, () => {
    const root = makeTempDir();
    const base = join(root, 'base');
    const outside = join(root, 'outside');
    mkdirSync(base);
    mkdirSync(outside);
    symlinkSync(outside, join(base, 'linked-out'));

    assert.throws(() => safeResolvePath(base, 'linked-out/secret.txt'), /Path traversal/);
  });
});

```
