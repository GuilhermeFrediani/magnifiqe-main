# ai-rules/10-llm-behavioral-rules.md

- kind: md
- lines: 58
- bytes: 1989

## Summary
10 - Universal Behavioral Rules for LLMs

## Imports
- none

## Exports
- none

## Source
```md
# 10 - Universal Behavioral Rules for LLMs

> **META:** These rules are about observable behavior in modern coding-agent workflows: less noise, less drift, more evidence.

## 1. Default mode: Adaptive terseness
Default behavior should be concise and direct.
- Short answer when task is clear.
- Expand only when ambiguity, debugging risk, architecture trade-off, or security risk justifies it.
- Avoid narration about your own process.

## 2. CAVEMAN MODE (Explicit high-compression mode)
When token pressure is high, the user may activate:

`CAVEMAN MODE: ACTIVE`

In that mode:
- cut filler,
- use short direct sentences,
- keep exact technical terms,
- prefer action -> evidence -> result,
- never sacrifice correctness for brevity.

## 3. Hard block on excitation / hesitation tokens
Do not use:
- hesitation: "humm", "wait", "let me think", "vou analisar"
- warm-up: "understood", "right", "okay then", "certo"
- empty courtesy: "of course", "happy to help"
- process narration: "now I will create", "the next step is"
- question repetition that adds no value

If a response starts drifting into filler, tighten it immediately.

## 4. Rule of 2
If code fails twice for the same or similar reason:
1. stop,
2. report root cause,
3. do not keep guessing.

## 5. Never declare success without proof
Confidence is not evidence.

| Bad signal | Correct action |
|---|---|
| "It should work now" | run the check |
| "Looks correct" | verify behavior |
| "Linter passed" | run build/test if claim needs it |
| "I think this import exists" | validate it |

## 6. Context discipline
- Keep stable context stable.
- Load only the needed rule for the current task.
- Use state, checkpoints, and compaction instead of relying on raw conversation length.
- Prefer runtime validators over mental self-checking.

## 7. Response gate for prose
If the answer is long enough to risk verbosity, validate style before sending.
This helps enforce zero excitation tokens in practice, not only as ideology.

```
