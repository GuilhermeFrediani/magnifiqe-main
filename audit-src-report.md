# Comprehensive src/ Audit — magnifiqe v4.8.0

Scope: Every `src/` file read, all exports cross-referenced against all imports (src/ + test/).
Focus: Unused exports, dead code, bugs, redundant logic, long functions, inconsistent patterns.

---

## BUGS (Runtime / Correctness)

### B1: `"\\n"` literal string instead of newline — 4 instances

The string `"\\n"` produces a literal backslash+n, not an actual newline. All four break user-facing output formatting.

| File | Line | Code | Fix |
|---|---|---|---|
| `src/caveman.js` | 158 | `diskContent.split("\\n").length` | `diskContent.split("\n").length` |
| `src/caveman.js` | 200 | `+ "\\n" +` | `+ "\n" +` |
| `src/caveman.js` | 231 | `lines.join("\\n")` | `lines.join("\n")` |
| `src/watchdog.js` | 270 | `lines.join("\\n")` | `lines.join("\n")` |

**Impact**: session_health output shows literal `\n` characters instead of line breaks. auto_validate_output shows literal `\n` in file sync and final verdict. File line count always reports 1.

---

### B2: `doctor_runtime_setup` reports `skills_exist: true` on empty directory

**File**: `src/activation.js:298`
**Code**: `skills_exist: ${existsSync(skillsDir)}`
**Problem**: Only checks directory existence. An empty `.claude/skills/` directory reports `skills_exist: true`, misleading the agent.
**Fix**: Check `readdirSync(skillsDir).filter(d => d.isDirectory()).some(d => existsSync(join(skillsDir, d.name, "SKILL.md")))`.

---

### B3: Plan 1.1–1.3 — Already Fixed

The three Phase 1 runtime bugs from the plan are already applied:
- `activeTimers` → `Object.keys(toolTimings).length` ✓ (watchdog.js:245-247)
- `summaryMatch[2]` parser fix ✓ (watchdog.js:86)
- `checkOutputOnly` in dedup check mode ✓ (watchdog.js:128-133)

---

## DEAD FILE

### D1: `phase1-tools.js` — Never imported, 4 tools silently unreachable

**File**: `src/phase1-tools.js`

This file exports `registerSemanticCompressionTools` and `registerPromptStandardsTools`. Neither is imported by `index.js`, `council.js`, or any other file. **Zero references outside the file itself.**

**Unregistered tools:**
- `semantic_compress` — LLM-aware semantic compression
- `classify_tokens` — Token tier classification
- `validate_prompt_standards` — RFC 2119 compliance
- `analyze_prompt` — Full prompt analysis

**Impact**: These tools are advertised in the server manifest but never actually available. Any agent calling them gets "tool not found".

**Fix**: Either import and register them in `index.js`, or delete the file.

---

## ORPHANED EXPORTS (exported but never imported anywhere)

### O1: `src/safety-guards.js` — 6 exports never imported (src/ + test/)

| Export | Type | Status |
|---|---|---|
| `getRateLimitStatus` | function | Never imported anywhere |
| `isDuplicateOutput` | function | Never imported anywhere |
| `filterExpiredSessions` | function | Never imported anywhere |
| `trackToolCall` | function | Never imported anywhere |
| `resetLoopDetection` | function | Never imported anywhere |
| `validateOutput` | function | Never imported anywhere |

These functions are fully implemented and tested (test/safety-guards.test.js imports them), but no production code calls them. They appear to be API surface for future integration that was never wired up.

### O2: `src/code-reading.js` — 4 exports used only internally

| Export | Internal callers |
|---|---|
| `getFileLang` | smart_outline, smart_unfold, smart_read handlers (same file) |
| `extractSymbolsAST` | `extractSymbols` (same file) |
| `extractSymbols` | smart_outline, smart_unfold, smart_read handlers (same file) |
| `extractSymbolBody` | smart_unfold, smart_read handlers (same file) |

These are exported for tests but never imported by other src/ files. Could be un-exported.

