# ai-rules/13-live-council-runtime.md

- kind: md
- lines: 112
- bytes: 3432

## Summary
Live Council Runtime

## Imports
- none

## Exports
- none

## Source
```md
# Live Council Runtime

> Goal: make Council + Chairman work as a live, provider-agnostic protocol that can run inside any IDE, with one chosen model or mixed providers, without depending on special hidden features.

## 1. One runtime, many providers
- The protocol must work with GPT, Claude, Gemini, GLM, MiMo, Qwen or any other model that can follow prompt instructions.
- Do not hardcode provider-specific behavior into the reasoning contract.
- The runtime lives in:
  - strict prompts
  - compact JSON schemas
  - normalization / repair for weak JSON output
  - activation heuristics that choose simple vs deep mode

## 2. Two execution modes
### Simple mode
Use one model call when the task is narrow, direct or low-blast-radius.

Flow:
1. compact context in Markdown
2. one I/O agent call
3. direct answer

### Deep mode
Use structured deliberation when ambiguity, trade-offs or blast radius are high.

Flow:
1. same compact context base
2. 5 bot positions
3. shuffled peer review
4. Chairman synthesis in JSON
5. final I/O agent converts JSON -> natural answer

## 3. Auto mode
- Auto mode must choose between simple and deep.
- Do not ask the model to decide by vibes only.
- Prefer heuristics based on:
  - ambiguity
  - trade-off intensity
  - blast radius
  - safety / trust impact
  - cross-module surface
  - failure cost

## 4. Shared anti-theater contract
All live stages must follow these rules:
- JSON only when a schema is requested
- no markdown fences
- no intro phrases
- no decorative self-talk
- no invented evidence
- if evidence is missing, say it explicitly in the proper field
- max 3 list items per field unless a schema says otherwise
- no persona blending; each turn is one role only

## 5. Bot output contract
Each bot position should stay compact and machine-checkable.
Required shape:
- `bot`
- `problem_frame`
- `thesis`
- `assumptions[]`
- `opportunities[]`
- `risks[]`
- `next_steps[]`
- `evidence`
- `confidence`
- `tags[]`

## 6. Peer review contract
Each review should score the target position and surface what the Chairman cannot ignore.
Required shape:
- `reviewer_bot`
- `target_bot`
- `correctness_score`
- `novelty_score`
- `feasibility_score`
- `risk_awareness_score`
- `verdict`
- `critique`
- `adopted_ideas[]`
- `major_concerns[]`

## 7. Chairman contract
The Chairman must not summarize decoratively.
Required shape:
- `recommended_answer`
- `alternatives[]`
- `next_step`
- `rationale[]`
- `risk_ranking[]`
- `evidence_missing[]`
- `confidence`

## 8. I/O final contract
- The final answer is natural language, not JSON.
- It must not mention bots, council, chairman or internal analysis.
- It must preserve uncertainty honestly when evidence is missing.
- It should give the user the answer first, then the next step if useful.

## 9. Token economy rules
- Use Markdown source packs, compact indexes and thematic bundles before raw code.
- Never paste the whole repo into the prompt.
- Reuse the same system contract across turns.
- Prefer compact schema-first outputs over free-form essays.
- Normalize bad JSON instead of rerunning the same call blindly.

## 10. Practical operating posture
- Simple mode is the default for most direct tasks.
- Deep mode is optional, not always-on.
- A single provider key is enough; personas come from prompts, not from separate accounts.
- Different models may be mixed later, but the protocol must remain valid even with one chosen model.

```
