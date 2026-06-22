# ai-rules/01-ai-workflow-strict.md

- kind: md
- lines: 45
- bytes: 1727

## Summary
AIPIHKAL Protocol: Strict Workflow for Real Tasks

## Imports
- none

## Exports
- none

## Source
```md
# AIPIHKAL Protocol: Strict Workflow for Real Tasks

> **META:** This file defines the operational invariants for long-running coding sessions: evidence first, zero blind looping, and no delivery without verification.

---

## 1. Rule of 2 (Anti-Loop)
- If code/test/run fails once -> analyze root cause.
- You get **one correction attempt**.
- If the second attempt fails for the same or a very similar reason -> **HALT**.
- Report the blocker clearly. Do not keep guessing.

## 2. Grounded work only
- Never assume files, folders, imports, APIs, or symbols exist.
- Before editing large code, inspect structure first (`smart_outline`, `smart_read`, `smart_unfold`).
- Before claiming a new import/path works, validate it.
- Before long sessions, activate project context and read state instead of "trying to remember".

## 3. Mandatory proof after changes
Immediately after a real modification, collect proof:
- read the changed file,
- run the relevant test/build/lint/typecheck,
- or produce another concrete verification signal.

Never claim "done" without proof.

## 4. One step at a time
- Solve one concrete problem at a time.
- Avoid hidden scope expansion during a bugfix.
- If the base is rotten, stop the feature and fix the base first.

## 5. Output gate
Before delivering a final answer:
1. Requirements checked.
2. Code validated if code changed.
3. Imports/assets validated if new references were introduced.
4. Long prose checked for filler if needed.
5. Claims backed by evidence.

| Claim | Requires | Not enough |
|---|---|---|
| "tests pass" | real test output | "logic looks right" |
| "build works" | build exit 0 | "linter passed" |
| "bug fixed" | symptom no longer reproduces | "I changed the code" |

```
