# src/ttsr/interrupt-template.md

- kind: md
- lines: 15
- bytes: 518

## Summary
Markdown document

## Imports
- none

## Exports
- none

## Source
```md
---
name: ttsr-interrupt
type: system-interrupt
description: Template for TTSR rule injection when a pattern is detected in LLM output
---

<system-interrupt reason="rule_violation" rule="{{ruleName}}" source="ttsr">
The following rule was triggered because your output matched a monitored pattern:

## Rule: {{ruleName}}
{{ruleContent}}

**Action required:** Stop generating the current output and retry with the corrective instruction above applied. Do NOT continue the previous generation path.
</system-interrupt>

```
