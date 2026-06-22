# Audit Report — Infrastructure (Root, IDE, Gitignore, Scripts)

**Date:** 2026-06-20
**Scope:** Root orphan files, IDE configs, .gitignore gaps, config.js dead exports, setup-ide.js staleness, scripts issues

---

## 1. Root Orphan Files (tracked in git, 8 files)

All of these are tracked in git but serve no runtime or build purpose.

| File | Size | Verdict | Action |
|------|------|---------|--------|
| `IMPLEMENTATION-PLAN.md` | 17KB | **Dead weight** — historical plan doc, not referenced by any code or tool | Remove from tracking |
| `ARCHITECTURE-MAP.md` | 27KB | **Dead weight** — architecture map, not referenced anywhere | Remove from tracking |
| `SKILLS-ANALYSIS.md` | 8KB | **Dead weight** — skills analysis from external repos | Remove from tracking |
| `Arquitetura modular.md` | 7.5KB | **Dead weight** — Portuguese architecture doc (frontend/backend guide) | Remove from tracking |
| `copilot-instructions.md` | 667B | **Duplicate** — shorter version (13 lines); `.github/copilot-instructions.md` (36 lines) is the canonical one. Root version is a subset. | Remove root duplicate |
| `magnifiqe.plugin.json` | 2.1KB | **Orphan** — not referenced in any `src/` code, not in `package.json` `files` field, not loaded at runtime. Appears to be a draft manifest. | Remove from tracking |
| `AGENTS.md` | 3.6KB | **Active** — used by Claude Code as project instructions. Keep. | ✅ Keep |
| `PLAN-DE-CORRECAO.md` | 11KB | **Untracked** (shows as `??` in git status). Temporary correction plan. | Add to `.gitignore` or remove |

**`graphify-out/`** — correctly gitignored (confirmed via `git ls-files`). Contains empty `graph.json`. No action needed.

---

## 2. Duplicate IDE Configs

### .cursorrules vs .windsurfrules — IDENTICAL

Both files have **identical content** (MD5: `915632964d8f8b7bd26f59423f9d48ab`). Both contain the full "STACK PERFEITA MCP — LIVE IGNITION" prompt. This is by design — `bin/setup-ide.js` writes both files with the same prompt content. **No issue here.**

### Root copilot-instructions.md vs .github/copilot-instructions.md — DIFFERENT

| File | Lines | Content |
|------|-------|---------|
| `copilot-instructions.md` (root) | 13 | Short "Enxuto" version — 10 bullet rules |
| `.github/copilot-instructions.md` | 36 | Full "LIVE IGNITION" version — session startup, deliberation, output gate |

The root version is a **strict subset** of `.github/copilot-instructions.md` plus 3 extra rules (`validate_bad_code`, `dependency_validate`, `validate_response_style`). The root file is redundant — GitHub Copilot reads `.github/copilot-instructions.md`.

**Recommendation:** Remove `copilot-instructions.md` from root. If the shorter "Enxuto" rules are desired, merge them into `.github/copilot-instructions.md`.

---

## 3. .gitignore Gaps

### 3.1 Tracked files that should be ignored (CRITICAL)

These 3 files are **in .gitignore** but were committed before the ignore rule was added. They remain tracked:

| File | Status |
|------|--------|
| `.claude/council_state.json.bak` | Tracked despite .gitignore line 17 |
| `.claude/session_memory.json.bak` | Tracked despite .gitignore line 16 |
| `.claude/task_runtime.json` | Tracked despite .gitignore line 19 |

**Fix:**
```bash
git rm --cached .claude/council_state.json.bak .claude/session_memory.json.bak .claude/task_runtime.json
```

### 3.2 Missing .gitignore patterns

| Pattern | Why |
|---------|-----|
| `.claude/*.bak` | Current .gitignore lists individual `.bak` files. A wildcard would catch any new `.bak` files. |
| `test/_tmp_code_reading/` | Temp directory created by tests. Currently untracked but could be accidentally committed. |
| `PLAN-DE-CORRECAO.md` | Temporary plan file showing as untracked noise in `git status`. |
| `audit-infrastructure.md` | This report itself. |

### 3.3 Items confirmed correct

- `graphify-out/` — in .gitignore, not tracked ✅
- `magnifiqe.plugin.json` — tracked intentionally ✅ (but orphan, see §1)
- `.cursorrules`, `.windsurfrules` — tracked intentionally ✅
- `.claude/session_memory.json`, `.claude/project_state.json`, `.claude/council_state.json` — properly gitignored ✅

---

## 4. config.js Dead Exports

