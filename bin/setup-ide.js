#!/usr/bin/env node

/**
 * stack-perfeita setup script
 * Generates IDE configuration files and can bootstrap starter rules/skills.
 *
 * Usage:
 *   stack-perfeita                 # Generate IDE config files only
 *   stack-perfeita init            # Generate configs + starter ai-rules + starter skills
 *   stack-perfeita --bootstrap     # Same as init
 *   stack-perfeita --minimal       # Only .cursorrules
 *   stack-perfeita --lean          # Generate lean prompt/config for lower token usage
 *   stack-perfeita --force         # Overwrite existing files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PROJECT_DIR = process.cwd();
const args = process.argv.slice(2);

const FORCE = args.includes('--force');
const MINIMAL = args.includes('--minimal');
const LEAN = args.includes('--lean');
const BOOTSTRAP = args.includes('init') || args.includes('--bootstrap');

const FULL_PROMPT = `
# STACK PERFEITA MCP — LIVE IGNITION

Ative o Stack Perfeita neste projeto com deliberação adaptativa.

## INÍCIO DE SESSÃO
1. Call \`activate_project()\`
2. Call \`doctor_runtime_setup()\`
3. Call \`get_model_profile("claude")\` or the active provider
4. Call \`activate_role("implementer", model="claude")\`
5. Call \`start_task_contract(...)\`
6. Call \`get_rules_bundle("index")\`
7. Call \`get_project_state()\`

## DELIBERAÇÃO
- Se a tarefa for simples, curta ou local: use fluxo normal
- Se houver arquitetura, migração, refactor grande, segurança, trade-off forte, ambiguidade alta ou múltiplos módulos:
  - Call \`run_council_auto(...)\`
  - If deep mode is selected, use \`get_council_execution_prompt(...)\` for each stage
  - Preserve the full 5-bot flow: contrarian, first_principles, expansionist, outsider, executor
  - Normalize weak JSON with \`normalize_council_json(...)\` before recording or using it

## MODO OPERACIONAL
- Adaptive terseness by default
- If token pressure is high: set \`CAVEMAN MODE: ACTIVE\`
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice -> HALT and report root cause

## OUTPUT GATE
Before shipping code or claiming success:
- Run \`validate_bad_code\` for code blocks
- Run \`dependency_validate\` when new imports/assets were introduced
- Run \`validate_response_style\` before long explanatory prose when needed
- Record proof with \`assert_step_evidence(...)\`
- If foundation is rotten, stop feature work and fix the base first
- Use \`get_prompt_script(...)\` to load the exact workflow prompt without opening all docs
- Prefer \`npm run docs:ai\` before long AI/code-review sessions
`;

const LEAN_PROMPT = `
# STACK PERFEITA MCP — LEAN IDE MODE

1. Call \`activate_project()\`
2. Call \`doctor_runtime_setup()\`
3. Call \`activate_role(...)\`
4. Call \`start_task_contract(...)\`
5. Load only needed rules/bundles
6. If task is structural or ambiguous: call \`run_council_auto(...)\`
7. Record proof with \`assert_step_evidence(...)\`
8. Before final code: \`validate_bad_code\`
9. Before new imports/assets: \`dependency_validate\`
10. If prose grows too much: \`validate_response_style(..., mode="caveman")\`
11. Same failure twice -> HALT
12. Use \`get_prompt_script("initial")\` or \`get_prompt_script("resume")\` when you need the full workflow
`;

const FULL_OPENCODE_CONFIG = {
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "./README.md",
    "./ai-docs/compact-index.md",
    "./ai-docs/bundle-index.md",
    "./PROMPTS.md",
    "./ai-rules/01-ai-workflow-strict.md",
    "./ai-rules/03-token-economy.md",
    "./ai-rules/12-council-deliberation.md",
    "./ai-rules/13-live-council-runtime.md"
  ],
  "mcp": {
    "stack-perfeita": {
      "type": "local",
      "command": ["npx", "stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"],
      "enabled": true
    }
  }
};

const LEAN_OPENCODE_CONFIG = {
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "./ai-docs/compact-index.md",
    "./ai-docs/bundle-index.md",
    "./examples/ide-lean.prompt.md",
    "./ai-rules/03-token-economy.md",
    "./ai-rules/12-council-deliberation.md",
    "./ai-rules/13-live-council-runtime.md"
  ],
  "mcp": {
    "stack-perfeita": {
      "type": "local",
      "command": ["npx", "stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"],
      "enabled": true
    }
  }
};

function writeFileSafe(filePath, content, description) {
  if (fs.existsSync(filePath) && !FORCE) {
    console.log(`[~] Skipped (already exists): ${filePath}`);
    return false;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
  console.log(`[+] Generated: ${description}`);
  return true;
}

function copyFileSafe(src, dest, description) {
  if (fs.existsSync(dest) && !FORCE) {
    return false;
  }
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  if (description) console.log(`[+] Copied: ${description}`);
  return true;
}

function copyDirSafe(srcDir, destDir, description) {
  if (!fs.existsSync(srcDir)) return false;
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirSafe(srcPath, destPath);
    } else {
      copyFileSafe(srcPath, destPath);
    }
  }

  if (description) console.log(`[+] Bootstrapped: ${description}`);
  return true;
}

const selectedPrompt = LEAN ? LEAN_PROMPT : FULL_PROMPT;
const selectedOpenCodeConfig = LEAN ? LEAN_OPENCODE_CONFIG : FULL_OPENCODE_CONFIG;

console.log('Stack Perfeita MCP - IDE Setup\n');

writeFileSafe(path.join(PROJECT_DIR, '.cursorrules'), selectedPrompt, '.cursorrules');

if (!MINIMAL) {
  writeFileSafe(path.join(PROJECT_DIR, '.windsurfrules'), selectedPrompt, '.windsurfrules');

  const copilotPath = path.join(PROJECT_DIR, '.github', 'copilot-instructions.md');
  if (!fs.existsSync(copilotPath) || FORCE) {
    writeFileSafe(copilotPath, selectedPrompt, '.github/copilot-instructions.md');
  } else {
    console.log(`[~] Skipped (project-specific version exists): ${copilotPath}`);
  }

  writeFileSafe(
    path.join(PROJECT_DIR, 'opencode.json'),
    JSON.stringify(selectedOpenCodeConfig, null, 2),
    'opencode.json'
  );
}

if (BOOTSTRAP) {
  copyDirSafe(path.join(PACKAGE_ROOT, 'ai-rules'), path.join(PROJECT_DIR, 'ai-rules'), 'ai-rules/ starter pack');
  copyDirSafe(path.join(PACKAGE_ROOT, '.claude', 'skills'), path.join(PROJECT_DIR, '.claude', 'skills'), '.claude/skills starter pack');
} else if (!fs.existsSync(path.join(PROJECT_DIR, 'ai-rules'))) {
  console.log('[!] ai-rules/ not found. Run `stack-perfeita init` to bootstrap starter rules.');
}

console.log('\nSetup complete.');
if (MINIMAL) console.log('- Minimal mode: only .cursorrules generated');
if (LEAN) console.log('- Lean mode: concise prompt/config generated for lower token usage');
if (BOOTSTRAP) console.log('- Bootstrap mode: starter ai-rules and skills copied');
console.log('- Recommended IDE command: npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules');
console.log('- Fallback with bundled rules: npx stack-perfeita-mcp --project-root .');
console.log('- Optional AI docs build: npm run docs:ai');
