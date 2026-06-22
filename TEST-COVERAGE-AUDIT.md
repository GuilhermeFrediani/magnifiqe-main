# Test Coverage Audit Report
**Date**: 2026-06-21  
**Project**: stack-perfeita-mcp (magnifiqe-main)  
**Stats**: 79 tools | 31 source modules | 54 test files | 1036 passing tests | 6 skipped

---

## 1. Tool Coverage Map (79 Tools)

### Legend
- **GOOD** — Test file invokes the MCP tool handler directly (via `createMockServer` or similar)
- **PARTIAL** — Test file tests the underlying functions but NOT the MCP handler wrapper (rate limiter, error handling, parameter validation)
- **MISSING** — No test file exists for the source module

| # | Tool Name | Has Test | Test File(s) | Coverage |
|---|-----------|----------|-------------|----------|
| 1 | `activate_project` | YES | activation.test.js | PARTIAL |
| 2 | `activate_role` | YES | roles.test.js | PARTIAL |
| 3 | `analyze_prompt` | NO | — | **MISSING** |
| 4 | `analyze_tool_prompts` | YES | tool-prompt-analyzer.test.js | PARTIAL |
| 5 | `assert_step_evidence` | YES | task-runtime.test.js | PARTIAL |
| 6 | `auto_validate_output` | YES | caveman.test.js | PARTIAL |
| 7 | `caveman_budget` | YES | caveman.test.js | PARTIAL |
| 8 | `checkpoint_task` | YES | checkpoint-rewind.test.js | PARTIAL |
| 9 | `classify_content` | YES | policy-generator.test.js | PARTIAL |
| 10 | `classify_failure` | YES | failure-classifier.test.js | GOOD |
| 11 | `classify_tokens` | NO | — | **MISSING** |
| 12 | `compact_conversation_state` | YES | compaction-handlers.test.js | PARTIAL |
| 13 | `compact_diff` | YES | compaction-handlers.test.js | PARTIAL |
| 14 | `compact_logs` | YES | compaction-handlers.test.js | PARTIAL |
| 15 | `compress_checkpoint_results` | YES | checkpoint-rewind.test.js | PARTIAL |
| 16 | `compress_markdown` | YES | index-handlers.test.js | PARTIAL |
| 17 | `compress_tool_output` | YES | compression-orchestrator.test.js | PARTIAL |
| 18 | `compression_stats` | YES | compression-orchestrator.test.js | PARTIAL |
| 19 | `create_handoff` | YES | session-memory.test.js | PARTIAL |
| 20 | `decompress_tool_output` | YES | compression-orchestrator.test.js | PARTIAL |
| 21 | `dependency_validate` | YES | validators-handlers.test.js | GOOD |
| 22 | `detect_hallucination` | YES | verification.test.js | PARTIAL |
| 23 | `detect_output_dedup` | YES | watchdog.test.js | PARTIAL |
| 24 | `detect_prompt_injection` | YES | prompt-injection.test.js | PARTIAL |
| 25 | `detect_typosquat` | YES | validators-handlers.test.js | GOOD |
| 26 | `diff_since_last` | YES | verification.test.js | PARTIAL |
| 27 | `doctor_runtime_setup` | YES | activation.test.js | PARTIAL |
| 28 | `evaluate_rag_quality` | YES | rag-eval.test.js | GOOD |
| 29 | `fix_issue` | YES | commands-fix-issues.test.js | PARTIAL |
| 30 | `generate_policy` | YES | policy-generator.test.js | PARTIAL |
| 31 | `get_context` | YES | rules-handlers.test.js | PARTIAL |
| 32 | `get_model_profile` | YES | misc-handlers.test.js | PARTIAL |
| 33 | `get_project_state` | YES | project-state-handlers.test.js | PARTIAL |
| 34 | `get_prompt_script` | YES | activation.test.js | PARTIAL |
| 35 | `get_rules` | YES | rules-handlers.test.js | PARTIAL |
| 36 | `get_rules_bundle` | YES | rules-handlers.test.js | PARTIAL |
| 37 | `get_session_state` | YES | session-memory.test.js | PARTIAL |
| 38 | `get_skill` | YES | skills-handlers.test.js | PARTIAL |
| 39 | `groundedness_score` | YES | verification.test.js | PARTIAL |
| 40 | `guardrail_pipeline` | YES | guardrail-pipeline.test.js | PARTIAL |
| 41 | `headroom_learn_run` | NO | — | **MISSING** |
| 42 | `headroom_learn_status` | NO | — | **MISSING** |
| 43 | `list_checkpoints` | YES | checkpoint-rewind.test.js | PARTIAL |
| 44 | `list_rules` | YES | rules-handlers.test.js | PARTIAL |
| 45 | `list_skills` | YES | skills-handlers.test.js | PARTIAL |
| 46 | `promote_summary_to_checkpoint` | YES | compaction-handlers.test.js | PARTIAL |
| 47 | `resume_from_handoff` | YES | session-memory.test.js | PARTIAL |
| 48 | `resume_task` | YES | project-state-handlers.test.js | PARTIAL |
| 49 | `review_pr` | YES | commands-review-prs.test.js | PARTIAL |
| 50 | `rewind_to_checkpoint` | YES | checkpoint-rewind.test.js | PARTIAL |
| 51 | `run_command` | YES | misc-handlers.test.js | PARTIAL |
| 52 | `run_test_and_report` | YES | watchdog.test.js | PARTIAL |
| 53 | `sast_list_rules` | YES | sast-rules.test.js | PARTIAL |
| 54 | `save_observation` | YES | memory-handlers.test.js | PARTIAL |
| 55 | `save_project_state` | YES | project-state-handlers.test.js | PARTIAL |
| 56 | `save_session_state` | YES | session-memory.test.js | PARTIAL |
| 57 | `scan_sast_rules` | YES | sast-rules.test.js | PARTIAL |
| 58 | `search_observations` | YES | memory-handlers.test.js | PARTIAL |
| 59 | `semantic_compress` | NO | — | **MISSING** |
| 60 | `session_health` | YES | watchdog.test.js | PARTIAL |
| 61 | `session_watchdog` | YES | watchdog.test.js | PARTIAL |
| 62 | `smart_outline` | YES | code-reading-handlers.test.js | GOOD |
| 63 | `smart_read` | YES | code-reading-handlers.test.js | GOOD |
| 64 | `smart_unfold` | YES | code-reading-handlers.test.js | GOOD |
| 65 | `start_task_contract` | YES | task-runtime.test.js | PARTIAL |
| 66 | `todo` | YES | todo-manager.test.js | PARTIAL |
| 67 | `triage_issue` | YES | commands-triage.test.js | PARTIAL |
| 68 | `ttsr_check_output` | NO | — | **MISSING** |
| 69 | `ttsr_stats` | NO | — | **MISSING** |
| 70 | `validate_bad_code` | YES | validators-handlers.test.js | GOOD |
| 71 | `validate_caveman_output` | YES | caveman.test.js | PARTIAL |
| 72 | `validate_cicd_config` | YES | cicd-validator.test.js | PARTIAL |
| 73 | `validate_eval_dataset` | YES | rag-eval.test.js | GOOD |
| 74 | `validate_git_commit` | YES | validators-handlers.test.js | GOOD |
| 75 | `validate_input_schema` | YES | json-schema-validation.test.js | PARTIAL |
| 76 | `validate_policy` | YES | policy-generator.test.js | PARTIAL |
| 77 | `validate_prompt_standards` | NO | — | **MISSING** |
| 78 | `validate_response_style` | YES | validators-handlers.test.js | GOOD |
| 79 | `verify_file_sync` | YES | verification.test.js | PARTIAL |

