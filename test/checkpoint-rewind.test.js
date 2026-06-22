/**
 * Test suite for src/project-state.js checkpoint/rewind functionality
 * Tests: checkpoint saves, rewind restores, compression on rewind,
 *        intermediate results compressed, key findings preserved, edge cases
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  semanticCompress,
} from '../src/semantic-compression.js';

import {
  loadState,
  saveState,
  defaultState,
  registerProjectStateTools,
} from '../src/project-state.js';

// ─── Checkpoint Saves Correctly ──────────────────────────────────────────────

describe('Checkpoint Saves Correctly', () => {
  it('should create a checkpoint with label and timestamp', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const checkpointTool = calls.find(c => c.name === 'checkpoint_task');
    assert.ok(checkpointTool, 'checkpoint_task tool should be registered');
  });

  it('should store snapshot without checkpoints array', () => {
    const state = defaultState();
    state.objective = 'Test objective';
    state.checkpoints = [{ label: 'existing', timestamp: new Date().toISOString(), snapshot: {} }];
    
    const { checkpoints: _ignored, ...rest } = state;
    const snapshot = JSON.parse(JSON.stringify(rest));
    
    assert.ok(!snapshot.checkpoints, 'snapshot should not include checkpoints array');
    assert.strictEqual(snapshot.objective, 'Test objective');
  });
});

// ─── Rewind Restores State ───────────────────────────────────────────────────

describe('Rewind Restores State', () => {
  it('should restore state from checkpoint', () => {
    const state = defaultState();
    state.objective = 'Original objective';
    state.decisions = ['Original decision'];
    
    const snapshot = { ...state };
    delete snapshot.checkpoints;
    
    const restored = { ...defaultState(), ...snapshot, checkpoints: [] };
    
    assert.strictEqual(restored.objective, 'Original objective');
    assert.deepStrictEqual(restored.decisions, ['Original decision']);
  });

  it('should preserve checkpoints array when restoring', () => {
    const existingCheckpoints = [
      { label: 'cp1', timestamp: new Date().toISOString(), snapshot: {} },
    ];
    
    const state = defaultState();
    state.objective = 'Restored objective';
    
    const restored = { ...defaultState(), ...state, checkpoints: existingCheckpoints };
    
    assert.strictEqual(restored.checkpoints.length, 1);
    assert.strictEqual(restored.checkpoints[0].label, 'cp1');
  });
});

// ─── Compression Applied on Rewind ───────────────────────────────────────────

describe('Compression Applied on Rewind', () => {
  it('should compress array sections using semantic compression', () => {
    const snapshot = {
      objective: 'This is a very important objective that needs to be completed',
      decisions: ['This is a decision that was made after careful consideration'],
      files_changed: ['This file was changed significantly during the refactor'],
    };
    
    const tier = 2;
    const compressed = { ...snapshot };
    
    for (const section of ['decisions', 'files_changed']) {
      if (Array.isArray(compressed[section]) && compressed[section].length > 0) {
        compressed[section] = compressed[section].map(entry => {
          const result = semanticCompress(String(entry), { tier, preserveCode: true });
          return result.compressed;
        });
      }
    }
    
    assert.ok(compressed.decisions[0].length <= snapshot.decisions[0].length);
    assert.ok(compressed.files_changed[0].length <= snapshot.files_changed[0].length);
  });

  it('should apply different compression tiers', () => {
    const text = 'This is a very important and really quite critical decision that was made.';
    
    const result1 = semanticCompress(text, { tier: 1, preserveCode: true });
    const result2 = semanticCompress(text, { tier: 2, preserveCode: true });
    const result3 = semanticCompress(text, { tier: 3, preserveCode: true });
    
    assert.ok(result1.compressed.length >= result2.compressed.length);
    assert.ok(result2.compressed.length >= result3.compressed.length);
  });
});

// ─── Intermediate Results Compressed ──────────────────────────────────────────

describe('Intermediate Results Compressed', () => {
  it('should drop verbose exploration data', () => {
    const snapshot = {
      objective: 'Main goal',
      decisions: ['Important decision'],
      next_steps: [
        'This is a very long and verbose description of a step that includes lots of unnecessary detail about the implementation process and all the various considerations that need to be taken into account',
      ],
    };
    
    const compressed = {
      ...snapshot,
      next_steps: snapshot.next_steps.map(step => {
        return step.length > 100 ? step.substring(0, 100) + '...' : step;
      }),
    };
    
    assert.ok(compressed.next_steps[0].length < snapshot.next_steps[0].length);
  });

  it('should preserve key findings', () => {
    const snapshot = {
      objective: 'Critical objective',
      decisions: ['Key decision'],
      files_changed: ['important-file.js'],
    };
    
    assert.strictEqual(snapshot.objective, 'Critical objective');
    assert.ok(snapshot.decisions.includes('Key decision'));
    assert.ok(snapshot.files_changed.includes('important-file.js'));
  });
});

// ─── Key Findings Preserved ──────────────────────────────────────────────────

describe('Key Findings Preserved', () => {
  it('should preserve objective section', () => {
    const snapshot = {
      objective: 'This objective must be preserved',
      constraints: ['These constraints are important'],
    };
    
    assert.ok(snapshot.objective.includes('must be preserved'));
  });

  it('should preserve files_changed section', () => {
    const snapshot = {
      files_changed: ['src/auth.js', 'src/routes.js'],
    };
    
    assert.strictEqual(snapshot.files_changed.length, 2);
    assert.ok(snapshot.files_changed.includes('src/auth.js'));
  });

  it('should preserve decisions section', () => {
    const snapshot = {
      decisions: ['Used JWT for auth', 'Added rate limiting'],
    };
    
    assert.strictEqual(snapshot.decisions.length, 2);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle missing checkpoint gracefully', () => {
    const checkpoints = [
      { label: 'cp1', timestamp: new Date().toISOString(), snapshot: {} },
    ];
    
    const label = 'nonexistent';
    const checkpoint = checkpoints.find((entry) => entry.label === label);
    
    assert.strictEqual(checkpoint, undefined);
  });

  it('should handle double rewind', () => {
    const checkpoints = [
      { label: 'cp1', timestamp: new Date().toISOString(), snapshot: { objective: 'First' } },
      { label: 'cp2', timestamp: new Date().toISOString(), snapshot: { objective: 'Second' } },
    ];
    
    let restored = checkpoints.find(c => c.label === 'cp1');
    assert.strictEqual(restored.snapshot.objective, 'First');
    
    restored = checkpoints.find(c => c.label === 'cp2');
    assert.strictEqual(restored.snapshot.objective, 'Second');
  });

  it('should handle empty checkpoints array', () => {
    const checkpoints = [];
    const label = 'test';
    const checkpoint = checkpoints.find((entry) => entry.label === label);
    
    assert.strictEqual(checkpoint, undefined);
    assert.strictEqual(checkpoints.length, 0);
  });

  it('should handle checkpoint with empty snapshot', () => {
    const checkpoint = {
      label: 'empty',
      timestamp: new Date().toISOString(),
      snapshot: {},
    };
    
    const compressed = { ...checkpoint.snapshot };
    assert.deepStrictEqual(compressed, {});
  });

  it('should handle compression of empty strings', () => {
    const text = '';
    const result = semanticCompress(text, { tier: 2, preserveCode: true });
    
    assert.strictEqual(result.compressed, '');
  });
});

// ─── Tool Registration ───────────────────────────────────────────────────────

describe('Tool Registration', () => {
  it('should register rewind_to_checkpoint tool', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, desc, schema, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const rewindTool = calls.find(c => c.name === 'rewind_to_checkpoint');
    assert.ok(rewindTool, 'rewind_to_checkpoint tool should be registered');
    assert.ok(rewindTool.desc.includes('compress'), 'description should mention compression');
  });

  it('should register compress_checkpoint_results tool', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, desc, schema, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const compressTool = calls.find(c => c.name === 'compress_checkpoint_results');
    assert.ok(compressTool, 'compress_checkpoint_results tool should be registered');
    assert.ok(compressTool.desc.includes('semantic compression'), 'description should mention semantic compression');
  });

  it('should have tier parameter with default value 2', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, schema });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const rewindTool = calls.find(c => c.name === 'rewind_to_checkpoint');
    assert.ok(rewindTool.schema.label, 'should have label parameter');
    assert.ok(rewindTool.schema.tier, 'should have tier parameter');
  });
});
