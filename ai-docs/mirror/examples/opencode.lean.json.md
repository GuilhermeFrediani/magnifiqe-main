# examples/opencode.lean.json

- kind: json
- lines: 26
- bytes: 554

## Summary
No inline summary detected

## Imports
- none

## Exports
- none

## Source
```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "./ai-docs/compact-index.md",
    "./ai-docs/bundle-index.md",
    "./examples/ide-lean.prompt.md",
    "./ai-rules/03-token-economy.md",
    "./ai-rules/12-council-deliberation.md",
    "./ai-rules/13-live-council-runtime.md"
  ],
  "mcp": {
    "stack-perfeita": {
      "type": "local",
      "command": [
        "npx",
        "stack-perfeita-mcp",
        "--project-root",
        ".",
        "--rules-dir",
        "./ai-rules"
      ],
      "enabled": true
    }
  }
}

```