**Result: ZERO dead exports.** All 16 exports from `src/config.js` are actively imported by at least one file:

| Export | Imported by |
|--------|-------------|
| `ROOT_DIR` | `activation.js`, `config.test.js` |
| `PROJECT_ROOT` | 8 files |
| `BUNDLED_RULES_DIR` | `activation.js` |
| `RULES_DIR` | 6 files |
| `SRC_DIR` | `rules.js`, `config.test.js` |
| `SKILLS_DIR` | `skills.js`, `skills-handlers.test.js`, `config.test.js` |
| `COMMANDS_DIR` | `commands.js`, `config.test.js` |
| `MEMORY_FILE` | 5 files |
| `PROJECT_STATE_FILE` | 3 files |
| `COUNCIL_STATE_FILE` | 2 files |
| `STATE_LIMITS` | 3 files |
| `TOPIC_MAP` | 3 files |
| `RULE_DESCRIPTIONS` | 6 files |
| `BAD_PATTERNS` | 4 files |
| `RESPONSE_STYLE_PATTERNS` | `validators.js` |
| `NODE_BUILTINS` | `dependency-resolution.js` |

---

## 5. setup-ide.js Staleness

### 5.1 Skills bootstrap is a no-op (MEDIUM)

**Lines 203, 211:** The bootstrap copies from `PACKAGE_ROOT/.claude/skills/` which is **empty**. `copyDirSafe` silently succeeds and prints `[+] Bootstrapped: .claude/skills starter pack` even though zero files were copied.

**Impact:** Users running `stack-perfeita init` get a misleading success message for skills.

**Fix:** Either populate `.claude/skills/` with starter files, or remove the skills copy from bootstrap and update the completion message.

### 5.2 Missing parentheses in tool references (LOW)

**Lines 60-62:** `validate_bad_code`, `dependency_validate`, `validate_response_style` are referenced without parentheses, while all other tool references in the prompt use call-style `tool_name(...)`. Cosmetic inconsistency.

### 5.3 IDE parity — CORRECT

- Line 182: writes `.cursorrules` unconditionally ✅
- Line 185: writes `.windsurfrules` inside `!MINIMAL` block ✅
- Both files get the same prompt content ✅

### 5.4 Cross-reference validation — ALL VALID

- All tool names in FULL_PROMPT and LEAN_PROMPT map to registered tools in `src/index.js` ✅
- All paths in opencode config (README.md, ai-docs/*, ai-rules/*, examples/*) exist ✅
- `npx stack-perfeita-mcp` matches `package.json` bin entry ✅
- `npm run docs:ai` matches `package.json` scripts ✅
- Bot names (contrarian, first_principles, expansionist, outsider, executor) match `COUNCIL_BOT_ORDER` ✅

---

## 6. Scripts Issues

### 6.1 opencode.json has hardcoded local path (MEDIUM)

**Line 18:** `"node", "C:/Users/Guilherme/AppData/Local/Programs/nodejs/node_modules/stack-perfeita-mcp/src/index.js"`

This is a user-specific absolute path. It will break for anyone who installs the package differently. Should use `npx stack-perfeita-mcp` or a relative path.

### 6.2 magnifiqe.plugin.json is unreferenced (LOW)

The file is not referenced in any `src/` code, not loaded at runtime, and not listed in `package.json` `files` field. It appears to be a draft plugin manifest that was never wired in.

### 6.3 export-ai-markdown.js — NO ISSUES

- INCLUDE list references valid paths ✅
- BUNDLES matchers reference valid files ✅
- SKIP_DIRS is comprehensive ✅

---

## Summary of Actions Required

| Priority | Action | Files |
|----------|--------|-------|
| **CRITICAL** | `git rm --cached` 3 runtime artifacts | `.claude/task_runtime.json`, `.claude/council_state.json.bak`, `.claude/session_memory.json.bak` |
| **CRITICAL** | Update `.gitignore` | Add `.claude/*.bak`, `test/_tmp_code_reading/` |
| **MEDIUM** | Remove 6 tracked orphan files | `IMPLEMENTATION-PLAN.md`, `ARCHITECTURE-MAP.md`, `SKILLS-ANALYSIS.md`, `Arquitetura modular.md`, `copilot-instructions.md`, `magnifiqe.plugin.json` |
| **MEDIUM** | Fix setup-ide.js skills bootstrap message | `bin/setup-ide.js:203,211` |
| **MEDIUM** | Fix opencode.json hardcoded path | `opencode.json:18` |
| **LOW** | Add parentheses in FULL_PROMPT tool refs | `bin/setup-ide.js:60-62` |
