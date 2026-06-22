# test/profiles.test.js

- kind: js
- lines: 48
- bytes: 1597

## Summary
Test suite for src/profiles.js

## Imports
- `node:test`
- `node:assert`
- `../src/profiles.js`

## Exports
- none

## Source
```js
/**
 * Test suite for src/profiles.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MODEL_ALIASES, PROFILES, resolveProfile } from '../src/profiles.js';

describe('PROFILES', () => {
  it('should keep core provider families', () => {
    assert.ok(PROFILES.claude);
    assert.ok(PROFILES.gpt);
    assert.ok(PROFILES.gemini);
  });

  it('should expose capability matrix in every profile', () => {
    const capabilityFields = [
      'supports_tool_calling',
      'supports_structured_output',
      'supports_prompt_cache',
      'prefers_short_outcome_prompts',
      'needs_tighter_scaffolding',
      'recommended_retry_budget',
      'recommended_compaction_threshold',
      'recommended_output_contract',
    ];

    for (const [key, profile] of Object.entries(PROFILES)) {
      assert.ok(profile.family, `${key} missing family`);
      assert.ok(profile.capabilities, `${key} missing capabilities`);
      for (const field of capabilityFields) {
        assert.notStrictEqual(profile.capabilities[field], undefined, `${key} missing capability field ${field}`);
      }
    }
  });

  it('should resolve model aliases to a profile family', () => {
    assert.strictEqual(MODEL_ALIASES['gpt-5.5'], 'gpt');
    assert.strictEqual(MODEL_ALIASES['glm-5.1'], 'glm');
    assert.strictEqual(MODEL_ALIASES['mimo-v2.5'], 'mimo');
    assert.strictEqual(resolveProfile('opus-4.7').profile.id, 'claude');
  });

  it('should return null for unknown aliases', () => {
    assert.strictEqual(resolveProfile('unknown-model-xyz').profile, null);
  });
});

```
