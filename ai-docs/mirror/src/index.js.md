# src/index.js

- kind: js
- lines: 190
- bytes: 8534

## Summary
stack-perfeita-mcp v4.8.0 MCP server that exposes project AI rules as tools for any IDE/agent. Architecture: Modular — each tool category lives in its own file under src/. This file is the entry point: it wires everything together and starts the server. Registered modules: Core:       resources, rules, validators, skills, code-reading, commands, memory, project-state, compaction, profiles, roles, task-runtime, activation, council, council-live, anti-hallucination New:        compression-orchestrator (CCR pipeline), ttsr-manager (TTSR rules), learn-trigger (headroom_learn periodic cycle) Inline:     compress_markdown (CCR-enhanced) Usage: node src/index.js --rules-dir /path/to/ai-rules

## Imports
- `@modelcontextprotocol/sdk/server/mcp.js`
- `@modelcontextprotocol/sdk/server/stdio.js`
- `zod`
- `path`
- `./config.js`
- `./helpers.js`
- `./resources.js`
- `./rules.js`
- `./validators.js`
- `./skills.js`
- `./code-reading.js`
- `./commands.js`
- `./memory.js`
- `./project-state.js`
- `./compaction.js`
- `./profiles.js`
- `./roles.js`
- `./task-runtime.js`
- `./activation.js`
- `./council.js`
- `./council-orchestrator.js`
- `./anti-hallucination.js`
- `./compression-orchestrator.js`
- `./ttsr-manager.js`
- `./learn-trigger.js`
- `./phase1-tools.js`
- `./observability/logger.js`
- `./observability/metrics.js`
- `./safety-guards.js`

## Exports
- none