**Summary**: 8 tools MISSING tests (0%), 14 tools GOOD coverage, 57 tools PARTIAL coverage.

---

## 2. Module Coverage (src/ → test/)

### Source files WITH test files

| Source Module | Test File(s) | Coverage Notes |
|--------------|-------------|----------------|
| activation.js | activation.test.js | Tests functions, not MCP handler |
| caveman.js | caveman.test.js | Tests functions, not MCP handler |
| cicd-validator.js | cicd-validator.test.js | Tests functions, not MCP handler |
| code-reading.js | code-reading-handlers.test.js, code-reading.test.js, code-reading-phase2.test.js | **GOOD** — handler-level tests |
| commands.js | misc-handlers.test.js | Tests `run_command` handler |
| commands/review-prs.js | commands-review-prs.test.js | Tests functions, not MCP handler |
| commands/triage.js | commands-triage.test.js | Tests `triageIssue()` function only |
| compaction.js | compaction-handlers.test.js, compaction.test.js, state-compaction.test.js | Tests functions, not MCP handler |
| compression-orchestrator.js | compression-orchestrator.test.js | Tests functions, not MCP handler |
| failure-classifier.js | failure-classifier.test.js | **GOOD** — handler-level tests |
| fix-issues.js | commands-fix-issues.test.js | Tests functions, not MCP handler |
| index.js | index-handlers.test.js | Tests `compress_markdown` handler |
| memory.js | memory-handlers.test.js, memory.test.js, session-memory.test.js | Tests functions, not MCP handler |
| policy-generator.js | policy-generator.test.js | Tests functions, not MCP handler |
| profiles.js | profiles.test.js | Tests functions, not MCP handler |
| project-state.js | project-state-handlers.test.js, project-state.test.js | Tests functions, not MCP handler |
| prompt-injection.js | prompt-injection.test.js | Tests functions, not MCP handler |
| rag-eval.js | rag-eval.test.js | **GOOD** — tests via MCP tool handler |
| roles.js | roles.test.js | Tests functions, not MCP handler |
| rules.js | rules-handlers.test.js | Tests functions, not MCP handler |
| sast-rules.js | sast-rules.test.js | Tests functions, not MCP handler |
| skills.js | skills-handlers.test.js, skills.test.js | Tests functions, not MCP handler |
| task-runtime.js | task-runtime.test.js | Tests functions, not MCP handler |
| todo-manager.js | todo-manager.test.js | Tests functions, not MCP handler |
| tool-prompt-analyzer.js | tool-prompt-analyzer.test.js | Tests functions, not MCP handler |
| validators.js | validators-handlers.test.js, validators.test.js, json-schema-validation.test.js | Mixed — some handler-level |
| verification.js | verification.test.js | Tests functions, not MCP handler |
| watchdog.js | watchdog.test.js | Tests functions, not MCP handler |

