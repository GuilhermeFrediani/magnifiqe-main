# src/rules.js

- kind: js
- lines: 252
- bytes: 9661

## Summary
Stack Perfeita MCP — Rules tools list_rules, get_rules, get_context MCP tool registrations.

## Imports
- `zod`
- `fs`
- `path`
- `./config.js`
- `./helpers.js`
- `./rate-limiter.js`

## Exports
- `registerRulesTools`

## Source
```js
/**
 * Stack Perfeita MCP — Rules tools
 * list_rules, get_rules, get_context MCP tool registrations.
 */

import { z } from "zod";
import { existsSync } from "fs";
import { join } from "path";
import { RULES_DIR, SRC_DIR, PROJECT_ROOT, TOPIC_MAP, RULE_DESCRIPTIONS } from "./config.js";
import { safeResolvePath, readFile, minifyTokens, listRuleFiles, getRuleByTopic, formatRuleList } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";

export function registerRulesTools(server) {
  // Tool: list_rules
  server.tool(
    "list_rules",
    "Lists all available AI rule files in the project. Use this first to know what rules exist.",
    {},
    async () => {
      try {
        const files = listRuleFiles();

        if (files.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No rule files found in: ${RULES_DIR}\n\nCreate markdown files in an 'ai-rules/' folder next to your source code.`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `## Available rule files in: ${RULES_DIR}\n\n${formatRuleList(files)}\n\nUse get_rules(topic) to read any of these files.`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in list_rules: ${e.message}` }] };
      }
    }
  );

  // Tool: get_rules
  server.tool(
    "get_rules",
    "Returns the content of a specific rules file. Use topic keywords like: coding, workflow, bad, architecture, security, tokens, behavior, frontend, backend, debugging, systematic. Mode 'summary' returns description only (~20 tokens); 'full' returns entire content.",
    {
      topic: z.string().describe("Topic keyword or filename. Examples: 'coding', 'workflow', 'bad', 'behavior', '02-coding-standards.md'"),
      mode: z.enum(["summary", "full"]).default("full").describe("Return mode: 'summary' = description only (token-efficient), 'full' = entire file content"),
    },
    async ({ topic, mode }) => {
      const rateLimitHit = rateLimiter.check("get_rules");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const mappedFile = TOPIC_MAP[topic.toLowerCase()];
        let result = null;

        if (mappedFile) {
          const filePath = safeResolvePath(RULES_DIR, mappedFile);
          const content = readFile(filePath);
          if (content) result = { file: mappedFile, content };
        }

        if (!result) {
          const found = getRuleByTopic(topic);
          if (found) {
            safeResolvePath(RULES_DIR, found.file);
            result = found;
          }
        }

        if (!result) {
          const files = listRuleFiles();
          return {
            content: [{
              type: "text",
              text: `No rules found for topic: "${topic}"\n\nAvailable files:\n${files.map(f => `- ${f}`).join("\n")}\n\nTopic keywords: ${Object.keys(TOPIC_MAP).join(", ")}`,
            }],
          };
        }

        if (mode === "summary") {
          const desc = RULE_DESCRIPTIONS[result.file] || "Custom rule file";
          return {
            content: [{
              type: "text",
              text: `## ${result.file}\n\n${desc}\n\nCall get_rules(topic, mode='full') for complete content.`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `## ${result.file}\n\n${minifyTokens(result.content)}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_rules: ${e.message}` }] };
      }
    }
  );

  // Tool: get_context
  server.tool(
    "get_context",
    "Returns the CONTEXT.md file for a specific module/feature folder. Always call this before editing files in a module.",
    { module_path: z.string().describe("Module folder name or path relative to src/. Examples: 'orders', 'users', 'payments'") },
    async ({ module_path }) => {
      const rateLimitHit = rateLimiter.check("get_context");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const safeModule = module_path.replace(/\.\./g, "");
        const candidates = [
          join(SRC_DIR, safeModule, "CONTEXT.md"),
          join(PROJECT_ROOT, "src", safeModule, "CONTEXT.md"),
          join(PROJECT_ROOT, safeModule, "CONTEXT.md"),
        ];

        for (const candidate of candidates) {
          try {
            safeResolvePath(SRC_DIR, join(safeModule, "CONTEXT.md"));
          } catch {
            continue;
          }
          if (existsSync(candidate)) {
            const content = readFile(candidate);
            return {
              content: [{
                type: "text",
                text: `## CONTEXT.md — ${safeModule}\n\n${content}`,
              }],
            };
          }
        }

        return {
          content: [{
            type: "text",
            text: `No CONTEXT.md found for module: "${safeModule}"\n\nSearched in:\n${candidates.map(c => `- ${c}`).join("\n")}\n\nCreate a CONTEXT.md in the module folder.`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_context: ${e.message}` }] };
      }
    }
  );

  // Tool: get_rules_bundle (cache-aware: stable order for prefix caching)
  server.tool(
    "get_rules_bundle",
    "Returns project rules concatenated in stable alphabetical order, optimized for prompt caching. Mode 'index' returns filenames + descriptions (~200 tokens). Mode 'full' returns all rule content. Filter by task_type to load only relevant rules.",
    {
      mode: z.enum(["index", "full"]).default("index").describe("Return mode: 'index' = filenames + descriptions (token-efficient), 'full' = all rule content concatenated."),
      task_type: z.string().optional().describe("Filter rules by task type. Examples: 'frontend', 'backend', 'testing', 'security', 'debugging'. Returns only relevant rules."),
    },
    async ({ mode, task_type }) => {
      const rateLimitHit = rateLimiter.check("get_rules_bundle");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        let files = listRuleFiles();
        if (files.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No rule files found in: ${RULES_DIR}`,
            }],
          };
        }

        // Filter by task_type if specified
        if (task_type) {
          const taskTypeLower = task_type.toLowerCase();
          const taskTypeMap = {
            "frontend": ["07-frontend-semantic.md", "02-coding-standards.md"],
            "backend": ["08-backend-architecture.md", "02-coding-standards.md"],
            "testing": ["06-ci-cd-testing.md", "05-debugging-mastery.md"],
            "security": ["04-security-secrets.md"],
            "debugging": ["05-debugging-mastery.md", "11-systematic-debugging.md"],
            "architecture": ["08-backend-architecture.md", "12-council-deliberation.md"],
            "workflow": ["01-ai-workflow-strict.md", "10-llm-behavioral-rules.md"],
            "tokens": ["03-token-economy.md"],
            "council": ["12-council-deliberation.md", "13-live-council-runtime.md"],
            "bad": ["09-bad-patterns-halt.md"],
            "overview": ["00-project-overview.md"],
          };

          const relevantFiles = taskTypeMap[taskTypeLower];
          if (relevantFiles) {
            files = files.filter((f) => relevantFiles.includes(f));
          } else {
            // Fuzzy match: find rules whose description contains the task_type
            files = files.filter((f) => {
              const desc = (RULE_DESCRIPTIONS[f] || "").toLowerCase();
              const name = f.toLowerCase();
              return desc.includes(taskTypeLower) || name.includes(taskTypeLower);
            });
          }

          if (files.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No rules found matching task_type: "${task_type}"\n\nAvailable task types: frontend, backend, testing, security, debugging, architecture, workflow, tokens, council, bad, overview`,
              }],
            };
          }
        }

        if (mode === "index") {
          const lines = files.map(f => {
            const desc = RULE_DESCRIPTIONS[f] || "Custom rule file";
            return `- **${f}** — ${desc}`;
          });
          return {
            content: [{
              type: "text",
              text: `## Rules Index (${files.length} files)\n\n${lines.join("\n")}\n\nUse get_rules(topic) for full content of any rule.`,
            }],
          };
        }

        // mode=full: concatenate all rules in stable order
        const sections = [];
        for (const file of files) {
          const content = readFile(safeResolvePath(RULES_DIR, file));
          if (content) {
            sections.push(`<!-- rule: ${file} -->\n## ${file}\n\n${minifyTokens(content)}`);
          }
        }

        const totalTokens = sections.reduce((sum, s) => sum + s.length, 0);
        return {
          content: [{
            type: "text",
            text: `## Rules Bundle (${files.length} files, ~${Math.round(totalTokens / 4)} tokens)\n\n${sections.join("\n\n---\n\n")}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_rules_bundle: ${e.message}` }] };
      }
    }
  );
}

```
