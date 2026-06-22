# package.json

- kind: json
- lines: 68
- bytes: 1761

## Summary
No inline summary detected

## Imports
- none

## Exports
- none

## Source
```json
{
  "name": "stack-perfeita-mcp",
  "version": "4.8.0",
  "description": "MCP server that disciplines coding agents with validation, state checkpoints, context control, AI-first Markdown mirrors, a real 5-bot Council plus Chairman, and a model-agnostic Council Live runtime.",
  "type": "module",
  "main": "src/index.js",
  "bin": {
    "stack-perfeita": "./bin/setup-ide.js",
    "stack-perfeita-mcp": "./src/index.js"
  },
  "files": [
    "src/",
    "bin/",
    "scripts/",
    "examples/",
    "ai-rules/",
    "ai-docs/",
    ".claude/skills/",
    "README.md",
    "PROMPTS.md",
    "opencode.json",
    "package.json"
  ],
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test test/*.test.js",
    "test:watch": "node --test --watch test/*.test.js",
    "test:smoke:council": "node test-smoke-council.mjs",
    "setup:ide": "node bin/setup-ide.js",
    "setup:ide:init": "node bin/setup-ide.js init",
    "setup:ide:lean": "node bin/setup-ide.js --lean",
    "docs:ai": "node scripts/export-ai-markdown.js",
    "validate": "npm test && npm run test:smoke:council && npm run docs:ai",
    "lint": "eslint src/ test/"
  },
  "keywords": [
    "mcp",
    "cursor",
    "copilot",
    "ai-rules",
    "llm",
    "coding-standards",
    "context-engineering",
    "agent-runtime",
    "markdown-export",
    "council",
    "council-live",
    "byok"
  ],
  "license": "MIT",
  "dependencies": {
    "@babel/parser": "^7.29.7",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "acorn": "^8.16.0",
    "acorn-loose": "^8.5.2",
    "zod": "^3.25.0"
  },
  "engines": {
    "node": ">=18"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.5.0",
    "globals": "^17.6.0"
  }
}

```
