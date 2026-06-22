import { describe, it } from 'node:test';
import assert from 'node:assert';
import { autoCompactState, clipText, measureStateSize } from '../src/state-compaction.js';

describe('state compaction phase 2', () => {
  it('should clip oversized text predictably', () => {
    const clipped = clipText('x'.repeat(200), 80);
    assert.ok(clipped.length <= 80);
    assert.ok(clipped.includes('[trimmed]'));
  });

  it('should auto-compact large state while preserving recent high-signal entries', () => {
    const huge = {
      objective: 'Implement phase 2 with complete validation and testing',
      constraints: Array.from({ length: 15 }, (_, i) => `constraint-${i} ${'x'.repeat(80)}`),
      decisions: Array.from({ length: 18 }, (_, i) => `decision-${i} ${'y'.repeat(80)}`),
      files_changed: Array.from({ length: 20 }, (_, i) => `src/file-${i}.ts ${'z'.repeat(40)}`),
      next_steps: Array.from({ length: 14 }, (_, i) => `next-step-${i} ${'n'.repeat(70)}`),
      open_questions: Array.from({ length: 12 }, (_, i) => `question-${i} ${'q'.repeat(70)}`),
      risks: Array.from({ length: 14 }, (_, i) => `risk-${i} ${'r'.repeat(70)}`),
      last_error: 'Timeout while validating a long dependency graph',
      compaction_history: [],
      compaction_policy: {
        enabled: true,
        threshold_chars: 1800,
        hard_threshold_chars: 2600,
        preserve_recent_items: 4,
      },
      compaction_meta: {
        auto_compactions: 0,
        last_auto_compaction_at: null,
        last_total_chars: 0,
        last_compacted_chars: 0,
      }
    };

    const before = measureStateSize(huge);
    const result = autoCompactState(huge, {
      autoCompactThresholdChars: 1800,
      autoCompactHardThresholdChars: 2600,
      autoCompactKeepRecentItems: 4,
      autoCompactKeepHardCapItems: 3,
      autoCompactMaxEntryChars: 90,
      autoCompactMaxScalarChars: 140,
    });

    assert.ok(result.applied);
    assert.ok(result.afterSize < before);
    assert.ok(result.event);
    assert.strictEqual(result.event.kind, 'auto-threshold');
    assert.ok(result.state.next_steps.some((entry) => entry.includes('next-step-13')));
    assert.ok(result.state.risks.some((entry) => entry.includes('risk-13')));
    assert.ok(result.state.objective.includes('phase 2'));
    assert.ok(result.state.compaction_meta.auto_compactions >= 1);
  });

  it('should respect disabled policy', () => {
    const state = {
      objective: 'Do not compact',
      constraints: ['a'.repeat(500)],
      decisions: [],
      files_changed: [],
      next_steps: [],
      open_questions: [],
      risks: [],
      last_error: null,
      compaction_policy: {
        enabled: false,
        threshold_chars: 100,
        hard_threshold_chars: 120,
        preserve_recent_items: 2,
      },
      compaction_meta: {
        auto_compactions: 0,
        last_auto_compaction_at: null,
        last_total_chars: 0,
        last_compacted_chars: 0,
      }
    };

    const result = autoCompactState(state, {
      autoCompactThresholdChars: 100,
      autoCompactHardThresholdChars: 120,
      autoCompactKeepRecentItems: 2,
      autoCompactKeepHardCapItems: 2,
      autoCompactMaxEntryChars: 80,
      autoCompactMaxScalarChars: 80,
    });

    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.state.constraints[0].length, 500);
  });
});
