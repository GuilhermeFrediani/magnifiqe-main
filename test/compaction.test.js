/**
 * Test suite for src/compaction.js
 * Tests: extractErrorsFromLogs, summarizeDiff
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractErrorsFromLogs, summarizeDiff } from '../src/compaction.js';

describe('extractErrorsFromLogs', () => {
  it('should extract ERROR lines', () => {
    const logs = `INFO: Starting build
ERROR: Cannot find module 'x'
INFO: Compiling...
WARN: Deprecated API usage
INFO: Done`;
    const result = extractErrorsFromLogs(logs, true);
    assert.ok(result.includes("ERROR: Cannot find module 'x'"));
    assert.ok(result.includes("WARN: Deprecated API usage"));
    assert.ok(result.includes("Errors/warnings: 2"));
  });

  it('should count info lines discarded', () => {
    const logs = `INFO: line1
INFO: line2
ERROR: bad
INFO: line3`;
    const result = extractErrorsFromLogs(logs, true);
    assert.ok(result.includes("Info lines discarded: 3"));
  });

  it('should omit error details when keepErrors=false', () => {
    const logs = `INFO: ok
ERROR: fail
INFO: fine`;
    const result = extractErrorsFromLogs(logs, false);
    assert.ok(!result.includes("ERROR: fail"));
    assert.ok(result.includes("Errors/warnings: 1"));
  });

  it('should handle empty logs', () => {
    const result = extractErrorsFromLogs("", true);
    assert.ok(result.includes("Total lines: 0"));
    assert.ok(result.includes("Errors/warnings: 0"));
  });

  it('should detect FATAL, exception, traceback, panic, CRITICAL', () => {
    const logs = `FATAL crash
exception in thread
traceback follows
panic: runtime error
CRITICAL failure`;
    const result = extractErrorsFromLogs(logs, true);
    assert.ok(result.includes("Errors/warnings: 5"));
  });
});

describe('summarizeDiff', () => {
  it('should extract changed files from unified diff', () => {
    const diff = `--- a/src/foo.js
+++ b/src/foo.js
@@ -1,5 +1,7 @@ function bar
 const x = 1;
+const y = 2;
+const z = 3;
 const w = 4;
--- a/src/bar.js
+++ b/src/bar.js
@@ -10,3 +10,4 @@ class Baz
-old line
+new line`;
    const result = summarizeDiff(diff);
    assert.ok(result.includes("Files changed: 2"));
    assert.ok(result.includes("src/foo.js"));
    assert.ok(result.includes("src/bar.js"));
    assert.ok(result.includes("Lines added: +3"));
    assert.ok(result.includes("Lines removed: -1"));
  });

  it('should extract function hunk context', () => {
    const diff = `--- a/test.js
+++ b/test.js
@@ -5,3 +5,4 @@ function calculateTax
 some change`;
    const result = summarizeDiff(diff);
    assert.ok(result.includes("function calculateTax"));
  });

  it('should handle empty diff', () => {
    const result = summarizeDiff("");
    assert.ok(result.includes("Files changed: 0"));
    assert.ok(result.includes("Lines added: +0"));
    assert.ok(result.includes("Lines removed: -0"));
  });
});