## Source
```js
#!/usr/bin/env node
/**
 * stack-perfeita-mcp v4.8.0
 * MCP server that exposes project AI rules as tools for any IDE/agent.
 *
 * Architecture: Modular — each tool category lives in its own file under src/.
 * This file is the entry point: it wires everything together and starts the server.
 *
 * Registered modules:
 *   Core:       resources, rules, validators, skills, code-reading, commands,
 *               memory, project-state, compaction, profiles, roles, task-runtime,
 *               activation, council, council-live, anti-hallucination
 *   New:        compression-orchestrator (CCR pipeline), ttsr-manager (TTSR rules),
 *               learn-trigger (headroom_learn periodic cycle)
 *   Inline:     compress_markdown (CCR-enhanced)
 *
 * Usage:
 *   node src/index.js --rules-dir /path/to/ai-rules
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";

// ─── Modules ───────────────────────────────────────────────────────────────
import { RULES_DIR, PROJECT_ROOT } from "./config.js";
import { readFile, safeResolvePath } from "./helpers.js";

// Core tool registrations
import { registerResources } from "./resources.js";
import { registerRulesTools } from "./rules.js";
import { registerValidatorsTools } from "./validators.js";
import { registerSkillsTools } from "./skills.js";
import { registerCodeReadingTools } from "./code-reading.js";
import { registerCommandsTools } from "./commands.js";
import { registerMemoryTools } from "./memory.js";
import { registerProjectStateTools } from "./project-state.js";
import { registerCompactionTools } from "./compaction.js";
import { registerProfilesTools } from "./profiles.js";
import { registerRolesTools } from "./roles.js";
import { registerTaskRuntimeTools } from "./task-runtime.js";
import { registerActivationTools } from "./activation.js";
import { registerCouncilTools } from "./council.js";
import { registerCouncilLiveTools } from "./council-orchestrator.js";
import { registerAntiHallucinationTools } from "./anti-hallucination.js";

// New integrations
import { registerCompressionTools, compressToolOutput } from "./compression-orchestrator.js";
import { registerTtsrTools } from "./ttsr-manager.js";
import { registerLearnTools, learnTrigger } from "./learn-trigger.js";
import { registerSemanticCompressionTools, registerPromptStandardsTools } from "./phase1-tools.js";

// Observability
import { logger } from "./observability/logger.js";
import { metrics } from "./observability/metrics.js";

// Safety
import { checkRateLimit } from "./safety-guards.js";

// ─── MCP Protocol Protection ───────────────────────────────────────────────
// stdout is reserved for JSON-RPC. Any console.log breaks the protocol.
// eslint-disable-next-line no-console
console.log = (...args) => process.stderr.write(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n');

// ─── Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "stack-perfeita-mcp",
  version: "4.8.0",
});

// ─── Register all tools and resources ──────────────────────────────────────

// Core modules (existing)
registerResources(server);
registerRulesTools(server);
registerValidatorsTools(server);
registerSkillsTools(server);
registerCodeReadingTools(server);
registerCommandsTools(server);
registerMemoryTools(server);
registerProjectStateTools(server);
registerCompactionTools(server);
registerProfilesTools(server);
registerRolesTools(server);
registerTaskRuntimeTools(server);
registerActivationTools(server);
registerCouncilTools(server);
registerCouncilLiveTools(server);
registerAntiHallucinationTools(server);

// New modules (previously disconnected — now wired)
registerCompressionTools(server);
registerTtsrTools(server);
registerLearnTools(server);
registerSemanticCompressionTools(server);
registerPromptStandardsTools(server);

// ─── Tool: compress_markdown (CCR-enhanced) ────────────────────────────────
server.tool(
  "compress_markdown",
  "Reads a markdown file (.md) from disk and compresses it through the CCR pipeline. Detects content type, applies appropriate compression level, and stores the original for decompression. Returns compressed output with stats.",
  { path: z.string().describe("Path to the markdown file to compress (relative to project root or absolute).") },
  async ({ path }) => {
    try {
      const rateLimitHit = checkRateLimit("compress_markdown");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      // Path resolution: try absolute first, then relative to PROJECT_ROOT
      let absPath;
      const { isAbsolute } = await import("path");
      if (isAbsolute(path)) {
        absPath = safeResolvePath(PROJECT_ROOT, path);
      } else {
        absPath = resolve(PROJECT_ROOT, path);
      }

      const { existsSync } = await import("fs");
      if (!existsSync(absPath)) {
        return { content: [{ type: "text", text: `HALT — File not found: ${absPath}` }] };
      }

      const content = readFile(absPath);
      if (!content) {
        return { content: [{ type: "text", text: `HALT — Could not read file: ${absPath}` }] };
      }

      // CCR pipeline compression
      const result = compressToolOutput(content, { toolName: "compress_markdown" });

      // Track metrics
      metrics.recordCompression({
        tokensBefore: result.stats.originalTokens,
        tokensAfter: result.stats.compressedTokens,
        durationMs: 0,
        level: ["none", "lossless", "structural", "semantic", "aggressive"][result.stats.level] || "none",
      });

      const responseText = result.sentinel
        ? `[CCR compressed: ${result.stats.originalTokens} → ${result.stats.compressedTokens} tokens (${result.stats.savingsPercent}% saved, level ${result.stats.level})]\nDecompress hash: ${result.sentinel}\n\n${result.compressed}`
        : `[No compression needed: ${result.stats.originalTokens} tokens]\n\n${result.compressed}`;

      return { content: [{ type: "text", text: responseText }] };
    } catch (e) {
      logger.error("compress_markdown_failed", { path, error: e.message });
      return { content: [{ type: "text", text: `HALT — Error compressing markdown: ${e.message}` }] };
    }
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("server_started", {
  version: "4.8.0",
  rulesDir: RULES_DIR,
  projectRoot: PROJECT_ROOT,
});

// ─── Start headroom_learn periodic trigger ─────────────────────────────────
learnTrigger.start();
logger.info("learn_trigger_started", { intervalMs: 300_000 });

// ─── Orphan Detection ──────────────────────────────────────────────────────
// Auto-exit when parent process dies (stdin closed / ppid changed)
// Prevents zombie MCP server processes when IDE exits unexpectedly.

function gracefulExit(reason) {
  logger.info("server_exiting", { reason });
  learnTrigger.stop();
  process.exit(0);
}

process.stdin.on('end', () => gracefulExit('stdin ended (parent closed)'));
process.stdin.on('close', () => gracefulExit('stdin closed'));

// ppid-based orphan detection (Unix only; no-op on Windows)
if (process.platform !== 'win32') {
  const initialPpid = process.ppid;
  const heartbeat = setInterval(() => {
    if (process.ppid !== initialPpid) {
      gracefulExit(`parent died (ppid ${initialPpid} → ${process.ppid})`);
    }
  }, 30_000);
  if (heartbeat.unref) heartbeat.unref();
}

```
