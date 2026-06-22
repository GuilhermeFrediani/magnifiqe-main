/**
 * Phase 4 GAP fixes regression tests.
 * GAP-7: IDE Rules, GAP-8: Prompt Testing, GAP-14: Prompt Versioning
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ─── GAP-7: IDE Rules ──────────────────────────────────────────────────────

describe('GAP-7: IDE Rules', () => {
  it('should export registerIDERulesTools', async () => {
    const mod = await import('../src/ide-rules.js');
    assert.ok(typeof mod.registerIDERulesTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/ide-rules.js', 'utf8');
    assert.ok(src.includes('"get_ide_config"'), 'Missing get_ide_config');
    assert.ok(src.includes('"adapt_for_ide"'), 'Missing adapt_for_ide');
    assert.ok(src.includes('"get_ide_workflow"'), 'Missing get_ide_workflow');
    assert.ok(src.includes('"diagnose_ide_issues"'), 'Missing diagnose_ide_issues');
  });

  it('should support 5+ IDEs', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/ide-rules.js', 'utf8');
    assert.ok(src.includes('cursor'), 'Missing cursor');
    assert.ok(src.includes('windsurf'), 'Missing windsurf');
    assert.ok(src.includes('copilot'), 'Missing copilot');
    assert.ok(src.includes('claude-code') || src.includes('claude_code'), 'Missing claude-code');
    assert.ok(src.includes('vscode'), 'Missing vscode');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/ide-rules.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── GAP-8: Prompt Testing ─────────────────────────────────────────────────

describe('GAP-8: Prompt Testing', () => {
  it('should export registerPromptTestingTools', async () => {
    const mod = await import('../src/prompt-testing.js');
    assert.ok(typeof mod.registerPromptTestingTools === 'function');
  });

  it('should have all 4 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-testing.js', 'utf8');
    assert.ok(src.includes('"test_prompt_effectiveness"'), 'Missing test_prompt_effectiveness');
    assert.ok(src.includes('"compare_prompts"'), 'Missing compare_prompts');
    assert.ok(src.includes('"optimize_prompt"'), 'Missing optimize_prompt');
    assert.ok(src.includes('"validate_prompt_safety"'), 'Missing validate_prompt_safety');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-testing.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── GAP-14: Prompt Versioning ─────────────────────────────────────────────

describe('GAP-14: Prompt Versioning', () => {
  it('should export registerPromptVersioningTools', async () => {
    const mod = await import('../src/prompt-versioning.js');
    assert.ok(typeof mod.registerPromptVersioningTools === 'function');
  });

  it('should have all 6 tools', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-versioning.js', 'utf8');
    assert.ok(src.includes('"save_prompt_version"'), 'Missing save_prompt_version');
    assert.ok(src.includes('"get_prompt_version"'), 'Missing get_prompt_version');
    assert.ok(src.includes('"list_prompt_versions"'), 'Missing list_prompt_versions');
    assert.ok(src.includes('"compare_prompt_versions"'), 'Missing compare_prompt_versions');
    assert.ok(src.includes('"ab_test_prompts"'), 'Missing ab_test_prompts');
    assert.ok(src.includes('"get_ab_test_results"'), 'Missing get_ab_test_results');
  });

  it('should have rate limiting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/prompt-versioning.js', 'utf8');
    assert.ok(src.includes('rateLimiter.check') || src.includes('withRateLimit'), 'Missing rate limiting');
  });
});

// ─── Integration: All Phase 4 in index.js ───────────────────────────────────

describe('Phase 4 Integration: All modules in index.js', () => {
  it('should import all 3 Phase 4 modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerIDERulesTools'), 'Missing IDERules import');
    assert.ok(src.includes('registerPromptTestingTools'), 'Missing PromptTesting import');
    assert.ok(src.includes('registerPromptVersioningTools'), 'Missing PromptVersioning import');
  });

  it('should register all 3 Phase 4 modules', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('./src/index.js', 'utf8');
    assert.ok(src.includes('registerIDERulesTools(server)'), 'Missing IDERules registration');
    assert.ok(src.includes('registerPromptTestingTools(server)'), 'Missing PromptTesting registration');
    assert.ok(src.includes('registerPromptVersioningTools(server)'), 'Missing PromptVersioning registration');
  });
});