### Source files WITHOUT test files (CRITICAL)

| Source Module | Tools Affected | Risk |
|--------------|---------------|------|
| **phase1-tools.js** | `semantic_compress`, `classify_tokens`, `validate_prompt_standards`, `analyze_prompt` | HIGH — 4 tools with zero handler tests |
| **learn-trigger.js** | `headroom_learn_run`, `headroom_learn_status` | MEDIUM — LearnTrigger class tested, but MCP handlers untested |
| **ttsr-manager.js** | `ttsr_check_output`, `ttsr_stats` | MEDIUM — TtsrManager class tested, but MCP handlers untested |

### Sub-modules WITHOUT any test coverage

| Sub-module | Files | Risk |
|-----------|-------|------|
| src/interceptors/ | base.js | LOW — infrastructure only |
| src/observability/ | logger.js, metrics.js | MEDIUM — no tests for logging/metrics |

---

## 3. Skipped Tests (6 total)

| # | Test File | Test Name | Skip Reason |
|---|-----------|-----------|-------------|
| 1 | helpers.test.js | "should reject symlink escapes" | `{ skip: process.platform === 'win32' }` — Windows doesn't support symlink semantics needed |
| 2 | skills.test.js | "should have skills directory" | `{ skip: !hasSkillsDir && 'Skills directory not found' }` — No `.claude/skills/` in test env |
| 3 | skills.test.js | "should have at least 3 skills" | Same — directory missing |
| 4 | skills.test.js | "should have SKILL.md in each skill" | Same — directory missing |
| 5 | skills.test.js | "should have non-empty SKILL.md files" | Same — directory missing |
| 6 | skills.test.js | "should have frontmatter with name/desc" | Same — directory missing |

**Analysis**: 5 of 6 skips are environment-dependent (no skills directory in test CI). 1 skip is platform-dependent (Windows). All are legitimate conditional skips, not disabled tests.

---

## 4. Edge Case Gaps for Recently-Added Tools

### Tools with zero test coverage (CRITICAL)

| Tool | Missing Tests |
|------|--------------|
| `semantic_compress` | Happy path, error on empty input, tier selection (1/2/3), code block preservation, compression ratio bounds |
| `classify_tokens` | Happy path, empty text, large text, preserve-list word handling |
| `validate_prompt_standards` | Happy path, RFC 2119 compliance, ornamental tag detection, anti-pattern detection |
| `analyze_prompt` | Happy path, empty prompt, multi-section prompt, directive extraction |
| `headroom_learn_run` | Happy path, concurrent runs, directory not found, empty sessions |
| `headroom_learn_status` | Happy path, status shape validation |
| `ttsr_check_output` | Happy path, rule matching, no-match return null, empty text |
| `ttsr_stats` | Happy path, stats shape validation |

### Tools with PARTIAL coverage — missing edge cases

