# ai-rules/03-token-economy.md

- kind: md
- lines: 41
- bytes: 1775

## Summary
03 - Token Economy & Context Management (2026)

## Imports
- none

## Exports
- none

## Source
```md
# 03 - Token Economy & Context Management (2026)

> **META:** Goal is not just "fewer tokens". Goal is **high-signal context**: block filler, compact aggressively, preserve state, and recover only what is relevant.

## 1. Hard block on excitation tokens
The AI must not waste tokens on warm-up, hesitation, or process narration.

Blocked examples:
- "Humm, let me think..."
- "Got it, I'll analyze the code"
- "Understood, here is the updated version"
- "Agora vou criar a função"
- "Aqui está o código abaixo"

Preferred behavior:
- If code is requested -> return code or take the tool action.
- If explanation is requested -> answer directly, without warm-up.
- If token pressure is high -> explicitly activate `CAVEMAN MODE: ACTIVE`.

## 2. Context lifecycle
Use a deliberate lifecycle:
- **Activate:** load stable project context once.
- **Cache:** keep rules/manifests stable and reusable.
- **Compact:** summarize long logs, diffs, and long session state.
- **Recover:** restore only the needed checkpoint, state, or observation.
- **Drop noise:** failed attempts should not stay in active context forever.

## 3. Semantic compaction
- Do not carry the full history of failed attempts.
- After a milestone, compress state into a short summary.
- Prefer compacted state + checkpoints over replaying the whole conversation.

## 4. Output hygiene
- Before long prose, use `validate_response_style` if the answer risks growing noisy.
- Caveman mode is allowed and encouraged under token pressure, but technical precision must stay intact.

## 5. Long-file and long-log discipline
- Avoid dumping entire large docs/logs into active context.
- Prefer structure first (`smart_read`, `smart_outline`, compaction tools).
- Read only the portion needed for the current step.

```
