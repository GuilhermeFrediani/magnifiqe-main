import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ROLE_PRESETS, adaptPreset, registerRolesTools } from '../src/roles.js';
import { PROFILES } from '../src/profiles.js';

describe('ROLE_PRESETS', () => {
  it('should include key operational roles', () => {
    assert.ok(ROLE_PRESETS.architect);
    assert.ok(ROLE_PRESETS.implementer);
    assert.ok(ROLE_PRESETS.debugger);
    assert.ok(ROLE_PRESETS['security-review']);
  });

  it('should define required gate arrays', () => {
    for (const preset of Object.values(ROLE_PRESETS)) {
      assert.ok(Array.isArray(preset.required_gates));
      assert.ok(preset.required_gates.length >= 1);
    }
  });
});

describe('adaptPreset', () => {
  it('should tighten budgets for weaker-scaffold models', () => {
    const adapted = adaptPreset(ROLE_PRESETS.implementer, PROFILES.mimo);
    assert.ok(adapted.tool_budget <= ROLE_PRESETS.implementer.tool_budget);
    assert.ok(adapted.retry_budget <= ROLE_PRESETS.implementer.retry_budget);
    assert.ok(adapted.model_strategy.includes('tight scaffolding'));
  });

  it('should preserve broader autonomy for stronger profiles', () => {
    const adapted = adaptPreset(ROLE_PRESETS.architect, PROFILES.gpt);
    assert.strictEqual(adapted.tool_budget, ROLE_PRESETS.architect.tool_budget);
    assert.ok(adapted.model_strategy.includes('higher autonomy'));
  });
});

describe('registerRolesTools', () => {
  it('should register activate_role tool', () => {
    let called = false;
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        called = true;
        assert.strictEqual(name, 'activate_role');
        assert.ok(typeof handler === 'function');
      },
    };

    registerRolesTools(mockServer);
    assert.ok(called);
  });
});