### O3: `src/prompt-standards.js` — 5 exports used only internally

| Export | Internal callers |
|---|---|
| `validatePromptStandards` | `analyzePrompt()` (same file) |
| `extractDirectives` | `analyzePrompt()` (same file) |
| `checkCriticalPlacement` | `analyzePrompt()` (same file) |
| `analyzeAntiPatterns` | `analyzePrompt()` (same file) |
| `enforceDensity` | **Nobody** — completely dead code |

`enforceDensity` is the only one with zero callers anywhere in the codebase.

### O4: `src/semantic-compression.js` — 1 dead export

`getCompressionStats` — exported but never imported. `src/compression-orchestrator.js` has its own `getCompressionStats` that tracks different data. Tests also import from compression-orchestrator, not semantic-compression.

### O5: `src/compression/thresholds.js` — 1 dead constant

`ACCURACY_TARGETS` — defined and exported, never imported or referenced anywhere (not even tests). Pure dead code.

### O6: `src/compression/ccr-hierarchy.js` — 3 internal-only exports

`losslessCompress`, `structuralCompress`, `aggressiveCompress` — only called within the `compress()` pipeline in the same file. Never imported elsewhere.

### O7: `src/compression/content-detector.js` — 2 orphaned re-exports

`ContentType` enum and `splitIntoSections` function — re-exported by ccr-hierarchy.js but never imported by any consumer of ccr-hierarchy.

### O8: `src/compression/cache-aligner.js` — 1 orphaned class export

`CacheAligner` class — only the singleton `cacheAligner` is used externally. The class export is never imported.

### O9: `src/compression/circuit-breaker.js` — 2 orphaned exports

`CircuitState` enum and `CircuitBreaker` class — only the singleton `circuitBreaker` is used externally.

### O10: `src/ttsr/settings.js` — 3 dead constants

`ContextMode`, `InterruptMode`, `RepeatMode` — defined as enum-like objects, exported, never imported or referenced anywhere.

### O11: `src/ttsr/rule-types.js` — 2 dead exports

`bucketRules` and `parseRule` — exported but never imported by any file.

### O12: `src/council.js` — 16 orphaned re-exports

council.js is a barrel re-export module. Of its ~30 re-exports, only 7 are actually imported from council.js by other files:

**Actually imported from council.js:**
- `COUNCIL_BOT_ORDER` (by council-orchestrator.js, council-prompts.js)
- `COUNCIL_BOT_BRIEFS` (by council-prompts.js)
- `evaluateCouncilNeed` (by council-orchestrator.js)
- `buildCouncilSession` (by council-orchestrator.js)
- `loadCouncilState` (by council-orchestrator.js)
- `saveCouncilState` (by council-orchestrator.js)
- `registerCouncilTools` (by index.js)

**Never imported from council.js (imported from sub-modules directly):**
`normalizeText`, `normalizeList`, `formatGateResult`, `FAILURE_COST_VALUES`, `BLAST_RADIUS_VALUES`, `MODE_VALUES`, `REVIEW_VERDICTS`, `defaultCouncilState`, `toTitleCaseBot`, `seededShuffle`, `buildPeerReviewMatrix`, `createSessionId`, `findSession`, `ensureSession`, `countCompletedPositions`, `countCompletedReviews`, `refreshSessionStatus`, `upsertCouncilPosition`, `upsertCouncilReview`, `formatSessionList`, `formatSession`, `synthesizeCouncilSession`, `formatSynthesis`

### O13: `src/council-live.js` — Entire file is orphaned barrel

The file (66 lines) re-exports everything from council-prompts.js, council-json.js, and council-orchestrator.js. Only `registerCouncilLiveTools` is imported from it. The other 35+ re-exports are unused.

### O14: `src/roles.js` — 2 internal-only exports

`ROLE_PRESETS` and `adaptPreset` — only used within roles.js itself and tests.

### O15: `src/ttsr-manager.js` — 1 orphaned class export

