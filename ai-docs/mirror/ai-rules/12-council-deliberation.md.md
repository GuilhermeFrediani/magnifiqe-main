# ai-rules/12-council-deliberation.md

- kind: md
- lines: 86
- bytes: 3215

## Summary
Council Deliberation Protocol

## Imports
- none

## Exports
- none

## Source
```md
# Council Deliberation Protocol

> Goal: add real multi-perspective deliberation without turning the MCP into theater, latency sludge, or endless debate.

## 1. Activation gate first
- Do **not** run Council on every task.
- Use Council when the task has at least one of:
  - architecture or migration impact
  - non-obvious trade-offs
  - cross-module blast radius
  - security / safety relevance
  - ambiguity in framing
- Skip Council for trivial CRUD, renames, boilerplate, or narrow bugfixes.

## 2. The five bots have non-overlapping mandates
### The Contrarian
- Hunts for weak assumptions, hidden failure modes, and unjustified confidence.
- Must challenge thin evidence and optimistic execution claims.
- Must not disagree for theater; every objection must point to a safer path.

### The First Principles Thinker
- Rebuilds the solution from zero.
- Must separate facts, assumptions, and invariants.
- Must resist inherited architecture bias.

### The Expansionist
- Hunts for opportunities that the default plan ignored.
- Must distinguish quick wins from scope creep.
- Must name DX, performance, security, automation, or reuse upside.

### The Outsider
- Challenges the framing itself.
- Must assume the original question may be wrong or incomplete.
- Must surface sunk-cost bias, false constraints, and blind spots.

### The Executor
- Converts the best direction into implementable next steps.
- Must define sequencing, evidence, rollback, and acceptance.
- Must not pretend unresolved architectural risks are implementation details.

## 3. Peer review is mandatory on complex work
- Council is not real if every bot speaks once and nobody challenges anything.
- Each bot must review assigned peers from a shuffled queue.
- Reviews must score:
  - correctness
  - novelty
  - feasibility
  - risk awareness
- Reviews must preserve major concerns for synthesis.
- Standard mode uses one review per bot.
- Full mode uses two reviews per bot.

## 4. Chairman rules
- The Chairman is **not** a vibe-based summarizer.
- The Chairman does not replace the five bots; the Chairman synthesizes their structured output.
- Final synthesis must contain:
  - consensus
  - disagreements
  - discarded ideas and why
  - risk ranking
  - recommended next step
  - confidence level
  - evidence still missing

## 5. Anti-theater rules
- Do not simulate multiple minds with cosmetic persona names only.
- If positions are not structurally different, call that out.
- If peer review is incomplete, synthesis must halt.
- If the same objection repeats without new evidence, stop further rounds.
- Maximum rounds: 2.

## 6. Integration with Stack Perfeita runtime
- Start with task contract and project activation.
- Use Council as an optional deliberation layer, not a replacement for validation.
- After Chairman synthesis, continue with:
  - `assert_step_evidence(...)`
  - `validate_bad_code(...)`
  - `dependency_validate(...)`
  - `checkpoint_task(...)`

## 7. Expected behavior
- Prefer real disagreement over fake harmony.
- Prefer explicit uncertainty over invented certainty.
- Prefer one justified next step over ten decorative suggestions.
- Prefer a compact Markdown trace over long conversational theater.

```
