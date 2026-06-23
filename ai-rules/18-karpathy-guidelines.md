# 18 - Karpathy Guidelines (Anti-Slop Behavioral Rules)

> **META:** Derived from Andrej Karpathy's observations on LLM coding pitfalls. These 4 pillars reduce hallucinations, overcomplication, and unnecessary changes. Complementary to Rule 10 (Behavioral Rules) and Rule 17 (Anti-Complexity).

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ASK.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, STOP. Name what's confusing. Ask.

```markdown
✅ CORRECT: "Before implementing, I need to clarify: 1. Scope... 2. Format... 3. Fields..."
❌ WRONG: [immediately writes 200 lines of code with wrong assumptions]
```

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

```markdown
✅ CORRECT: def calculate_discount(amount, percent): return amount * (percent / 100)
❌ WRONG: [Strategy pattern + Factory + Config class for a simple calculation]
```

## 3. Surgical Changes
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

```markdown
✅ CORRECT: Only modify the specific function requested
❌ WRONG: "While I was here, I also refactored these 5 other functions..."
```

## 4. Goal-Driven Execution
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

## Integration with Magnifiqe MCP

These guidelines are automatically enforced via:
- **Tool validation:** `validate_bad_code` checks for overcomplication patterns
- **Output enforcement:** `enforce_output_format` validates surgical changes
- **Anti-delirium:** `verify_claims` ensures assumptions are stated
- **Watchdog:** `session_health` monitors goal-driven execution

**Activation:** These rules are loaded automatically when `activate_project` is called at session start.
