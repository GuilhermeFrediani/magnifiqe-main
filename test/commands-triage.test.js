/**
 * Test suite for issue triage tool
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { triageIssue } from '../src/commands/triage.js';

// ─── Priority Classification ─────────────────────────────────────────────────

describe('Priority Classification', () => {
  it('should classify P0-critical for emergency keywords', () => {
    const result = triageIssue('Production is down — critical outage', 'All services affected, data loss suspected');
    const priority = result.suggested_labels.find(l => l.label.startsWith('P'));
    assert.strictEqual(priority.label, 'P0-critical');
    assert.ok(priority.confidence >= 0.5, 'Should have meaningful confidence for P0');
  });

  it('should classify P1-high for high-priority signals', () => {
    const result = triageIssue('High priority: breaking change in auth module', 'Significant impact on all users');
    const priority = result.suggested_labels.find(l => l.label.startsWith('P'));
    assert.strictEqual(priority.label, 'P1-high');
  });

  it('should classify P1-high for security issues as fallback', () => {
    const result = triageIssue('Security: potential data exposure', 'We found a vulnerability in the login flow');
    const priority = result.suggested_labels.find(l => l.label.startsWith('P'));
    assert.strictEqual(priority.label, 'P1-high');
  });

  it('should classify P2-medium as default', () => {
    const result = triageIssue('Something is weird with the form', '');
    const priority = result.suggested_labels.find(l => l.label.startsWith('P'));
    assert.strictEqual(priority.label, 'P2-medium');
  });

  it('should classify P3-low for cosmetic issues', () => {
    const result = triageIssue('Minor: typo in welcome message', 'Nice-to-have: change button color');
    const priority = result.suggested_labels.find(l => l.label.startsWith('P'));
    assert.strictEqual(priority.label, 'P3-low');
  });

  it('should detect explicit severity labels', () => {
    const result = triageIssue('SEV-0: Complete system failure', '');
    const priority = result.suggested_labels.find(l => l.label.startsWith('P'));
    assert.strictEqual(priority.label, 'P0-critical');
  });
});

// ─── Type Classification ─────────────────────────────────────────────────────

describe('Type Classification', () => {
  it('should classify as bug when error signals present', () => {
    const result = triageIssue('Login crashes with TypeError', 'Steps to reproduce: click login button, get exception');
    const type = result.suggested_labels.find(l => ['bug', 'feature', 'security', 'performance', 'documentation'].includes(l.label));
    assert.strictEqual(type.label, 'bug');
  });

  it('should classify as feature for feature requests', () => {
    const result = triageIssue('Feature request: add dark mode', 'It would be nice if the app supported dark theme');
    const type = result.suggested_labels.find(l => ['bug', 'feature', 'security', 'performance', 'documentation'].includes(l.label));
    assert.strictEqual(type.label, 'feature');
  });

  it('should classify as security for vulnerability reports', () => {
    const result = triageIssue('Security vulnerability in auth token handling', 'CVE-2024-XXXX: token leak allows unauthorized access');
    const type = result.suggested_labels.find(l => ['bug', 'feature', 'security', 'performance', 'documentation'].includes(l.label));
    assert.strictEqual(type.label, 'security');
  });

  it('should classify as performance for speed issues', () => {
    const result = triageIssue('API response time is too slow', 'Load time exceeds 5 seconds, high CPU usage');
    const type = result.suggested_labels.find(l => ['bug', 'feature', 'security', 'performance', 'documentation'].includes(l.label));
    assert.strictEqual(type.label, 'performance');
  });

  it('should classify as documentation for doc issues', () => {
    const result = triageIssue('Outdated README instructions', 'The docs are missing information about the new API');
    const type = result.suggested_labels.find(l => ['bug', 'feature', 'security', 'performance', 'documentation'].includes(l.label));
    assert.strictEqual(type.label, 'documentation');
  });

  it('should default to bug when no clear type signals', () => {
    const result = triageIssue('The thing', 'Something happened');
    const type = result.suggested_labels.find(l => ['bug', 'feature', 'security', 'performance', 'documentation'].includes(l.label));
    assert.strictEqual(type.label, 'bug');
  });
});

// ─── Scope Classification ────────────────────────────────────────────────────

describe('Scope Classification', () => {
  it('should detect frontend scope', () => {
    const result = triageIssue('CSS layout broken on mobile', 'The responsive design is not working on viewport below 768px');
    const scope = result.suggested_labels.find(l => ['frontend', 'backend', 'infra', 'tooling', 'docs'].includes(l.label));
    assert.strictEqual(scope.label, 'frontend');
  });

  it('should detect backend scope', () => {
    const result = triageIssue('API endpoint returns 500', 'The /api/users route is failing with a database error');
    const scope = result.suggested_labels.find(l => ['frontend', 'backend', 'infra', 'tooling', 'docs'].includes(l.label));
    assert.strictEqual(scope.label, 'backend');
  });

  it('should detect infra scope', () => {
    const result = triageIssue('Docker container keeps restarting', 'Kubernetes pod crash loop in production cluster');
    const scope = result.suggested_labels.find(l => ['frontend', 'backend', 'infra', 'tooling', 'docs'].includes(l.label));
    assert.strictEqual(scope.label, 'infra');
  });

  it('should detect tooling scope', () => {
    const result = triageIssue('ESLint config is broken', 'The linter and formatter are not working after upgrade');
    const scope = result.suggested_labels.find(l => ['frontend', 'backend', 'infra', 'tooling', 'docs'].includes(l.label));
    assert.strictEqual(scope.label, 'tooling');
  });
});

// ─── Label Suggestion Logic ──────────────────────────────────────────────────

describe('Label Suggestion Logic', () => {
  it('should always include needs-triage for new issues', () => {
    const result = triageIssue('Some issue', '');
    const hasNeedsTriage = result.suggested_labels.some(l => l.label === 'needs-triage');
    assert.ok(hasNeedsTriage, 'New issues should get needs-triage label');
  });

  it('should not duplicate needs-triage if already applied', () => {
    const result = triageIssue('Some issue', '', ['needs-triage']);
    const needsTriageCount = result.suggested_labels.filter(l => l.label === 'needs-triage').length;
    assert.strictEqual(needsTriageCount, 0, 'Should not re-suggest needs-triage if already present');
  });

  it('should skip needs-triage if confirmed is already applied', () => {
    const result = triageIssue('Some issue', '', ['confirmed']);
    const hasNeedsTriage = result.suggested_labels.some(l => l.label === 'needs-triage');
    assert.ok(!hasNeedsTriage, 'Should not suggest needs-triage when confirmed');
  });

  it('should list missing labels (suggested but not applied)', () => {
    const result = triageIssue('Critical production bug', 'The login is broken', ['bug']);
    assert.ok(result.missing_labels.length > 0, 'Should have missing labels');
    assert.ok(result.missing_labels.includes('P0-critical') || result.missing_labels.includes('P1-high'),
      'Should suggest a priority label');
  });

  it('should track existing labels', () => {
    const result = triageIssue('Bug report', '', ['bug', 'backend']);
    assert.deepStrictEqual(result.existing_labels, ['bug', 'backend']);
  });

  it('should compute confidence scores between 0 and 1', () => {
    const result = triageIssue('Critical security vulnerability', 'Production data breach detected');
    for (const label of result.suggested_labels) {
      assert.ok(label.confidence >= 0 && label.confidence <= 1,
        `Confidence for ${label.label} should be 0-1, got ${label.confidence}`);
    }
  });

  it('should include reason strings for each suggested label', () => {
    const result = triageIssue('Some issue with detailed body', 'The API is returning errors intermittently');
    for (const label of result.suggested_labels) {
      assert.ok(typeof label.reason === 'string' && label.reason.length > 0,
        `Label ${label.label} should have a non-empty reason`);
    }
  });
});

// ─── Output Format ───────────────────────────────────────────────────────────

describe('Output Format', () => {
  it('should return verdict as PASS, WARN, or HALT', () => {
    const result = triageIssue('Any issue', '');
    assert.ok(['PASS', 'WARN', 'HALT'].includes(result.verdict),
      `Verdict should be PASS/WARN/HALT, got ${result.verdict}`);
  });

  it('should have all required fields', () => {
    const result = triageIssue('Test issue', 'Body text');
    assert.ok('verdict' in result, 'Missing verdict field');
    assert.ok('suggested_labels' in result, 'Missing suggested_labels field');
    assert.ok('existing_labels' in result, 'Missing existing_labels field');
    assert.ok('missing_labels' in result, 'Missing missing_labels field');
    assert.ok('triage_notes' in result, 'Missing triage_notes field');
  });

  it('should have correct structure for each suggested label', () => {
    const result = triageIssue('Critical bug in frontend', 'UI crash on load');
    for (const label of result.suggested_labels) {
      assert.ok('label' in label, 'Label entry missing label field');
      assert.ok('confidence' in label, 'Label entry missing confidence field');
      assert.ok('reason' in label, 'Label entry missing reason field');
      assert.strictEqual(typeof label.label, 'string');
      assert.strictEqual(typeof label.confidence, 'number');
      assert.strictEqual(typeof label.reason, 'string');
    }
  });

  it('should return triage_notes as a string', () => {
    const result = triageIssue('Issue', '');
    assert.strictEqual(typeof result.triage_notes, 'string');
    assert.ok(result.triage_notes.length > 0, 'Triage notes should not be empty');
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle empty title gracefully', () => {
    const result = triageIssue('', '');
    assert.strictEqual(result.verdict, 'WARN');
    assert.deepStrictEqual(result.suggested_labels, []);
    assert.ok(result.triage_notes.includes('title is empty'));
  });

  it('should handle whitespace-only title', () => {
    const result = triageIssue('   ', '');
    assert.strictEqual(result.verdict, 'WARN');
    assert.deepStrictEqual(result.suggested_labels, []);
  });

  it('should handle null/undefined body', () => {
    const result = triageIssue('Some title', undefined);
    assert.ok(result.suggested_labels.length > 0, 'Should still classify with undefined body');
  });

  it('should handle ambiguous content with mixed signals', () => {
    const result = triageIssue('Bug or feature? Maybe both', 'This is weird but also could be an enhancement');
    // Should still produce a classification (not crash)
    assert.ok(result.suggested_labels.length > 0, 'Should produce labels even for ambiguous content');
    assert.ok(['PASS', 'WARN', 'HALT'].includes(result.verdict));
  });

  it('should handle very long issue text', () => {
    const longBody = 'This is a critical issue. '.repeat(100);
    const result = triageIssue('Important bug', longBody);
    assert.ok(result.suggested_labels.length > 0);
    assert.ok(result.verdict === 'PASS' || result.verdict === 'WARN');
  });

  it('should handle special characters in title', () => {
    const result = triageIssue('Bug: <script>alert("xss")</script> in title', '');
    assert.ok(result.suggested_labels.length > 0, 'Should handle special characters');
  });

  it('should not re-suggest labels that are already applied', () => {
    const result = triageIssue('Critical security bug', '', ['P0-critical', 'security', 'needs-triage', 'bug', 'backend']);
    for (const applied of ['P0-critical', 'security', 'needs-triage', 'bug', 'backend']) {
      assert.ok(!result.missing_labels.includes(applied), `${applied} should not be in missing_labels`);
    }
  });

  it('should handle case-insensitive existing labels', () => {
    const result = triageIssue('Bug report', '', ['BUG', 'Backend']);
    assert.deepStrictEqual(result.existing_labels, ['bug', 'backend']);
  });

  it('should produce higher confidence for more specific titles', () => {
    const vague = triageIssue('Problem', '');
    const specific = triageIssue('Critical: production database connection pool exhausted, all API endpoints down', 'Data loss suspected. P0 severity. No workaround available.');
    const vaguePriority = vague.suggested_labels.find(l => l.label.startsWith('P'));
    const specificPriority = specific.suggested_labels.find(l => l.label.startsWith('P'));
    assert.ok(specificPriority.confidence > vaguePriority.confidence,
      'Specific title should have higher confidence than vague title');
  });
});
