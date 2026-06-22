/**
 * Test suite for src/prompt-conventions.js
 * Tests: RFC 2119 keyword mapping, structural tag parsing, placement rules, density validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  RFC_SHORTCUTS,
  RFC_MEANINGS,
  STRUCTURAL_TAGS,
  ORNAMENTAL_TAGS,
  DENSITY_MAX_WORDS,
  DENSITY_MIN_CONTENT,
  checkCriticalPlacement,
  validateDensity,
  validateRFC2119Compliance,
  validateStructuralTags,
  analyzePromptConventions,
} from '../src/prompt-conventions.js';

// ─── RFC 2119 Keywords ────────────────────────────────────────────────────────

describe('RFC 2119 Keywords', () => {
  it('should export RFC_SHORTCUTS with all required keywords', () => {
    assert.ok(RFC_SHORTCUTS.NEVER, 'NEVER should be defined');
    assert.ok(RFC_SHORTCUTS.AVOID, 'AVOID should be defined');
    assert.ok(RFC_SHORTCUTS.MUST, 'MUST should be defined');
    assert.ok(RFC_SHORTCUTS.SHOULD, 'SHOULD should be defined');
    assert.ok(RFC_SHORTCUTS.MAY, 'MAY should be defined');
  });

  it('should map NEVER to MUST NOT', () => {
    assert.strictEqual(RFC_SHORTCUTS.NEVER, 'MUST NOT');
  });

  it('should map AVOID to SHOULD NOT', () => {
    assert.strictEqual(RFC_SHORTCUTS.AVOID, 'SHOULD NOT');
  });

  it('should export RFC_MEANINGS with descriptions', () => {
    assert.ok(RFC_MEANINGS.MUST, 'MUST should have meaning');
    assert.ok(RFC_MEANINGS.NEVER, 'NEVER should have meaning');
    assert.ok(RFC_MEANINGS.SHOULD, 'SHOULD should have meaning');
    assert.ok(RFC_MEANINGS.AVOID, 'AVOID should have meaning');
    assert.ok(RFC_MEANINGS.MAY, 'MAY should have meaning');
  });
});

// ─── Structural Tags ──────────────────────────────────────────────────────────

describe('Structural Tags', () => {
  it('should export STRUCTURAL_TAGS with all required tags', () => {
    assert.ok(STRUCTURAL_TAGS['<critical>'], '<critical> should be defined');
    assert.ok(STRUCTURAL_TAGS['<workflow>'], '<workflow> should be defined');
    assert.ok(STRUCTURAL_TAGS['<completeness>'], '<completeness> should be defined');
    assert.ok(STRUCTURAL_TAGS['<yielding>'], '<yielding> should be defined');
    assert.ok(STRUCTURAL_TAGS['<anti-patterns>'], '<anti-patterns> should be defined');
    assert.ok(STRUCTURAL_TAGS['<decision>'], '<decision> should be defined');
  });

  it('should have at least 6 structural tags', () => {
    assert.ok(Object.keys(STRUCTURAL_TAGS).length >= 6, 'Should have at least 6 structural tags');
  });

  it('should export ORNAMENTAL_TAGS as array', () => {
    assert.ok(Array.isArray(ORNAMENTAL_TAGS), 'ORNAMENTAL_TAGS should be an array');
    assert.ok(ORNAMENTAL_TAGS.length > 0, 'ORNAMENTAL_TAGS should not be empty');
  });

  it('should contain <north-star> in ORNAMENTAL_TAGS', () => {
    assert.ok(ORNAMENTAL_TAGS.includes('<north-star>'), '<north-star> should be ornamental');
  });
});

// ─── Density Rules ────────────────────────────────────────────────────────────

describe('Density Rules', () => {
  it('should export DENSITY_MAX_WORDS as 12', () => {
    assert.strictEqual(DENSITY_MAX_WORDS, 12);
  });

  it('should export DENSITY_MIN_CONTENT as 3', () => {
    assert.strictEqual(DENSITY_MIN_CONTENT, 3);
  });
});

// ─── Critical Placement ───────────────────────────────────────────────────────

describe('checkCriticalPlacement', () => {
  it('should return balanced=true when <critical> at start and </critical> at end', () => {
    const text = `<critical>
Rule 1: MUST NOT do this.
Rule 2: NEVER do that.
</critical>`;
    const result = checkCriticalPlacement(text);
    assert.strictEqual(result.balanced, true);
    assert.strictEqual(result.hasStart, true);
    assert.strictEqual(result.hasEnd, true);
  });

  it('should return balanced=false when <critical> only at start', () => {
    const text = `<critical>
Rule 1: MUST NOT do this.
Rule 2: NEVER do that.`;
    const result = checkCriticalPlacement(text);
    assert.strictEqual(result.balanced, false);
    assert.strictEqual(result.hasStart, true);
    assert.strictEqual(result.hasEnd, false);
  });

  it('should return balanced=false when <critical> missing', () => {
    const text = `Rule 1: MUST NOT do this.
Rule 2: NEVER do that.`;
    const result = checkCriticalPlacement(text);
    assert.strictEqual(result.balanced, false);
    assert.strictEqual(result.hasStart, false);
    assert.strictEqual(result.hasEnd, false);
  });

  it('should handle empty or short text', () => {
    const result = checkCriticalPlacement('');
    assert.strictEqual(result.balanced, false);
    assert.strictEqual(result.hasStart, false);
    assert.strictEqual(result.hasEnd, false);
  });

  it('should handle text with <critical> in middle', () => {
    const text = `Header line.
<critical>
Rule 1: MUST NOT do this.
</critical>`;
    const result = checkCriticalPlacement(text);
    assert.strictEqual(result.balanced, false);
    assert.strictEqual(result.hasStart, false);
    assert.strictEqual(result.hasEnd, true);
  });
});

// ─── Density Validation ───────────────────────────────────────────────────────

describe('validateDensity', () => {
  it('should return no violations for well-formed bullets', () => {
    const text = `- Use semantic HTML.
- Avoid div soup.
- Prefer structured logging.`;
    const result = validateDensity(text);
    assert.strictEqual(result.violations.length, 0);
  });

  it('should detect bullets exceeding max words', () => {
    const text = `- This is a very long bullet point that exceeds the maximum word count limit`;
    const result = validateDensity(text);
    assert.ok(result.violations.length > 0, 'Should detect violation');
    assert.ok(result.violations[0].issue.includes('exceeds'), 'Should mention exceeds');
  });

  it('should detect bullets with too few words', () => {
    const text = `- OK`;
    const result = validateDensity(text);
    assert.ok(result.violations.length > 0, 'Should detect violation');
    assert.ok(result.violations[0].issue.includes('fewer'), 'Should mention fewer');
  });

  it('should detect filler phrases', () => {
    const text = `- Just use semantic HTML`;
    const result = validateDensity(text);
    assert.ok(result.violations.length > 0, 'Should detect filler phrase');
  });
  it('should skip headers and empty lines', () => {
    const text = `# Header

- Good bullet point.
`;
    const result = validateDensity(text);
    assert.strictEqual(result.violations.length, 0);
  });

});

// ─── RFC 2119 Compliance ──────────────────────────────────────────────────────

describe('validateRFC2119Compliance', () => {
  it('should detect informal language patterns', () => {
    const text = `- Do not do this.
- Don't do that.
- Always use this.`;
    const result = validateRFC2119Compliance(text);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.issues.length > 0, 'Should detect informal patterns');
  });

  it('should detect informal "do not"', () => {
    const text = `- Do not do this.`;
    const result = validateRFC2119Compliance(text);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.issues.length > 0);
    assert.strictEqual(result.issues[0].suggestion, 'NEVER');
  });

  it('should detect informal "don\'t"', () => {
    const text = `- Don't do this.`;
    const result = validateRFC2119Compliance(text);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.issues.length > 0);
    assert.strictEqual(result.issues[0].suggestion, 'NEVER');
  });

  it('should detect informal "always"', () => {
    const text = `- Always use this.`;
    const result = validateRFC2119Compliance(text);
    assert.strictEqual(result.compliant, false);
    assert.ok(result.issues.length > 0);
    assert.strictEqual(result.issues[0].suggestion, 'MUST');
  });

  it('should skip markdown headers', () => {
    const text = `# This is a header with do not`;
    const result = validateRFC2119Compliance(text);
    assert.strictEqual(result.compliant, true);
  });

  it('should skip blockquotes', () => {
    const text = `> This is a blockquote with do not`;
    const result = validateRFC2119Compliance(text);
    assert.strictEqual(result.compliant, true);
  });
});

// ─── Structural Tags Validation ───────────────────────────────────────────────

describe('validateStructuralTags', () => {
  it('should return valid=true for clean text', () => {
    const text = `- Use MUST keyword.
- Avoid div soup.`;
    const result = validateStructuralTags(text);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.issues.length, 0);
  });

  it('should detect ornamental tags', () => {
    const text = `<north-star>
Rule 1.
</north-star>`;
    const result = validateStructuralTags(text);
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues[0].tag.includes('north-star'));
  });

  it('should detect unbalanced tags', () => {
    const text = `<critical>
Rule 1.
Rule 2.`;
    const result = validateStructuralTags(text);
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues[0].issue.includes('Unbalanced'));
  });

  it('should allow valid structural tags', () => {
    const text = `<critical>
Rule 1: NEVER do this.
</critical>`;
    const result = validateStructuralTags(text);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.issues.length, 0);
  });
});

// ─── Full Analysis ────────────────────────────────────────────────────────────

describe('analyzePromptConventions', () => {
  it('should return passed=true for fully compliant text', () => {
    const text = `<critical>
- MUST use semantic HTML.
- NEVER use div soup.
- USE structured logging.
</critical>`;
    const result = analyzePromptConventions(text);
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.critical.balanced, true);
    assert.strictEqual(result.density.violations.length, 0);
    assert.strictEqual(result.rfc.compliant, true);
    assert.strictEqual(result.tags.valid, true);
  });

  it('should return passed=false when critical not balanced', () => {
    const text = `- MUST use semantic HTML.
- NEVER use div soup.`;
    const result = analyzePromptConventions(text);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.critical.balanced, false);
  });

  it('should return passed=false when RFC non-compliant', () => {
    const text = `<critical>
- Do not use div soup.
</critical>`;
    const result = analyzePromptConventions(text);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.rfc.compliant, false);
  });

  it('should return passed=false when ornamental tags present', () => {
    const text = `<north-star>
Rule 1: MUST do this.
</north-star>`;
    const result = analyzePromptConventions(text);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.tags.valid, false);
  });
});