| Tool | Missing Edge Cases |
|------|-------------------|
| `guardrail_pipeline` | MCP handler not tested — missing: rate limiter blocking, direction parameter validation, custom rails override, HALT formatting |
| `detect_prompt_injection` | Rate limiter blocking, empty text input, very long text |
| `compress_tool_output` | Rate limiter blocking, error handling path |
| `dependency_validate` | File not found scenario, unreadable file, non-existent project root |
| `review_pr` | Rate limiter blocking, missing all optional params, invalid PR URL format |
| `triage_issue` | Rate limiter blocking, empty title, very long body, all-labels edge case |
| `fix_issue` | Rate limiter blocking, file not found, invalid JSON input |
| `validate_bad_code` | Rate limiter blocking, empty code input, binary file path |
| `compress_markdown` | File not found, non-markdown file, very large file |
| `save_project_state` | Rate limiter blocking, concurrent writes, corrupt state file |
| `resume_task` | Missing checkpoint label, invalid tier parameter |
| `session_watchdog` | Rate limiter blocking, empty observation list |

### Rate limiter gap (systemic)

**Every single tool** has a rate limiter check at the top of its handler. **No test file** tests the rate limiter blocking path. This means 79 tools have an untested error path.

---

## 5. Integration Gaps

### Tool pairs that should be tested together

| Tool Pair | Why | Gap |
|-----------|-----|-----|
| `guardrail_pipeline` + `detect_prompt_injection` | Guardrail pipeline uses injection detection internally | No integration test verifying the pipeline correctly delegates to injection rail |
| `compress_tool_output` + `semantic_compress` | Compression orchestrator calls semantic compression | No test verifying end-to-end compression pipeline |
| `compress_tool_output` + `decompress_tool_output` | Round-trip integrity | Tested separately but no round-trip integration test |
| `detect_hallucination` + `groundedness_score` | Both verify output quality | No test verifying they compose correctly |
| `checkpoint_task` + `compress_checkpoint_results` + `rewind_to_checkpoint` | Full checkpoint lifecycle | Tested individually but no lifecycle integration test |
| `create_handoff` + `resume_from_handoff` | Session handoff round-trip | Tested individually but no round-trip test |
| `todo` + `start_task_contract` + `assert_step_evidence` | Task lifecycle | No integration test for the full workflow |
| `activate_project` + `activate_role` + `get_model_profile` | Session bootstrap sequence | E2E test covers activation but not the full sequence |
| `scan_sast_rules` + `validate_bad_code` | SAST → validation pipeline | No integration test |
| `ttsr_check_output` + `guardrail_pipeline` | Both validate output safety | No integration test |
| `validate_prompt_standards` + `validate_response_style` | Prompt → response quality chain | No integration test |

### Missing E2E scenarios

The only E2E test (`e2e-stdio.test.js`) tests server initialization and tool listing. Missing:
- Tool invocation over stdio (actual `tools/call` with real parameters)
- Error handling over stdio (invalid tool name, missing required params)
- Multi-tool workflow over stdio (activate → task → checkpoint → resume)

---

## 6. Missing Error Path Tests

### Tools that do file I/O without testing file-not-found

| Tool | I/O Operation | Missing Error Test |
|------|--------------|-------------------|
| `compress_markdown` | Reads markdown file from disk | File not found, permission denied, binary file |
| `dependency_validate` | Reads source file to check imports | File not found (has error handling but not tested) |
| `fix_issue` | Reads/writes source files | File not found, permission denied |
| `save_project_state` | Writes JSON state file | Disk full, permission denied, concurrent write |
| `get_project_state` | Reads JSON state file | File not found, corrupt JSON |
| `verify_file_sync` | Reads files to compare | File not found, permission denied |
| `smart_read` | Reads files from disk | File not found, binary file |
| `smart_unfold` | Reads files for context expansion | File not found, binary file |
| `scan_sast_rules` | Reads source files for scanning | File not found, binary file, permission denied |
| `review_pr` | Reads diff content | Invalid diff format |
| `get_skill` | Reads SKILL.md files | Missing SKILL.md, corrupt frontmatter |

---

## 7. Recommendations (Priority Order)

### P0 — Critical (security/tools with zero coverage)

1. **Create `test/phase1-tools.test.js`** — Test all 4 tools: `semantic_compress`, `classify_tokens`, `validate_prompt_standards`, `analyze_prompt`. These are recently-added security/compression tools with zero handler-level tests.

2. **Add rate limiter blocking tests** — Create a shared test helper that verifies rate limiter returns the expected HALT message. Test at least 5 representative tools (security-critical ones first: `detect_prompt_injection`, `guardrail_pipeline`, `validate_bad_code`, `scan_sast_rules`, `validate_input_schema`).

3. **Create `test/learn-trigger-tools.test.js`** — Test `headroom_learn_run` and `headroom_learn_status` MCP handlers. The underlying `LearnTrigger` class is tested but the handler wrapper is not.

