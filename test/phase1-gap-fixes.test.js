/**
 * Phase 1 GAP fixes regression tests.
 * GAP-13: Anti-Delirium, GAP-1: Model Prompts, GAP-5: Weak LLM, GAP-3: Output Format
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ─── GAP-13: Anti-Delirium ────────────────────────────────────────────────

describe('GAP-13: Anti-Delirium System', () => {
  it('should export registerAntiDeliriumTools', async () => {
    const mod = await import('../src/anti-delirium.js');
    assert.ok(typeof mod.registerAntiDeliriumTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/anti-delirium.js', 'utf8');
    assert.ok(src.includes('"verify_claims"'), 'Missing verify_claims');
    assert.ok(src.includes('"extract_claims"'), 'Missing extract_claims');
    assert.ok(src.includes('"confidence_check"'), 'Missing confidence_check');
    assert.ok(src.includes('"fact_check_pipeline"'), 'Missing fact_check_pipeline');
  });

  it('should have rate limiting in all handlers', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/anti-delirium.js', 'utf8');
    const rateLimitCount = (src.match(/rateLimiter\.check\(/g) || []).length;
    assert.ok(rateLimitCount >= 4, `Expected >=4 rate limit checks, got ${rateLimitCount}`);
  });

  it('should have try-catch in all handlers', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/anti-delirium.js', 'utf8');
    const tryCount = (src.match(/try \{/g) || []).length;
    assert.ok(tryCount >= 4, `Expected >=4 try blocks, got ${tryCount}`);
  });
});

// ─── GAP-1: Model-Specific Prompts ────────────────────────────────────────

describe('GAP-1: Model-Specific Prompts', () => {
  it('should export registerPromptAdapterTools', async () => {
    const mod = await import('../src/prompt-adapter.js');
    assert.ok(typeof mod.registerPromptAdapterTools === 'function');
  });

  it('should have all 3 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-adapter.js', 'utf8');
    assert.ok(src.includes('"adapt_prompt"'), 'Missing adapt_prompt');
    assert.ok(src.includes('"get_model_strategy"'), 'Missing get_model_strategy');
    assert.ok(src.includes('"suggest_model"'), 'Missing suggest_model');
  });

  it('should support all 5 model families', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-adapter.js', 'utf8');
    assert.ok(src.includes('claude'), 'Missing claude');
    assert.ok(src.includes('gpt'), 'Missing gpt');
    assert.ok(src.includes('gemini'), 'Missing gemini');
    assert.ok(src.includes('glm'), 'Missing glm');
    assert.ok(src.includes('mimo'), 'Missing mimo');
  });

  it('should have try-catch in all handlers', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-adapter.js', 'utf8');
    const tryCount = (src.match(/try \{/g) || []).length;
    assert.ok(tryCount >= 3, `Expected >=3 try blocks, got ${tryCount}`);
  });
});

// ─── GAP-5: Weak LLM Scaffolding ──────────────────────────────────────────

describe('GAP-5: Weak LLM Scaffolding', () => {
  it('should export registerLLMScaffolderTools', async () => {
    const mod = await import('../src/llm-scaffolder.js');
    assert.ok(typeof mod.registerLLMScaffolderTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/llm-scaffolder.js', 'utf8');
    assert.ok(src.includes('"scaffold_reasoning"'), 'Missing scaffold_reasoning');
    assert.ok(src.includes('"inject_few_shot"'), 'Missing inject_few_shot');
    assert.ok(src.includes('"simplify_for_model"'), 'Missing simplify_for_model');
    assert.ok(src.includes('"reasoning_checkpoint"'), 'Missing reasoning_checkpoint');
  });

  it('should have chain-of-thought templates', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/llm-scaffolder.js', 'utf8');
    assert.ok(src.includes('chain') || src.includes('step') || src.includes('scaffold'), 'Missing CoT patterns');
  });

  it('should support model tiers', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/llm-scaffolder.js', 'utf8');
    assert.ok(src.includes('weak') || src.includes('strong') || src.includes('medium'), 'Missing model tiers');
  });
});

// ─── GAP-3: Structured Output ──────────────────────────────────────────────

describe('GAP-3: Structured Output Enforcement', () => {
  it('should export registerOutputEnforcerTools', async () => {
    const mod = await import('../src/output-enforcer.js');
    assert.ok(typeof mod.registerOutputEnforcerTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/output-enforcer.js', 'utf8');
    assert.ok(src.includes('"enforce_output_format"'), 'Missing enforce_output_format');
    assert.ok(src.includes('"validate_output_structure"'), 'Missing validate_output_structure');
    assert.ok(src.includes('"standardize_response"'), 'Missing standardize_response');
    assert.ok(src.includes('"format_for_ide"'), 'Missing format_for_ide');
  });

  it('should support multiple output formats', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/output-enforcer.js', 'utf8');
    assert.ok(src.includes('json') || src.includes('markdown'), 'Missing output formats');
  });

  it('should support multiple IDEs', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/output-enforcer.js', 'utf8');
    assert.ok(src.includes('cursor') || src.includes('windsurf') || src.includes('copilot'), 'Missing IDE support');
  });
});

// ─── Integration: All modules registered in index.js ───────────────────────

describe('Phase 1 Integration: All modules in index.js', () => {
  it('should import all 4 new modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerAntiDeliriumTools'), 'Missing AntiDelirium import');
    assert.ok(src.includes('registerPromptAdapterTools'), 'Missing PromptAdapter import');
    assert.ok(src.includes('registerLLMScaffolderTools'), 'Missing LLMScaffolder import');
    assert.ok(src.includes('registerOutputEnforcerTools'), 'Missing OutputEnforcer import');
  });

  it('should register all 4 new modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    // Count registration calls (not imports)
    const lines = src.split('\n');
    let regCount = 0;
    for (const line of lines) {
      if (line.trim().startsWith('register') && line.includes('(server)') && !line.includes('import')) {
        regCount++;
      }
    }
    assert.ok(regCount >= 28, `Expected >=28 registration calls, got ${regCount}`);
  });
});
