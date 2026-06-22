# Development Rules — Magnifiqe MCP

## Default Context

Stack Perfeita MCP is a Model Context Protocol server that disciplines coding agents with validation, state checkpoints, context control, security scanning, compression, and 79+ tools.

**Package structure:**

| Module | Purpose |
|--------|---------|
| `src/index.js` | Entry point, server orchestration |
| `src/config.js` | All constants, patterns, thresholds |
| `src/helpers.js` | Utility functions (atomicWrite, parseSkillFrontmatter) |
| `src/validators.js` | Code quality validation, guardrail pipeline |
| `src/code-reading.js` | AST parsing + smart reading |
| `src/anti-hallucination.js` | Verification + watchdog + caveman + prompt injection |
| `src/compression-orchestrator.js` | CCR pipeline, content detection, cache alignment |
| `src/safety-guards.js` | Rate limiting, dedup, loop detection |
| `src/prompt-injection.js` | Multi-layered prompt injection detection |
| `src/failure-classifier.js` | Structured failure classification |
| `src/rag-eval.js` | RAG quality evaluation metrics |
| `src/policy-generator.js` | Content-safety policy generation |
| `src/sast-rules.js` | Custom SAST security rules |
| `src/todo-manager.js` | Phased task management |

**Terminology:**
- "agent" = the coding agent using this MCP server (not this server itself)
- "HALT" = hard stop prefix for error responses
- "CCR" = Compression-Compress-Restore (reversible compression)
- "SAST" = Static Application Security Testing

## Code Quality

- **NEVER** use `any` type unless absolutely necessary
- **NEVER** use `ReturnType<>` — use actual type names
- **NEVER** use inline imports or `await import()`
- **NEVER** use `console.log` — use `process.stderr.write` (stdout is JSON-RPC)
- **NEVER** edit auto-generated files directly (ai-docs/manifest.json)
- **MUST** use `HALT —` prefix for all error tool responses
- **MUST** wrap tool handlers with `withRateLimit` middleware
- **MUST** return structured PASS/FAIL with evidence in validation tools
- **SHOULD** use `atomicWrite` for all file persistence
- **SHOULD** keep tool handlers under 50 lines
- **SHOULD** use ES module syntax (import/export)

## Token Economy

- Compression hierarchy: LOSSLESS → STRUCTURAL → SEMANTIC → AGGRESSIVE
- Tool outputs >10K tokens → auto-apply lossless compression
- Tool outputs >30K tokens → apply structural compression
- Tool outputs >100K tokens → apply semantic compression + CCR store
- CCR sentinels (`_ccr_dropped`) visible to LLM for progressive disclosure
- CacheAligner detects volatile fields (UUIDs, timestamps) — never mutates
- Never compress below 50 tokens (MIN_OUTPUT_FLOOR)


## Anti-Hallucination

- Every validation tool returns structured evidence (not claims)
- Output dedup: SHA-256 hash ring (20 entries) detects LLM loops
- Session watchdog: 30s timeout per operation
- Groundedness score: 0-10 based on verifiable claims
- Caveman budgets: 30 words / 10 lines for simple tasks

## Testing

- Test the contract the system exposes — not internal details
- No `mock.module()` — it leaks across files
- Every new tool needs a smoke test
- Assert exact strings only when downstream parses them
- Use per-test `vi.spyOn()` with `afterEach` restore

## Prompts

- ALL prompts in `.md` files, never inline strings
- Import via `import content from "./prompt.md" with { type: "text" }`
- Use RFC 2119 keywords: NEVER = MUST NOT, AVOID = SHOULD NOT
- Tool prompt anatomy: purpose → grammar → examples → failures → anti-patterns → recap

## Changelog

- Per-section format in CHANGELOG.md
- Sections: Added, Changed, Fixed, Removed
- Reference issue/PR numbers where applicable
