# src/council-gate.js

- kind: js
- lines: 108
- bytes: 3282

## Summary
Council Gate — scoring heuristic and formatting for council_need evaluation. Decides whether a task warrants full council deliberation.

## Imports
- none

## Exports
- `evaluateCouncilNeed`
- `formatGateResult`

## Source
```js
/**
 * Council Gate — scoring heuristic and formatting for council_need evaluation.
 * Decides whether a task warrants full council deliberation.
 */

/**
 * Evaluates whether a task warrants Council deliberation based on risk signals.
 *
 * @param {object} params
 * @param {string} params.objective - Short description of the task or decision.
 * @param {string} [params.task_type=""] - Task label (architecture, bugfix, refactor, security-review).
 * @param {string} [params.blast_radius="local"] - How far a bad decision would spread.
 * @param {number} [params.ambiguity=0] - How ambiguous the task framing is from 0-5.
 * @param {number} [params.tradeoff_intensity=0] - How strong the trade-offs are from 0-5.
 * @param {boolean} [params.touches_multiple_modules=false] - Whether the work spans multiple modules/services.
 * @param {boolean} [params.safety_critical=false] - Whether security, safety, or compliance risk is material.
 * @param {string} [params.failure_cost="low"] - Cost of a wrong decision.
 * @returns {{ score: number, recommendation: string, maximum_rounds: number, reasons: string[] }}
 */
export function evaluateCouncilNeed({
  objective,
  task_type = "",
  blast_radius = "local",
  ambiguity = 0,
  tradeoff_intensity = 0,
  touches_multiple_modules = false,
  safety_critical = false,
  failure_cost = "low",
}) {
  let score = 0;
  const reasons = [];

  if (blast_radius === "module") {
    score += 2;
    reasons.push("module blast radius");
  }
  if (blast_radius === "system") {
    score += 4;
    reasons.push("system-wide blast radius");
  }

  score += Number(ambiguity || 0);
  if (ambiguity >= 3) reasons.push(`ambiguity ${ambiguity}/5`);

  score += Number(tradeoff_intensity || 0);
  if (tradeoff_intensity >= 3) reasons.push(`trade-offs ${tradeoff_intensity}/5`);

  if (touches_multiple_modules) {
    score += 2;
    reasons.push("cross-module impact");
  }

  if (safety_critical) {
    score += 4;
    reasons.push("safety/security sensitivity");
  }

  if (failure_cost === "medium") {
    score += 2;
    reasons.push("medium failure cost");
  }
  if (failure_cost === "high") {
    score += 4;
    reasons.push("high failure cost");
  }

  const taskSignal = `${objective} ${task_type}`.toLowerCase();
  if (/(architecture|architect|migration|security|refactor|performance|multi-agent|debug|design|protocol|api)/.test(taskSignal)) {
    score += 2;
    reasons.push("complex task signal");
  }

  let recommendation = "skip";
  let maximum_rounds = 0;

  if (score >= 10) {
    recommendation = "full";
    maximum_rounds = 2;
  } else if (score >= 5) {
    recommendation = "standard";
    maximum_rounds = 1;
  }

  if (reasons.length === 0) reasons.push("low coordination overhead preferred");

  return {
    score,
    recommendation,
    maximum_rounds,
    reasons,
  };
}

/**
 * Formats a gate result into a human-readable string.
 *
 * @param {{ score: number, recommendation: string, maximum_rounds: number, reasons: string[] }} result
 * @returns {string}
 */
export function formatGateResult(result) {
  return [
    `- Score: ${result.score}`,
    `- Recommendation: ${result.recommendation}`,
    `- Suggested rounds: ${result.maximum_rounds}`,
    `- Reasons: ${result.reasons.join(', ')}`,
  ].join("\n");
}

```
