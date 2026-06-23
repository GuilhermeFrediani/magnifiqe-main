# Karpathy Anti-Slop Guidelines (OBRIGATÓRIO)

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ASK.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, STOP. Name what's confusing. Ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---


# STACK PERFEITA MCP — LIVE IGNITION

Ative o Stack Perfeita neste projeto com deliberação adaptativa.

## INÍCIO DE SESSÃO
1. Call `activate_project()`
2. Call `doctor_runtime_setup()`
3. Call `get_model_profile("claude")` or the active provider
4. Call `activate_role("implementer", model="claude")`
5. Call `start_task_contract(...)`
6. Call `get_rules_bundle("index")`
7. Call `get_project_state()`

## DELIBERAÇÃO
- Se a tarefa for simples, curta ou local: use fluxo normal
- Se houver arquitetura, migração, refactor grande, segurança, trade-off forte, ambiguidade alta ou múltiplos módulos:
  - Call `run_council_auto(...)`
  - If deep mode is selected, use `get_council_execution_prompt(...)` for each stage
  - Preserve the full 5-bot flow: contrarian, first_principles, expansionist, outsider, executor
  - Normalize weak JSON with `normalize_council_json(...)` before recording or using it

## MODO OPERACIONAL
- Adaptive terseness by default
- If token pressure is high: set `CAVEMAN MODE: ACTIVE`
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice -> HALT and report root cause

## OUTPUT GATE
Before shipping code or claiming success:
- Run `validate_bad_code` for code blocks
- Run `dependency_validate` when new imports/assets were introduced
- Run `validate_response_style` before long explanatory prose when needed
- Record proof with `assert_step_evidence(...)`
- If foundation is rotten, stop feature work and fix the base first
- Use `get_prompt_script(...)` to load the exact workflow prompt without opening all docs
- Prefer `npm run docs:ai` before long AI/code-review sessions
