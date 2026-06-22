/**
 * Tests for Fix Issues Command
 * Validates issue classification, root cause analysis, fix proposals, and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyIssueType,
  analyzeRootCause,
  detectAffectedFiles,
  generateFixProposal,
  generateNextSteps,
  parseIssueInput,
  determineVerdict,
  analyzeIssue,
  registerFixIssueTools,
} from '../src/fix-issues.js';

// ─── Mock server ────────────────────────────────────────────────────────────

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

// ─── Registration tests ─────────────────────────────────────────────────────

describe('fix-issue tool registration', () => {
  it('registers fix_issue tool', () => {
    const { server, tools } = createMockServer();
    registerFixIssueTools(server);
    assert.ok(tools.fix_issue, 'Tool should be registered');
    assert.ok(tools.fix_issue.handler, 'Handler should exist');
  });

  it('has correct tool description', () => {
    const { server, tools } = createMockServer();
    registerFixIssueTools(server);
    assert.ok(tools.fix_issue.desc.includes('Diagnoses'), 'Description should mention diagnosis');
  });
});

// ─── Issue classification tests ─────────────────────────────────────────────

describe('Issue classification', () => {
  it('classifies security issues', () => {
    const result = classifyIssueType('SQL injection vulnerability in login endpoint allows unauthorized access');
    assert.equal(result.type, 'security');
    assert.ok(result.confidence > 0, 'Should have non-zero confidence');
    assert.ok(result.signals.length > 0, 'Should have matching signals');
  });

  it('classifies bug issues', () => {
    const result = classifyIssueType('Application crashes when uploading empty file — throws null pointer exception');
    assert.equal(result.type, 'bug');
    assert.ok(result.confidence > 0);
  });

  it('classifies performance issues', () => {
    const result = classifyIssueType('API response time is extremely slow — 5s latency on /users endpoint');
    assert.equal(result.type, 'performance');
    assert.ok(result.confidence > 0);
  });

  it('classifies feature requests', () => {
    const result = classifyIssueType('Feature request: add support for dark mode theme toggle');
    assert.equal(result.type, 'feature');
    assert.ok(result.confidence > 0);
  });

  it('returns default classification for ambiguous text', () => {
    const result = classifyIssueType('something happened today');
    assert.equal(result.type, 'bug');
    assert.equal(result.confidence, 0);
  });

  it('handles empty input', () => {
    const result = classifyIssueType('');
    assert.equal(result.type, 'bug');
    assert.equal(result.confidence, 0);
  });

  it('handles null input', () => {
    const result = classifyIssueType(null);
    assert.equal(result.type, 'bug');
    assert.equal(result.confidence, 0);
  });

  it('prefers security over bug when both match', () => {
    const result = classifyIssueType('Security vulnerability causes crash and error in auth bypass');
    assert.equal(result.type, 'security');
  });
});

// ─── Root cause analysis tests ──────────────────────────────────────────────

describe('Root cause analysis', () => {
  it('detects race conditions', () => {
    const result = analyzeRootCause('Race condition when two users edit the same record concurrently');
    assert.ok(result.cause.includes('Race condition'), `Got: ${result.cause}`);
    assert.ok(result.patterns.length > 0);
  });

  it('detects input validation issues', () => {
    const result = analyzeRootCause('Missing input validation on the search parameter');
    assert.ok(result.cause.includes('validation'), `Got: ${result.cause}`);
  });

  it('detects null handling issues', () => {
    const result = analyzeRootCause('Error when user profile has null field');
    assert.ok(result.cause.includes('Null') || result.cause.includes('null'), `Got: ${result.cause}`);
  });

  it('detects config issues', () => {
    const result = analyzeRootCause('App fails to start with wrong environment config');
    assert.ok(result.cause.includes('Configuration') || result.cause.includes('config'), `Got: ${result.cause}`);
  });

  it('returns unknown cause for unmatched text', () => {
    const result = analyzeRootCause('The thing is broken');
    assert.ok(result.cause.includes('No clear root cause') || result.cause.includes('Unable'), `Got: ${result.cause}`);
  });

  it('handles empty input', () => {
    const result = analyzeRootCause('');
    assert.ok(result.cause.length > 0);
  });
});

// ─── Affected files detection tests ─────────────────────────────────────────

describe('Affected files detection', () => {
  it('detects file references in text', () => {
    const result = detectAffectedFiles('Error in src/auth/login.js when calling lib/utils.js');
    assert.ok(result.includes('src/auth/login.js'), `Got: ${JSON.stringify(result)}`);
    assert.ok(result.includes('lib/utils.js'), `Got: ${JSON.stringify(result)}`);
  });

  it('deduplicates file references', () => {
    const result = detectAffectedFiles('Bug in src/app.js — see src/app.js for details');
    assert.equal(result.length, 1);
  });

  it('returns empty for no file references', () => {
    const result = detectAffectedFiles('Just a regular issue with no paths');
    assert.deepEqual(result, []);
  });

  it('handles null input', () => {
    assert.deepEqual(detectAffectedFiles(null), []);
  });
});

// ─── Fix proposal generation tests ──────────────────────────────────────────

describe('Fix proposal generation', () => {
  it('generates security fix', () => {
    const result = generateFixProposal('security', 'Missing or insufficient input validation', '');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  it('generates bug fix', () => {
    const result = generateFixProposal('bug', 'Null/undefined value not handled', '');
    assert.ok(result.length > 0);
  });

  it('generates performance fix', () => {
    const result = generateFixProposal('performance', 'Network connectivity issue', '');
    assert.ok(result.length > 0);
  });

  it('generates feature fix', () => {
    const result = generateFixProposal('feature', null, '');
    assert.ok(result.length > 0);
  });

  it('includes regression test suggestion when tests mentioned', () => {
    const result = generateFixProposal('bug', 'Some cause', 'We need a test for this');
    assert.ok(result.includes('regression test'), `Got: ${result}`);
  });

  it('includes error boundary suggestion for error-related issues', () => {
    const result = generateFixProposal('bug', 'Some cause', 'Application throws exception');
    assert.ok(result.includes('error boundary'), `Got: ${result}`);
  });
});

// ─── Next steps generation tests ────────────────────────────────────────────

describe('Next steps generation', () => {
  it('includes low-confidence warning', () => {
    const steps = generateNextSteps('bug', 20);
    assert.ok(steps.some((s) => s.includes('more details')), `Got: ${JSON.stringify(steps)}`);
  });

  it('includes security-specific steps', () => {
    const steps = generateNextSteps('security', 80);
    assert.ok(steps.some((s) => s.includes('security audit')), `Got: ${JSON.stringify(steps)}`);
  });

  it('includes bug-specific steps', () => {
    const steps = generateNextSteps('bug', 80);
    assert.ok(steps.some((s) => s.includes('regression test')), `Got: ${JSON.stringify(steps)}`);
  });

  it('includes performance-specific steps', () => {
    const steps = generateNextSteps('performance', 80);
    assert.ok(steps.some((s) => s.includes('Benchmark')), `Got: ${JSON.stringify(steps)}`);
  });

  it('always includes review and branch steps', () => {
    const steps = generateNextSteps('feature', 80);
    assert.ok(steps.some((s) => s.includes('Review affected files')));
    assert.ok(steps.some((s) => s.includes('feature branch')));
  });
});

// ─── Issue parsing tests ────────────────────────────────────────────────────

describe('Issue parsing', () => {
  it('parses plain number', () => {
    const result = parseIssueInput('42');
    assert.equal(result.valid, true);
    assert.equal(result.number, 42);
    assert.equal(result.source, 'number');
  });

  it('parses number with hash prefix', () => {
    const result = parseIssueInput('#42');
    assert.equal(result.valid, true);
    assert.equal(result.number, 42);
  });

  it('parses GitHub URL', () => {
    const result = parseIssueInput('https://github.com/owner/repo/issues/123');
    assert.equal(result.valid, true);
    assert.equal(result.number, 123);
    assert.equal(result.owner, 'owner');
    assert.equal(result.repo, 'repo');
    assert.equal(result.source, 'url');
  });

  it('rejects invalid input', () => {
    const result = parseIssueInput('not-an-issue');
    assert.equal(result.valid, false);
    assert.ok(result.error.length > 0);
  });

  it('rejects empty input', () => {
    assert.equal(parseIssueInput('').valid, false);
  });

  it('rejects null input', () => {
    assert.equal(parseIssueInput(null).valid, false);
  });
});

// ─── Verdict determination tests ────────────────────────────────────────────

describe('Verdict determination', () => {
  it('returns HALT for high-confidence security', () => {
    assert.equal(determineVerdict('security', 80), 'HALT');
  });

  it('returns WARN for low-confidence security', () => {
    assert.equal(determineVerdict('security', 30), 'WARN');
  });

  it('returns WARN for high-confidence bug', () => {
    assert.equal(determineVerdict('bug', 80), 'WARN');
  });

  it('returns WARN for performance', () => {
    assert.equal(determineVerdict('performance', 60), 'WARN');
  });

  it('returns PASS for feature', () => {
    assert.equal(determineVerdict('feature', 90), 'PASS');
  });

  it('returns PASS for low-confidence bug', () => {
    assert.equal(determineVerdict('bug', 30, 'unknown'), 'PASS');
  });
});

// ─── Full pipeline tests ────────────────────────────────────────────────────

describe('Full issue analysis pipeline', () => {
  it('analyzes a security issue end-to-end', () => {
    const result = analyzeIssue(
      'SQL injection vulnerability in src/api/users.js allows unauthorized access',
      '42'
    );
    assert.equal(result.verdict, 'HALT');
    assert.equal(result.issue_type, 'security');
    assert.ok(result.root_cause.length > 0);
    assert.ok(typeof result.proposed_fix === 'string');
    assert.ok(typeof result.confidence === 'number');
    assert.ok(Array.isArray(result.next_steps));
    assert.ok(Array.isArray(result.affected_files));
  });

  it('analyzes a bug end-to-end', () => {
    const result = analyzeIssue(
      'Application crashes with error when uploading empty file',
      '15'
    );
    assert.equal(result.issue_type, 'bug');
    assert.ok(['PASS', 'WARN', 'HALT'].includes(result.verdict));
  });

  it('handles invalid issue input', () => {
    const result = analyzeIssue('Some text', 'not-a-valid-issue');
    assert.equal(result.verdict, 'HALT');
    assert.equal(result.issue_type, 'unknown');
    assert.ok(result.root_cause.includes('Invalid'));
  });

  it('handles GitHub URL input', () => {
    const result = analyzeIssue(
      'Performance degradation — slow API response times',
      'https://github.com/org/project/issues/77'
    );
    assert.equal(result.issue_type, 'performance');
    assert.ok(result.confidence > 0);
  });
});

// ─── Tool handler tests ─────────────────────────────────────────────────────

describe('Tool handler', () => {
  it('returns structured response for valid issue', async () => {
    const { server, tools } = createMockServer();
    registerFixIssueTools(server);

    const result = await tools.fix_issue.handler({ issue: '42' });
    assert.ok(result.content, 'Should have content');
    assert.ok(result.content[0].text, 'Should have text');
    assert.ok(result.fixReport, 'Should have fixReport');
    assert.ok(['PASS', 'WARN', 'HALT'].includes(result.fixReport.verdict));
  });

  it('returns HALT for invalid issue input', async () => {
    const { server, tools } = createMockServer();
    registerFixIssueTools(server);

    const result = await tools.fix_issue.handler({ issue: 'invalid' });
    assert.ok(result.content[0].text.includes('HALT'), `Got: ${result.content[0].text}`);
  });

  it('includes repo in output when provided', async () => {
    const { server, tools } = createMockServer();
    registerFixIssueTools(server);

    const result = await tools.fix_issue.handler({ issue: '42', repo: 'owner/repo' });
    assert.ok(result.content[0].text.includes('owner/repo'), 'Should include repo');
  });

  it('derives repo from URL', async () => {
    const { server, tools } = createMockServer();
    registerFixIssueTools(server);

    const result = await tools.fix_issue.handler({
      issue: 'https://github.com/owner/repo/issues/99',
    });
    assert.ok(result.content[0].text.includes('owner/repo'), 'Should derive repo from URL');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('classifies unknown type gracefully', () => {
    const result = classifyIssueType('12345 just a number');
    assert.ok(['bug', 'feature', 'security', 'performance'].includes(result.type));
  });

  it('handles very long issue text', () => {
    const longText = 'bug '.repeat(1000) + 'crash error failure';
    const result = classifyIssueType(longText);
    assert.equal(result.type, 'bug');
    assert.ok(result.confidence > 0);
  });

  it('handles special characters in issue text', () => {
    const result = analyzeIssue('<script>alert("xss")</script> in src/app.js', '1');
    assert.equal(result.issue_type, 'security');
    assert.ok(Array.isArray(result.affected_files));
  });

  it('returns empty affected files when none referenced', () => {
    const result = detectAffectedFiles('No file paths mentioned here');
    assert.deepEqual(result, []);
  });
});