4. **Create `test/ttsr-manager-tools.test.js`** — Test `ttsr_check_output` and `ttsr_stats` MCP handlers. The underlying `TtsrManager` class is tested but the handler wrapper is not.

### P1 — High (integration/edge cases)

5. **Add file-not-found error tests** to `compress_markdown`, `dependency_validate`, `fix_issue`, `scan_sast_rules`, `smart_read`. These tools read files but don't test the error path.

6. **Add round-trip integration test** for `compress_tool_output` → `decompress_tool_output` to verify data integrity.

7. **Add checkpoint lifecycle integration test**: `checkpoint_task` → `compress_checkpoint_results` → `list_checkpoints` → `rewind_to_checkpoint`.

8. **Add guardrail pipeline integration test**: Verify `guardrail_pipeline` correctly invokes `detect_prompt_injection` for injection detection, and test the `direction` and `rails` parameter overrides.

### P2 — Medium (coverage gaps)

9. **Add E2E `tools/call` test** in `e2e-stdio.test.js` — Verify at least 3 tools can be invoked over stdio with real parameters.

10. **Test `src/observability/logger.js` and `metrics.js`** — Add basic unit tests for the observability modules.

11. **Test `src/interceptors/base.js`** — Add unit tests for the interceptor registry.

12. **Expand skills.test.js conditional tests** — Use `test.skipIf` with environment detection instead of runtime `skip` so the 5 skipped tests run when skills are available.

### P3 — Low (quality improvements)

13. **Upgrade PARTIAL tools to GOOD** — For each tool with PARTIAL coverage, add handler-level tests using the `createMockServer` pattern established in `validators-handlers.test.js`. Focus on the 22 recently-added tools first.

14. **Add boundary condition tests** for `semantic_compress` (very long text, empty text, code-only text, mixed code/prose).

15. **Add integration test** for `activate_project` → `activate_role` → `get_model_profile` session bootstrap sequence.

---

## Appendix: Source Module → Test File Cross-Reference

```
src/activation.js          → test/activation.test.js
src/anti-hallucination.js  → test/anti-hallucination.test.js
src/caveman.js             → test/caveman.test.js
src/cicd-validator.js      → test/cicd-validator.test.js
src/code-reading.js        → test/code-reading-handlers.test.js, code-reading.test.js, code-reading-phase2.test.js
src/commands.js            → test/misc-handlers.test.js
src/commands/review-prs.js → test/commands-review-prs.test.js
src/commands/triage.js     → test/commands-triage.test.js
src/compaction.js          → test/compaction-handlers.test.js, compaction.test.js, state-compaction.test.js
src/compression-orchestrator.js → test/compression-orchestrator.test.js
src/dependency-resolution.js → test/dependency-resolution.test.js
src/failure-classifier.js  → test/failure-classifier.test.js
src/fix-issues.js          → test/commands-fix-issues.test.js
src/guardrail-pipeline.js  → test/guardrail-pipeline.test.js
src/helpers.js             → test/helpers.test.js
src/index.js               → test/index-handlers.test.js, e2e-stdio.test.js
src/memory.js              → test/memory-handlers.test.js, memory.test.js, session-memory.test.js
src/phase1-tools.js        → ❌ NO TEST FILE
src/learn-trigger.js       → ❌ NO TEST FILE (class tested in ttsr-learn-metrics.test.js)
src/profiles.js            → test/profiles.test.js
src/project-state.js       → test/project-state-handlers.test.js, project-state.test.js
src/prompt-conventions.js  → test/prompt-conventions.test.js
src/prompt-injection.js    → test/prompt-injection.test.js
src/prompt-standards.js    → ❌ NO TEST FILE
src/rag-eval.js            → test/rag-eval.test.js
src/rate-limiter.js        → test/rate-limiter.test.js
src/resources.js           → test/resources.test.js
src/roles.js               → test/roles.test.js
src/rules.js               → test/rules-handlers.test.js
src/safety-guards.js       → test/safety-guards.test.js
src/sast-rules.js          → test/sast-rules.test.js
src/skills.js              → test/skills-handlers.test.js, skills.test.js
src/state-compaction.js    → test/state-compaction.test.js
src/task-runtime.js        → test/task-runtime.test.js
src/todo-manager.js        → test/todo-manager.test.js
src/tool-prompt-analyzer.js → test/tool-prompt-analyzer.test.js
src/ttsr-manager.js        → ❌ NO TEST FILE (class tested in ttsr-learn-metrics.test.js)
src/validators.js          → test/validators-handlers.test.js, validators.test.js, json-schema-validation.test.js
src/verification.js        → test/verification.test.js
src/watchdog.js            → test/watchdog.test.js
```
