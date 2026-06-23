# Orphan Detection Report
Generated: 2026-06-23

---

## 1. src/*.js Files NOT Imported by index.js or Other Modules

### ORPHANED — Dead Code (1 file)

| File | Reason |
|------|--------|
| `src/prompt-conventions.js` | NOT imported by `src/index.js` or any other `src/` module. Only consumed by its test file (`test/prompt-conventions.test.js`). Zero runtime references — dead code. |

### Fully Connected (verified import chain):

All other 73 src/*.js files (across src/, src/commands/, src/compression/, src/interceptors/, src/learn/, src/observability/, src/ttsr/) are reachable from `index.js` via direct or transitive imports. The full dependency chain was traced:

- **Direct from index.js** (48 files): activation, anti-delirium, anti-hallucination, chain-of-thought, cicd-validator, code-reading, commands, compaction, compression-orchestrator, config, context-manager, error-recovery, failure-classifier, fix-issues, helpers, ide-rules, learn-trigger, llm-scaffolder, memory, output-enforcer, output-formats, perf-benchmark, perf-metrics, phase1-tools, policy-generator, profiles, project-state, prompt-adapter, prompt-testing, prompt-versioning, rag-eval, rate-limiter, resources, roles, rules, safety-guards, sast-rules, session-analytics, skills, task-runtime, todo-manager, tool-prompt-analyzer, ttsr-manager, validators, observability/logger, observability/metrics, commands/triage, commands/review-prs
- **Transitive via anti-hallucination.js** (4 files): verification, watchdog, caveman, prompt-injection
- **Transitive via validators.js** (3 files): dependency-resolution, typosquat-detect, guardrail-pipeline
- **Transitive via phase1-tools.js** (1 file): prompt-standards
- **Transitive via compression-orchestrator.js** (6 files): compression/content-detector, compression/ccr-hierarchy, compression/store, compression/cache-aligner, compression/circuit-breaker, compression/thresholds, interceptors/base
- **Transitive via ttsr-manager.js** (4 files): ttsr/halt-bridge, ttsr/settings, ttsr/ttsr-engine, ttsr/rule-types
- **Transitive via learn-trigger.js** (3 files): learn/analyzer, learn/scanner, learn/writer
- **Transitive via sast-rules.js** (1 file): sast-rules-data
- **Transitive via project-state.js** (1 file): state-compaction
- **Transitive via helpers.js** (1 file): semantic-compression

---

## 2. test/*.js Files NOT Testing Any src Module

### ORPHANED — No src Import (1 file)

| File | Reason |
|------|--------|
| `test/memory.test.js` | Does NOT import any `src/` module. Reimplements memory logic inline. The file's own comment admits: "These tests serve as documentation-level placeholders... The real integration coverage lives in test/memory-handlers.test.js." Superseded by `memory-handlers.test.js` which actually imports and tests `src/memory.js`. |

### Borderline (not orphaned, but noted):

| File | Note |
|------|------|
| `test/e2e-stdio.test.js` | No direct src import, but spawns `src/index.js` as a child process and tests via stdio JSON-RPC. Legitimate E2E test. |
| `test/scripts-schemas.test.js` | Imports from `scripts/`, not `src/`. Legitimate test of the scripts directory. |
| `test/prompt-conventions.test.js` | Imports `src/prompt-conventions.js` — tests an orphaned src module (see §1). |

---

## 3. Root Files NOT Referenced by package.json Scripts or Any Code

### ORPHANED — Audit/Report Files (11 files)

These are one-time audit outputs sitting in the project root. None are referenced by `package.json` scripts, `opencode.json`, any source code, or the `files` array in `package.json`. They clutter the root and should be moved to a docs/archive directory or removed.

| File | Size | Reason |
|------|------|--------|
| `AUDIT-REPORT-2026-06-20.md` | 4.9KB | One-time audit report, unreferenced |
| `AUDIT-REPORT-2026-06-21.md` | 20.0KB | One-time audit report, unreferenced |
| `audit-infrastructure.md` | 7.8KB | One-time audit report, unreferenced |
| `audit-src-report.md` | 11.1KB | One-time audit report, unreferenced |
| `CAPABILITY-AUDIT-2026-06-21.md` | 9.2KB | One-time audit report, unreferenced |
| `IMPLEMENTATION-SUMMARY.md` | 3.9KB | One-time implementation summary, unreferenced |
| `IMPLEMENTATION-SUMMARY-CHECKPOINT-REWIND.md` | 4.0KB | One-time implementation summary, unreferenced |
| `INTEGRATION-AUDIT-2026-06-21.md` | 6.4KB | One-time audit report, unreferenced |
| `SESSION-SUMMARY-2026-06-20.md` | 1.3KB | One-time session summary, unreferenced |
| `SKILLS-IMPORT-REPORT.md` | 11.1KB | One-time audit report, unreferenced |
| `TEST-COVERAGE-AUDIT.md` | 21.0KB | One-time audit report, unreferenced |

### ORPHANED — Generated Build Artifacts (3 files)

Tracked in git but should NOT be. These are generated output from test/lint runs, not source code.

| File | Size | Reason |
|------|------|--------|
| `test-results.txt` | 225.7KB | Generated test output, untracked but unignored |
| `lint-full.txt` | 11.5KB | Generated lint output, untracked but unignored |
| `eslint-results.json` | 154.2KB | Generated eslint output, untracked but unignored |

### Not Orphaned (verified):

| File | Referenced By |
|------|---------------|
| `AGENTS.md` | Agent context system |
| `CHANGELOG.md` | Standard project file |
| `CONTRIBUTING.md` | Standard project file |
| `README.md` | Standard project file, in `files` array |
| `PROMPTS.md` | In `files` array, opencode.json |
| `opencode.json` | In `files` array |
| `eslint.config.js` | `npm run lint` |
| `.gitignore` | Git infrastructure |
| `.gitattributes` | Git infrastructure |
| `.cursorrules` | IDE integration |
| `.windsurfrules` | IDE integration |
| `package-lock.json` | npm lockfile |

---

## 4. Empty Directories

| Directory | Status |
|-----------|--------|
| `.claude/skills/` | EMPTY. Referenced in `package.json` `files` array but contains no skill files. |
| `test/_tmp_code_reading/` | EMPTY. Created by `code-reading-handlers.test.js` during test runs, gitignored. Stale if tests are not running. |

---

## 5. Duplicate / Backup Files (.bak, .tmp, _tmp_)

### Git-Tracked Backups (2 files — should NOT be tracked)

| File | Gitignored? | Reason |
|------|-------------|--------|
| `.claude/todo-state.json.bak` | **NO** | Backup of runtime state. Tracked in git. Should be gitignored. |
| `.claude/task_runtime.json.bak` | **NO** | Backup of runtime state. Tracked in git. Should be gitignored. |

### Gitignored Backups (1 file — correctly ignored)

| File | Gitignored? |
|------|-------------|
| `.claude/session_memory.json.bak` | YES (line 16 of .gitignore) |

### Note on .gitignore gaps:

The `.gitignore` lists individual `.bak` files:
```
.claude/session_memory.json.bak
.claude/council_state.json.bak
```

But misses:
- `.claude/todo-state.json.bak`
- `.claude/task_runtime.json.bak`

A wildcard `.claude/*.bak` would catch all current and future `.bak` files.

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Orphaned src module (dead code) | 1 | HIGH — unused runtime code |
| Orphaned test file (superseded) | 1 | MEDIUM — redundant test coverage |
| Orphaned root audit/report files | 11 | LOW — documentation clutter |
| Generated build artifacts (untracked) | 3 | LOW — should be gitignored |
| Empty directories | 2 | LOW — stale artifacts |
| Git-tracked backup files | 2 | MEDIUM — runtime state in version control |
| **Total orphans** | **20** | |
