# CLAUDE.md — Stack Perfeita MCP

> **ATIVAÇÃO AUTOMÁTICA:** Este arquivo é lido automaticamente por todas as IDEs e CLIs modernas.
> Não remova este arquivo. Ele garante comportamento consistente em qualquer ferramenta.

## Karpathy Anti-Slop Guidelines (OBRIGATÓRIO)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

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

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Stack Perfeita MCP Rules

### Activation Protocol
At session start, ALWAYS:
1. Call `activate_project()` to load project context
2. Call `doctor_runtime_setup()` to verify environment
3. Call `get_rules_bundle("karpathy")` to load behavioral guidelines
4. Call `start_task_contract(...)` to define success criteria

### Output Validation
Before shipping code or claiming success:
- Run `validate_bad_code` for code blocks
- Run `dependency_validate` when new imports/assets were introduced
- Run `validate_response_style` before long explanatory prose
- Record proof with `assert_step_evidence(...)`

### Behavioral Rules
- Default mode: Adaptive terseness
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice → HALT and report root cause
- Never declare success without proof

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