`TtsrManager` class — only the singleton `ttsrManager` is used in production. The class is exported for tests.

---

## REDUNDANT CODE / INCONSISTENT PATTERNS

### R1: Duplicate Zod schemas across 3 council tools (33+ lines)

`src/council-orchestrator.js` defines three tools (`run_council_simple`, `run_council_deep`, `run_council_auto`) that each independently declare the same ~11 Zod fields:
```js
objective, context, desired_output, constraints, task_type,
blast_radius, ambiguity, tradeoff_intensity, touches_multiple_modules,
safety_critical, failure_cost
```
Should be extracted into a shared `councilBaseSchema()` function.

### R2: Inconsistent import paths for council sub-modules

`council-prompts.js` imports `COUNCIL_BOT_ORDER` and `COUNCIL_BOT_BRIEFS` from `council.js` (a barrel). It could import directly from `council-session.js` to avoid the unnecessary barrel hop. The barrel adds no value here since council-prompts is already a peer module.

### R3: `council-json.js` re-exports `serializePretty` already in helpers.js

`council-json.js` imports `serializePretty` from `helpers.js` and re-exports it. This creates a confusing dual-path for the same function. Consumers should import from `helpers.js` directly.

### R4: Inconsistent error message patterns

34 tool handlers use `HALT — Error in <tool>: ${e.message}` but with slight inconsistencies:
- Some prefix with "Error in", others with "Error running"
- Some include the tool name, others don't

---

## LONG FUNCTIONS (>80 lines)

| Function | File | Lines | Recommendation |
|---|---|---|---|
| `registerCouncilLiveTools` | council-orchestrator.js:131-433 | 303 | Split into 5 tool files or extract shared schemas |
| `registerActivationTools` | activation.js:105-377 | 273 | Split into activate/doctor/prompt handlers |
| `registerCodeReadingTools` | code-reading.js:507-682 | 175 | Extract shared path validation |
| `extractSymbolBody` | code-reading.js:330-415 | 85 | Refactor AST path vs regex path into separate functions |
| `buildLivePlanText` | council-orchestrator.js:45-94 | 50 | Acceptable — single responsibility |

---

## ADDITIONAL FINDINGS

### A1: `council-prompts.js` has its own `REVIEW_VERDICTS` constant

`council-prompts.js:14` defines `const REVIEW_VERDICTS = ["support", "mixed", "reject"]` — identical to `council-session.js:18`. Two copies of the same constant in different modules.

### A2: `normalizeText` imported redundantly in council-prompts.js

`council-prompts.js:7` imports `normalizeText` from `helpers.js` but it's also re-exported from `council.js`. The import is correct (direct is better), but the duplicate in council.js's re-exports adds confusion.

### A3: `parseSkillFrontmatter` exists in helpers.js — plan mentions duplicate

The plan mentioned "duplicate parseSkillFrontmatter" as a prior finding. Current state: it exists only in `helpers.js:172-184` and is imported by `skills.js` and `activation.js`. No duplication found — this was likely already cleaned up.

### A4: `ROOT_DIR` and `PROJECT_ROOT` exports from config.js

Both are used (ROOT_DIR by activation.js, PROJECT_ROOT by many files). No orphan issue here — this was also likely already cleaned up per the plan.

### A5: Dead regex patterns in code-reading.js

The prior audit mentioned dead regex patterns. Current state: `extractSymbolsRegex` at line 297 is a regex-only fallback used when Babel parsing fails. It's still called by `extractSymbols`. Not dead — it's the fallback path.

---

## SUMMARY BY SEVERITY

| Severity | Count | Items |
|---|---|---|
| **Bug** | 5 | B1 (4× `\\n`), B2 (skills check) |
| **Dead file** | 1 | D1 (phase1-tools.js — 4 tools unreachable) |
| **Orphaned exports** | 40+ | O1–O15 across 15 files |
| **Redundant code** | 4 | R1–R4 |
| **Long functions** | 4 | 4 functions >80 lines |
| **Minor inconsistencies** | 5 | A1–A5 |
