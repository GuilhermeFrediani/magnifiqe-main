# Integration

Setup por IDE, manifesto de instruções, leitura AI-first e integração operacional.

## Included files
- `src/resources.js` — Stack Perfeita MCP — MCP Resource registrations Exposes ai-rules/*.md as MCP resources for discovery and reading.
- `src/rules.js` — Stack Perfeita MCP — Rules tools list_rules, get_rules, get_context MCP tool registrations.
- `src/skills.js` — Stack Perfeita MCP — Skills tools list_skills and get_skill MCP tool registrations.
- `bin/setup-ide.js` — stack-perfeita setup script Generates IDE configuration files and can bootstrap starter rules/skills. Usage: stack-perfeita                 # Generate IDE config files only stack-perfeita init            # Generate configs + starter ai-rules + starter skills stack-perfeita --bootstrap     # Same as init stack-perfeita --minimal       # Only .cursorrules stack-perfeita --lean          # Generate lean prompt/config for lower token usage stack-perfeita --force         # Overwrite existing files
- `examples/ide-lean.prompt.md` — Stack Perfeita — Lean IDE Prompt
- `examples/mcp.cursor.bundled-rules.json` — No inline summary detected
- `examples/mcp.cursor.json` — No inline summary detected
- `examples/opencode.lean.json` — No inline summary detected
- `.cursorrules` — No inline summary detected
- `.windsurfrules` — No inline summary detected
- `.github/copilot-instructions.md` — STACK PERFEITA MCP — LIVE IGNITION
- `README.md` — [Stack Perfeita MCP](https://github.com/GuilhermeFrediani/magnifiqe)
- `PROMPTS.md` — Prompts: Stack Perfeita MCP Live — VERSÃO CONDENSADA
- `opencode.json` — No inline summary detected

## src/resources.js

- kind: js
- lines: 155
- summary: Stack Perfeita MCP — MCP Resource registrations Exposes ai-rules/*.md as MCP resources for discovery and reading.

```js
/**
 * Stack Perfeita MCP — MCP Resource registrations
 * Exposes ai-rules/*.md as MCP resources for discovery and reading.
 */

import { RULES_DIR, RULE_DESCRIPTIONS, PROJECT_STATE_FILE, COUNCIL_STATE_FILE, MEMORY_FILE } from "./config.js";
import { safeResolvePath, readFile, listRuleFiles } from "./helpers.js";
import { existsSync, readFileSync } from "fs";

export function registerResources(server) {
  // Resource: ai-rules-list
  server.resource(
    "ai-rules-list",
    "ai-rules://list",
    async () => {
      const files = listRuleFiles();
      const lines = files.map(f => {
        const desc = RULE_DESCRIPTIONS[f] || "Custom rule file";
        return `- **${f}** — ${desc}`;
      });
      return {
        contents: [{
          uri: "ai-rules://list",
          mimeType: "text/markdown",
          text: `## Available rule files\n\n${lines.join("\n")}`,
        }],
      };
    }
  );

  // Resource: individual rule files
  for (const file of listRuleFiles()) {
    const desc = RULE_DESCRIPTIONS[file] || "Custom rule file";
    server.resource(
      desc,
      `ai-rules://${file}`,
      async () => {
        const content = readFile(safeResolvePath(RULES_DIR, file));
        return {
          contents: [{
            uri: `ai-rules://${file}`,
            mimeType: "text/markdown",
            text: content || `File not found: ${file}`,
          }],
        };
      }
    );
  }

  // Resource: project-state (real-time)
  server.resource(
    "project-state",
    "state://project",
    async () => {
      try {
        if (!existsSync(PROJECT_STATE_FILE)) {
          return {
            contents: [{
              uri: "state://project",
              mimeType: "application/json",
              text: JSON.stringify({ status: "no state file" }),
            }],
          };
        }
        const data = JSON.parse(readFileSync(PROJECT_STATE_FILE, "utf-8"));
        return {
          contents: [{
            uri: "state://project",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch {
        return {
          contents: [{
            uri: "state://project",
            mimeType: "application/json",
            text: JSON.stringify({ status: "error reading state" }),
          }],
        };
      }
    }
  );

  // Resource: council-state (real-time)
  server.resource(
    "council-state",
    "state://council",
    async () => {
      try {
        if (!existsSync(COUNCIL_STATE_FILE)) {
          return {
            contents: [{
              uri: "state://council",
              mimeType: "application/json",
              text: JSON.stringify({ status: "no council state" }),
            }],
          };
        }
        const data = JSON.parse(readFileSync(COUNCIL_STATE_FILE, "utf-8"));
        return {
          contents: [{
            uri: "state://council",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch {
        return {
          contents: [{
            uri: "state://council",
            mimeType: "application/json",
            text: JSON.stringify({ status: "error reading council state" }),
          }],
        };
      }
    }
  );

  // Resource: session-memory (real-time)
  server.resource(
    "session-memory",
    "state://memory",
    async () => {
      try {
        if (!existsSync(MEMORY_FILE)) {
          return {
            contents: [{
              uri: "state://memory",
              mimeType: "application/json",
              text: JSON.stringify({ observations: [] }),
            }],
          };
        }
        const data = JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
        return {
          contents: [{
            uri: "state://memory",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch {
        return {
          contents: [{
            uri: "state://memory",
            mimeType: "application/json",
            text: JSON.stringify({ observations: [] }),
          }],
        };
      }
    }
  );
}

```

## src/rules.js

- kind: js
- lines: 252
- summary: Stack Perfeita MCP — Rules tools list_rules, get_rules, get_context MCP tool registrations.

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

## src/skills.js

- kind: js
- lines: 100
- summary: Stack Perfeita MCP — Skills tools list_skills and get_skill MCP tool registrations.

```js
/**
 * Stack Perfeita MCP — Skills tools
 * list_skills and get_skill MCP tool registrations.
 */

import { z } from "zod";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { SKILLS_DIR } from "./config.js";
import { safeResolvePath, readFile, parseSkillFrontmatter } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";
function listSkillFiles() {
  try {
    return readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ dir: d.name, path: join(SKILLS_DIR, d.name, "SKILL.md") }))
      .filter(s => existsSync(s.path));
  } catch {
    return [];
  }
}

export function registerSkillsTools(server) {
  // Tool: list_skills
  server.tool(
    "list_skills",
    "Lists all available agent skills (SKILL.md files in .claude/skills/). Skills are composable, discoverable task playbooks that the agent invokes before responding.",
    {},
    async () => {
      try {
        const skills = listSkillFiles();

        if (skills.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No skills found in: ${SKILLS_DIR}\nCreate .claude/skills/<name>/SKILL.md with YAML frontmatter (name, description).`,
            }],
          };
        }

        const lines = skills.map(s => {
          const content = readFile(s.path);
          const fm = content ? parseSkillFrontmatter(content) : {};
          const name = fm.name || s.dir;
          const desc = fm.description || "No description";
          const compat = fm.compatibility || "";
          return `- **${name}** — ${desc}${compat ? ` [${compat}]` : ""}`;
        });

        return {
          content: [{
            type: "text",
            text: `## Available skills in: ${SKILLS_DIR}\n\n${lines.join("\n")}\n\nUse get_skill(name) to read a skill's full content.`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in list_skills: ${e.message}` }] };
      }
    }
  );

  // Tool: get_skill
  server.tool(
    "get_skill",
    "Returns the full content of a specific skill. Use skill name or directory name. Skills guide the agent through specialized workflows.",
    { name: z.string().describe("Skill name or directory name. Examples: build-test-verify, git-commit, core-conventions") },
    async ({ name }) => {
      const rateLimitHit = rateLimiter.check("get_skill");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const safeName = name.replace(/\.\./g, "").replace(/[\\/]/g, "");
        const skillPath = safeResolvePath(SKILLS_DIR, join(safeName, "SKILL.md"));

        if (!existsSync(skillPath)) {
          const available = listSkillFiles().map(s => s.dir);
          return {
            content: [{
              type: "text",
              text: `Skill not found: "${name}"\n\nAvailable skills:\n${available.map(a => `- ${a}`).join("\n")}`,
            }],
          };
        }

        const content = readFile(skillPath);
        return {
          content: [{
            type: "text",
            text: `## Skill: ${safeName}\n\n${content}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_skill: ${e.message}` }] };
      }
    }
  );
}

```

## bin/setup-ide.js

- kind: js
- lines: 215
- summary: stack-perfeita setup script Generates IDE configuration files and can bootstrap starter rules/skills. Usage: stack-perfeita                 # Generate IDE config files only stack-perfeita init            # Generate configs + starter ai-rules + starter skills stack-perfeita --bootstrap     # Same as init stack-perfeita --minimal       # Only .cursorrules stack-perfeita --lean          # Generate lean prompt/config for lower token usage stack-perfeita --force         # Overwrite existing files

```js
#!/usr/bin/env node

/**
 * stack-perfeita setup script
 * Generates IDE configuration files and can bootstrap starter rules/skills.
 *
 * Usage:
 *   stack-perfeita                 # Generate IDE config files only
 *   stack-perfeita init            # Generate configs + starter ai-rules + starter skills
 *   stack-perfeita --bootstrap     # Same as init
 *   stack-perfeita --minimal       # Only .cursorrules
 *   stack-perfeita --lean          # Generate lean prompt/config for lower token usage
 *   stack-perfeita --force         # Overwrite existing files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PROJECT_DIR = process.cwd();
const args = process.argv.slice(2);

const FORCE = args.includes('--force');
const MINIMAL = args.includes('--minimal');
const LEAN = args.includes('--lean');
const BOOTSTRAP = args.includes('init') || args.includes('--bootstrap');

const FULL_PROMPT = `
# STACK PERFEITA MCP — LIVE IGNITION

Ative o Stack Perfeita neste projeto com deliberação adaptativa.

## INÍCIO DE SESSÃO
1. Call \`activate_project()\`
2. Call \`doctor_runtime_setup()\`
3. Call \`get_model_profile("claude")\` or the active provider
4. Call \`activate_role("implementer", model="claude")\`
5. Call \`start_task_contract(...)\`
6. Call \`get_rules_bundle("index")\`
7. Call \`get_project_state()\`

## DELIBERAÇÃO
- Se a tarefa for simples, curta ou local: use fluxo normal
- Se houver arquitetura, migração, refactor grande, segurança, trade-off forte, ambiguidade alta ou múltiplos módulos:
  - Call \`run_council_auto(...)\`
  - If deep mode is selected, use \`get_council_execution_prompt(...)\` for each stage
  - Preserve the full 5-bot flow: contrarian, first_principles, expansionist, outsider, executor
  - Normalize weak JSON with \`normalize_council_json(...)\` before recording or using it

## MODO OPERACIONAL
- Adaptive terseness by default
- If token pressure is high: set \`CAVEMAN MODE: ACTIVE\`
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice -> HALT and report root cause

## OUTPUT GATE
Before shipping code or claiming success:
- Run \`validate_bad_code\` for code blocks
- Run \`dependency_validate\` when new imports/assets were introduced
- Run \`validate_response_style\` before long explanatory prose when needed
- Record proof with \`assert_step_evidence(...)\`
- If foundation is rotten, stop feature work and fix the base first
- Use \`get_prompt_script(...)\` to load the exact workflow prompt without opening all docs
- Prefer \`npm run docs:ai\` before long AI/code-review sessions
`;

const LEAN_PROMPT = `
# STACK PERFEITA MCP — LEAN IDE MODE

1. Call \`activate_project()\`
2. Call \`doctor_runtime_setup()\`
3. Call \`activate_role(...)\`
4. Call \`start_task_contract(...)\`
5. Load only needed rules/bundles
6. If task is structural or ambiguous: call \`run_council_auto(...)\`
7. Record proof with \`assert_step_evidence(...)\`
8. Before final code: \`validate_bad_code\`
9. Before new imports/assets: \`dependency_validate\`
10. If prose grows too much: \`validate_response_style(..., mode="caveman")\`
11. Same failure twice -> HALT
12. Use \`get_prompt_script("initial")\` or \`get_prompt_script("resume")\` when you need the full workflow
`;

const FULL_OPENCODE_CONFIG = {
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "./README.md",
    "./ai-docs/compact-index.md",
    "./ai-docs/bundle-index.md",
    "./PROMPTS.md",
    "./ai-rules/01-ai-workflow-strict.md",
    "./ai-rules/03-token-economy.md",
    "./ai-rules/12-council-deliberation.md",
    "./ai-rules/13-live-council-runtime.md"
  ],
  "mcp": {
    "stack-perfeita": {
      "type": "local",
      "command": ["npx", "stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"],
      "enabled": true
    }
  }
};

const LEAN_OPENCODE_CONFIG = {
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
      "command": ["npx", "stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"],
      "enabled": true
    }
  }
};

function writeFileSafe(filePath, content, description) {
  if (fs.existsSync(filePath) && !FORCE) {
    console.log(`[~] Skipped (already exists): ${filePath}`);
    return false;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
  console.log(`[+] Generated: ${description}`);
  return true;
}

function copyFileSafe(src, dest, description) {
  if (fs.existsSync(dest) && !FORCE) {
    return false;
  }
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  if (description) console.log(`[+] Copied: ${description}`);
  return true;
}

function copyDirSafe(srcDir, destDir, description) {
  if (!fs.existsSync(srcDir)) return false;
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirSafe(srcPath, destPath);
    } else {
      copyFileSafe(srcPath, destPath);
    }
  }

  if (description) console.log(`[+] Bootstrapped: ${description}`);
  return true;
}

const selectedPrompt = LEAN ? LEAN_PROMPT : FULL_PROMPT;
const selectedOpenCodeConfig = LEAN ? LEAN_OPENCODE_CONFIG : FULL_OPENCODE_CONFIG;

console.log('Stack Perfeita MCP - IDE Setup\n');

writeFileSafe(path.join(PROJECT_DIR, '.cursorrules'), selectedPrompt, '.cursorrules');

if (!MINIMAL) {
  writeFileSafe(path.join(PROJECT_DIR, '.windsurfrules'), selectedPrompt, '.windsurfrules');

  const copilotPath = path.join(PROJECT_DIR, '.github', 'copilot-instructions.md');
  if (!fs.existsSync(copilotPath) || FORCE) {
    writeFileSafe(copilotPath, selectedPrompt, '.github/copilot-instructions.md');
  } else {
    console.log(`[~] Skipped (project-specific version exists): ${copilotPath}`);
  }

  writeFileSafe(
    path.join(PROJECT_DIR, 'opencode.json'),
    JSON.stringify(selectedOpenCodeConfig, null, 2),
    'opencode.json'
  );
}

if (BOOTSTRAP) {
  copyDirSafe(path.join(PACKAGE_ROOT, 'ai-rules'), path.join(PROJECT_DIR, 'ai-rules'), 'ai-rules/ starter pack');
  copyDirSafe(path.join(PACKAGE_ROOT, '.claude', 'skills'), path.join(PROJECT_DIR, '.claude', 'skills'), '.claude/skills starter pack');
} else if (!fs.existsSync(path.join(PROJECT_DIR, 'ai-rules'))) {
  console.log('[!] ai-rules/ not found. Run `stack-perfeita init` to bootstrap starter rules.');
}

console.log('\nSetup complete.');
if (MINIMAL) console.log('- Minimal mode: only .cursorrules generated');
if (LEAN) console.log('- Lean mode: concise prompt/config generated for lower token usage');
if (BOOTSTRAP) console.log('- Bootstrap mode: starter ai-rules and skills copied');
console.log('- Recommended IDE command: npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules');
console.log('- Fallback with bundled rules: npx stack-perfeita-mcp --project-root .');
console.log('- Optional AI docs build: npm run docs:ai');

```

## examples/ide-lean.prompt.md

- kind: md
- lines: 19
- summary: Stack Perfeita — Lean IDE Prompt

```md
# Stack Perfeita — Lean IDE Prompt

```text
STACK PERFEITA — LEAN IDE MODE

1. activate_project()
2. doctor_runtime_setup()
3. activate_role(...)
4. start_task_contract(...)
5. Leia só compact-index, bundle-index e a regra necessária
6. Se a tarefa for estrutural: run_council_auto(...)
7. Registre prova com assert_step_evidence(...)
8. Antes do código final: validate_bad_code
9. Antes de imports/assets: dependency_validate
10. Se a resposta crescer: validate_response_style(..., mode="caveman")
11. Se falhar 2x igual: HALT
12. Para o roteiro completo: get_prompt_script("initial")
```

```

## examples/mcp.cursor.bundled-rules.json

- kind: json
- lines: 9
- summary: No inline summary detected

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", "."]
    }
  }
}

```

## examples/mcp.cursor.json

- kind: json
- lines: 9
- summary: No inline summary detected

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"]
    }
  }
}

```

## examples/opencode.lean.json

- kind: json
- lines: 26
- summary: No inline summary detected

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

## .cursorrules

- kind: text
- lines: 37
- summary: No inline summary detected

```text
# STACK PERFEITA MCP — LIVE IGNITION

Ative o Stack Perfeita neste projeto com deliberação adaptativa.

## INÍCIO DE SESSÃO
1. Call `activate_project()`
2. Call `doctor_runtime_setup()`
3. Call `get_model_profile("claude")` or the active provider
4. Call `activate_role("implementer", model="claude")`
5. Call `start_task_contract(...)`
6. Call `get_rules_bundle("index")`
7. Call `get_project_state()`

## DELIBERAÇÃO
- Se a tarefa for simples, curta ou local: use fluxo normal
- Se houver arquitetura, migração, refactor grande, segurança, trade-off forte, ambiguidade alta ou múltiplos módulos:
  - Call `run_council_auto(...)`
  - If deep mode is selected, use `get_council_execution_prompt(...)` for each stage
  - Preserve the full 5-bot flow: contrarian, first_principles, expansionist, outsider, executor
  - Normalize weak JSON with `normalize_council_json(...)` before recording or using it

## MODO OPERACIONAL
- Adaptive terseness by default
- If token pressure is high: set `CAVEMAN MODE: ACTIVE`
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice -> HALT and report root cause

## OUTPUT GATE
Before shipping code or claiming success:
- Run `validate_bad_code` for code blocks
- Run `dependency_validate` when new imports/assets were introduced
- Run `validate_response_style` before long explanatory prose when needed
- Record proof with `assert_step_evidence(...)`
- If foundation is rotten, stop feature work and fix the base first
- Use `get_prompt_script(...)` to load the exact workflow prompt without opening all docs
- Prefer `npm run docs:ai` before long AI/code-review sessions

```

## .windsurfrules

- kind: text
- lines: 37
- summary: No inline summary detected

```text
# STACK PERFEITA MCP — LIVE IGNITION

Ative o Stack Perfeita neste projeto com deliberação adaptativa.

## INÍCIO DE SESSÃO
1. Call `activate_project()`
2. Call `doctor_runtime_setup()`
3. Call `get_model_profile("claude")` or the active provider
4. Call `activate_role("implementer", model="claude")`
5. Call `start_task_contract(...)`
6. Call `get_rules_bundle("index")`
7. Call `get_project_state()`

## DELIBERAÇÃO
- Se a tarefa for simples, curta ou local: use fluxo normal
- Se houver arquitetura, migração, refactor grande, segurança, trade-off forte, ambiguidade alta ou múltiplos módulos:
  - Call `run_council_auto(...)`
  - If deep mode is selected, use `get_council_execution_prompt(...)` for each stage
  - Preserve the full 5-bot flow: contrarian, first_principles, expansionist, outsider, executor
  - Normalize weak JSON with `normalize_council_json(...)` before recording or using it

## MODO OPERACIONAL
- Adaptive terseness by default
- If token pressure is high: set `CAVEMAN MODE: ACTIVE`
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice -> HALT and report root cause

## OUTPUT GATE
Before shipping code or claiming success:
- Run `validate_bad_code` for code blocks
- Run `dependency_validate` when new imports/assets were introduced
- Run `validate_response_style` before long explanatory prose when needed
- Record proof with `assert_step_evidence(...)`
- If foundation is rotten, stop feature work and fix the base first
- Use `get_prompt_script(...)` to load the exact workflow prompt without opening all docs
- Prefer `npm run docs:ai` before long AI/code-review sessions

```

## .github/copilot-instructions.md

- kind: md
- lines: 37
- summary: STACK PERFEITA MCP — LIVE IGNITION

```md
# STACK PERFEITA MCP — LIVE IGNITION

Ative o Stack Perfeita neste projeto com deliberação adaptativa.

## INÍCIO DE SESSÃO
1. Call `activate_project()`
2. Call `doctor_runtime_setup()`
3. Call `get_model_profile("claude")` or the active provider
4. Call `activate_role("implementer", model="claude")`
5. Call `start_task_contract(...)`
6. Call `get_rules_bundle("index")`
7. Call `get_project_state()`

## DELIBERAÇÃO
- Se a tarefa for simples, curta ou local: use fluxo normal
- Se houver arquitetura, migração, refactor grande, segurança, trade-off forte, ambiguidade alta ou múltiplos módulos:
  - Call `run_council_auto(...)`
  - If deep mode is selected, use `get_council_execution_prompt(...)` for each stage
  - Preserve the full 5-bot flow: contrarian, first_principles, expansionist, outsider, executor
  - Normalize weak JSON with `normalize_council_json(...)` before recording or using it

## MODO OPERACIONAL
- Adaptive terseness by default
- If token pressure is high: set `CAVEMAN MODE: ACTIVE`
- Zero excitation tokens: no filler, no warm-up, no process narration
- Rule of 2: same failure twice -> HALT and report root cause

## OUTPUT GATE
Before shipping code or claiming success:
- Run `validate_bad_code` for code blocks
- Run `dependency_validate` when new imports/assets were introduced
- Run `validate_response_style` before long explanatory prose when needed
- Record proof with `assert_step_evidence(...)`
- If foundation is rotten, stop feature work and fix the base first
- Use `get_prompt_script(...)` to load the exact workflow prompt without opening all docs
- Prefer `npm run docs:ai` before long AI/code-review sessions

```

## README.md

- kind: md
- lines: 380
- summary: [Stack Perfeita MCP](https://github.com/GuilhermeFrediani/magnifiqe)

```md
# [Stack Perfeita MCP](https://github.com/GuilhermeFrediani/magnifiqe)

**MCP funcional para agentes de código.** Entrega runtime real com validação executável, checkpoints, compactação de contexto, leitura inteligente, Council estruturado com 5 bots + Chairman, runtime Council Live agnóstico a modelo e setup enxuto para IDEs. [Repositório](https://github.com/GuilhermeFrediani/magnifiqe)

[![Cursor](https://img.shields.io/badge/Cursor-Ready-purple)](https://cursor.com)
[![Windsurf](https://img.shields.io/badge/Windsurf-Ready-blue)](https://windsurf.com)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-orange)](https://claude.ai)
[![VS Code](https://img.shields.io/badge/VS_Code-Ready-blue)](https://code.visualstudio.com)

---

## O que esta revisão entrega

- MCP realmente executável, não só guia de boas práticas.
- Chamada robusta para IDEs com `--project-root .`.
- Setup **lean** para IDEs com menos contexto inicial e menor custo de tokens.
- Prompt pack operacional incorporado ao runtime via `PROMPTS.md` + tool `get_prompt_script`.
- `doctor_runtime_setup()` agora devolve config portátil para copiar e colar e também a config resolvida para diagnóstico.
- `opencode.json` reduzido para instruções essenciais.
- Bundles AI-first mantidos para leitura barata e modular.
- Testes, smoke test e docs AI-first integrados no fluxo de validação.

---

## Resposta curta

### O projeto é funcional?
Sim. O servidor MCP sobe por stdio, registra ferramentas reais, mantém estado local, executa Council, valida código, valida dependências, gera docs AI-first e possui cobertura de testes e smoke test. [Repositório](https://github.com/GuilhermeFrediani/magnifiqe)

### A chamada atual precisa correção?
**Sim, vale corrigir.** A forma antiga abaixo pode funcionar quando a IDE nasce exatamente na raiz do projeto, mas falha com mais frequência quando o `cwd` muda, quando há wrappers de execução ou quando o projeto é aberto por outra pasta de workspace.

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--rules-dir", "./ai-rules"]
    }
  }
}
```

A forma recomendada fixa explicitamente a raiz operacional do MCP:

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"]
    }
  }
}
```

Se você ainda não copiou `ai-rules/` para o projeto atual, use o fallback com regras empacotadas:

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", "."]
    }
  }
}
```

---

## Instalação

```bash
npm install
npm run docs:ai
```

### Execução local

```bash
npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules
```

### Fallback com regras empacotadas

```bash
npx stack-perfeita-mcp --project-root .
```

### Setup assistido

```bash
npm install -g stack-perfeita-mcp
stack-perfeita init
```

### Setup enxuto para IDEs

```bash
npm run setup:ide:lean
```

Isso gera arquivos de instrução mais curtos para IDEs e um `opencode.json` mais econômico em tokens.

---

## Scripts principais

```bash
npm test
npm run test:smoke:council
npm run setup:ide
npm run setup:ide:init
npm run setup:ide:lean
npm run docs:ai
npm run validate
npm start
npm run dev
```

---

## Configuração por IDE

### Cursor / VS Code / clientes MCP compatíveis

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"]
    }
  }
}
```

### Claude Code / Claude Desktop

```bash
claude mcp add stack-perfeita --command "npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules"
```

### OpenCode

O `opencode.json` padrão foi reduzido para as instruções mais úteis de boot. Para um preset ainda mais curto, use `examples/opencode.lean.json`.

### Exemplos prontos

- `examples/mcp.cursor.json`
- `examples/mcp.cursor.bundled-rules.json`
- `examples/opencode.lean.json`
- `examples/ide-lean.prompt.md`

---

## Prompt pack operacional

O roteiro que você usa para chamar o MCP agora está incorporado de três formas:

1. `PROMPTS.md` com os blocos atualizados.
2. `get_prompt_script(...)` para recuperar um prompt específico sem abrir o arquivo inteiro.
3. `setup:ide:lean` para gerar instruções enxutas em `.cursorrules`, `.windsurfrules` e `opencode.json`.

### Blocos disponíveis em `get_prompt_script(...)`

- `initial`
- `resume`
- `anti_loop`
- `council`
- `caveman`
- `ide_config`
- `ide_lean`
- `all`

---

## Ferramentas principais do MCP

### Regras
- `list_rules` — Lista todas as regras AI disponíveis no projeto.
- `get_rules` — Retorna o conteúdo de uma regra por tópico. Modo `summary` retorna descrição (~20 tokens); `full` retorna conteúdo completo.
- `get_context` — Retorna CONTEXT.md de um módulo/feature antes de editar arquivos nesse módulo.
- `get_rules_bundle` — Concatena todas as regras em ordem estável para cache de prompt. Modo `index` retorna nomes + descrições; `full` retorna tudo.

### Ativação
- `activate_project` — Monta manifesto completo do projeto (stack, rules, skills, state) em uma chamada. Use ao iniciar sessão.
- `doctor_runtime_setup` — Verifica setup, diretórios de rules, skills, AI docs e devolve config MCP portátil para copiar e colar.
- `get_prompt_script` — Retorna um prompt do PROMPTS.md pronto para uso. Seções: `initial`, `resume`, `anti_loop`, `council`, `caveman`, `ide_config`, `ide_lean`, `all`.

### Validação
- `validate_bad_code` — Verifica código contra padrões proibidos, complexidade, tamanho e aninhamento. Retorna score 0-100 com PASS/WARN/HALT.
- `validate_response_style` — Verifica se uma resposta contém tokens de excitação, hesitação ou prosa excessivamente verbosa.
- `validate_git_commit` — Valida mensagem de commit contra o padrão Conventional Commits.
- `dependency_validate` — Valida imports e referências: paths relativos, workspaces, package exports, aliases tsconfig/jsconfig/Vite e assets HTML.

### Leitura inteligente
- `smart_outline` — Extrai outline estrutural (funções, classes, métodos, tipos) com assinaturas via AST. Suporta JS/TS/Python.
- `smart_unfold` — Expande um símbolo específico (função, classe, método) retornando o corpo completo via AST.
- `smart_read` — Leitor inteligente: conteúdo completo para arquivos pequenos (<50 linhas), outline para maiores. Modos: `auto`, `outline`, `full`, `symbol`.
- `compress_markdown` — Compacta markdown in-memory (remove comments HTML, espaços extras, normaliza linhas vazias) sem alterar o arquivo no disco.

### Habilidades
- `list_skills` — Lista todas as skills disponíveis em `.claude/skills/`. Skills são playbooks de tarefa composáveis e descobertas.
- `get_skill` — Retorna o conteúdo completo de uma skill específica por nome ou diretório.

### Memória
- `save_observation` — Salva uma observação, aprendizado ou decisão arquitetural na memória persistente da sessão. Duplicatas são deduplicadas.
- `search_observations` — Busca observações salvas por palavra-chave.

### Estado do projeto
- `get_project_state` — Retorna o estado atual do projeto ou uma seção específica. Use antes de retomar trabalho ou fazer mudanças de risco.
- `save_project_state` — Atualiza uma seção do estado do projeto. Seções array são appendadas com dedupe; escalares são substituídos. Compaction automática no threshold.
- `checkpoint_task` — Cria snapshot rotulado do estado atual. Use antes de edits arriscados, refactors ou resets de contexto.
- `list_checkpoints` — Lista checkpoints salvos em ordem cronológica reversa com labels e timestamps.
- `resume_task` — Restaura estado do projeto a partir de um checkpoint. Omita label para o mais recente.

### Compactação
- `compact_conversation_state` — Salva um resumo estruturado da conversa em memória do projeto para liberar contexto.
- `compact_logs` — Extrai apenas erros e warnings de output de log, descartando ruído informativo.
- `compact_diff` — Resume um diff unificado mostrando apenas arquivos alterados, hunks de função e contagem de linhas.
- `promote_summary_to_checkpoint` — Promove o último resumo de compactação em um checkpoint formal com rollback.

### Perfil de modelo
- `get_model_profile` — Retorna orientação operacional para um provider ou alias de modelo. Cobertura: verbosidade, compaction, caching, strictness, capability flags.

### Papéis
- `activate_role` — Retorna preset de papel operacional adaptado ao perfil do modelo. Calibra verbosidade, retries, tool budget, gates e política de checkpoint.

### Runtime de tarefa
- `start_task_contract` — Cria ou atualiza contrato formal de tarefa com objetivo, inputs, outputs, non-goals, acceptance criteria, riscos e evidência mínima.
- `assert_step_evidence` — Registra evidência de nível de step com hipótese, evidência, ação de verificação e status. Evita afirmar progresso sem prova.

### Comandos
- `run_command` — Executa template de slash-command predefinido de `ai-rules/commands/`. Útil para prompts complexos repetitivos.

### Council estruturado
- `council_gate` — Avalia se uma tarefa merece deliberação do Council. Use antes de pagar custo de coordenação em trabalho simples.
- `start_council_session` — Cria sessão persistente do Council com briefs de 5 bots, fila de peer-review, regras de parada, rubrica de scoring e síntese do Chairman.
- `get_council_session` — Lista sessões do Council ou retorna uma sessão específica com contadores de progresso e fila de peer-review.
- `record_council_position` — Armazena ou atualiza posição de um bot na sessão. Exige claims estruturados para síntese auditável.
- `record_council_review` — Armazena um peer review entre bots. Auto-review é bloqueado. Reviews são upserted por par reviewer-target.
- `synthesize_council` — Executa síntese determinística do Council a partir de posições e reviews. Gera consenso, divergências, ideias descartadas e próximo passo recomendado.

### Council Live
- `run_council_simple` — Contrato de execução de chamada única, agnóstico a modelo, para trabalho de baixa latência.
- `run_council_deep` — Cria plano persistente do Council com prompts para 5 bots, ordem de peer-review, stage do Chairman e handoff I/O final.
- `run_council_auto` — Resolve automaticamente entre modo simple e deep, retornando o plano correto agnóstico a provider.
- `get_council_execution_prompt` — Retorna prompt de contrato estrito para um stage do Council Live: `bot_position`, `peer_review`, `chairman` ou `io_final`.
- `normalize_council_json` — Normaliza JSON ruidoso gerado por modelo para stages do Council Live. Remove fences, trailing commas e corrige tipos.

### Compressão e Performance
- `compress_tool_output` — Comprime output de ferramentas via pipeline CCR (Content-Detector → Cache-Aligner → CCR Hierarchy → Store). Detecta tipo de conteúdo e aplica nível de compressão apropriado.
- `decompress_tool_output` — Restaura output comprimido usando hash do sentinel. Recupera conteúdo original armazenado pelo pipeline CCR.
- `compression_stats` — Retorna estatísticas do pipeline de compressão: tamanho do store, estado do circuit breaker, detecções do cache aligner.

### TTSR (Time-Traveling Streamed Rules)
- `ttsr_check_output` — Verifica output contra regras TTSR registradas. Retorna HALT se violar alguma regra. Monitora outputs em tempo real.
- `ttsr_stats` — Retorna estatísticas do TTSR engine: número de regras, triggers, regras disparadas.

### Aprendizado
- `headroom_learn_run` — Executa ciclo de aprendizado manual: escaneia sessões .claude/, analisa padrões e escreve recomendações na memória da sessão.
- `headroom_learn_status` — Retorna status do trigger periódico: se o ciclo está ativo, se está rodando, último timestamp, total de execuções e último resultado.

### Verificação Anti-Alucinação
- `verify_file_sync` — Verifica que um arquivo no disco corresponde ao conteúdo esperado. Compara hash do arquivo com hash esperado. Retorna PASS/FAIL com evidência.
- `detect_hallucination` — Valida que paths de arquivos, imports e símbolos realmente existem no disco. Recebe array de claims e verifica cada uma. Retorna PASS/FAIL por claim.
- `groundedness_score` — Pontua o quão "grounded" uma resposta está em fatos verificáveis. Verifica referências a arquivos, claims de código e asserções de teste contra o filesystem. Retorna score 0-10.
- `diff_since_last` — Mostra o que mudou em um arquivo desde a última verificação. Compara hash atual com hash armazenado. Útil para rastrear mudanças incrementais.

### Monitoramento e Diagnóstico
- `detect_output_dedup` — Rastreia hashes de output e detecta outputs idênticos repetidos. Modos: `track` (registra e verifica), `check` (verifica sem registrar).
- `session_watchdog` — Monitora timing de chamadas de ferramentas e detecta loops potenciais ou operações travadas. Ações: `start`, `end`, `status`.
- `session_health` — Diagnóstico completo da saúde da sessão: estatísticas de rate limit, dedup, loop detection, memória e compressão.
- `run_test_and_report` — Executa comando de teste e reporta resultado. Útil para validação automática de código.
---

## Arquitetura resumida

```text
src/
  index.js                 # entrypoint MCP
  config.js                # resolução de paths, catálogos, padrões
  activation.js            # ativação, runtime doctor, prompt scripts
  validators.js            # validação executável de código/resposta/deps
  project-state.js         # estado, checkpoints, retomada
  compaction.js            # compactação de contexto
  council.js               # sessões, gate, peer review, síntese
  council-live.js          # simple/deep/auto + contratos JSON
  dependency-resolution.js # workspaces, paths, aliases, exports
  safety-guards.js         # rate limiting, dedup, loop detection, validation
  compression-orchestrator.js # pipeline CCR para compressão de outputs
  ttsr-manager.js          # Time-Traveling Streamed Rules para monitoramento
  learn-trigger.js         # ciclos de aprendizado periódicos e manuais
  anti-hallucination.js    # verificação de arquivos, detecção de alucinação
  verification.js          # file sync, hallucination detection, groundedness
  watchdog.js              # output dedup, session timing, test execution
  caveman.js               # output budget enforcement, auto-validation
  compression/             # pipeline CCR completo
    content-detector.js    # detecção de tipo de conteúdo
    cache-aligner.js       # alinhamento para cache de prompt
    ccr-hierarchy.js       # hierarquia de compressão
    store.js               # armazenamento de originais
    circuit-breaker.js     # circuit breaker para falhas
    thresholds.js          # thresholds de compressão
  ttsr/                    # Time-Traveling Streamed Rules
    ttsr-engine.js         # engine de regras
    halt-bridge.js         # bridge para interrupções
    rule-types.js          # tipos de regras
    settings.js            # configurações do TTSR
  learn/                   # módulo de aprendizado
    analyzer.js            # analisador de padrões
    writer.js              # escritor de recomendações
    scanner.js             # scanner de sessões
  observability/           # observabilidade
    metrics.js             # métricas do sistema
    logger.js              # logger estruturado

ai-rules/
  00-17 *.md              # regras modulares sob demanda
  commands/               # slash-commands predefinidos

ai-docs/
  compact-index.md        # entrada mais barata
  bundle-index.md         # entrada por tarefa
  bundles/                # contexto temático curto
  mirror/                 # espelho markdown dos arquivos
```

---

## Estratégia para reduzir tokens

1. Comece por `ai-docs/compact-index.md`.
2. Abra `ai-docs/bundle-index.md` antes de abrir arquivos brutos.
3. Use `examples/ide-lean.prompt.md` ou `npm run setup:ide:lean` em IDEs.
4. Use `get_prompt_script("initial")` ou `get_prompt_script("resume")` em vez de colar o prompt pack inteiro sempre.
5. Use `run_council_auto(...)` para não cair em modo deep à toa.
6. Só abra `src/...` quando `ai-docs` não bastar.
7. Use `compress_markdown` em docs grandes.
8. Use `compress_tool_output(...)` para comprimir outputs de ferramentas automaticamente via pipeline CCR.
9. Use `decompress_tool_output(...)` para recuperar outputs comprimidos quando necessário.
10. Verifique `compression_stats` para monitorar eficiência do pipeline de compressão.

### Evite
- carregar `README.md`, todas as regras e todo `src/` no mesmo contexto;
- usar Council deep em tarefa local ou mecânica;
- rodar com a chamada antiga sem `--project-root .`;
- tratar `PROMPTS.md` como documentação passiva em vez de fonte operacional.

---

## Melhorias aplicadas nesta revisão

- correção da chamada recomendada do MCP para IDEs;
- runtime doctor com config portátil e config resolvida;
- tool `get_prompt_script` para injetar os prompts atualizados no fluxo real;
- setup lean por script;
- `opencode.json` enxugado;
- smoke/e2e alinhados com a chamada robusta;
- exemplos extras para setup enxuto;
- README consolidado e sem instruções duplicadas.

---

## Validação recomendada antes de publicar

```bash
npm run validate
```

Esse comando executa testes, smoke test do Council e gera a camada AI-first em Markdown.

---

## Fonte

- Projeto original: [GuilhermeFrediani/magnifiqe](https://github.com/GuilhermeFrediani/magnifiqe)

```

## PROMPTS.md

- kind: md
- lines: 237
- summary: Prompts: Stack Perfeita MCP Live — VERSÃO CONDENSADA

```md
# Prompts: Stack Perfeita MCP Live — VERSÃO CONDENSADA

Use estes prompts como atalhos prontos para Cursor, Windsurf, Claude Code, Copilot Chat ou qualquer IDE com MCP.

---

## 1. Prompt Inicial (CONDENSADO)

```text
Ative Stack Perfeita com deliberação adaptativa.

1. `activate_project()` → manifesto completo
2. `doctor_runtime_setup()` → diagnóstico
3. `get_model_profile("claude")` → perfil (ou gpt/gemini/glm/mimo)
4. `activate_role("implementer", model="claude")` → preset
5. `start_task_contract(...)` → contrato
6. `get_rules_bundle("index")` → regras
7. `get_project_state()` → estado

── Se tarefa complexa (arquitetura, migração, refactor, segurança, trade-offs, ambiguidade, multi-módulo) ──
- `run_council_auto(...)`
- Se modo deep: 5 bots → peer review → `synthesize_council(...)` → `assert_step_evidence(...)`

── Validação ──
- `auto_validate_output` antes do código final
- `dependency_validate` antes de imports
- `validate_response_style` antes de prose longa
- `compress_tool_output` se output grande
- Se falhar 2x → HALT
- Não invente APIs, arquivos ou consenso falso

→ Roteiro completo: `get_prompt_script("initial")`
```

---

## 2. Prompt de Retomada (CONDENSADO)

```text
Retome projeto com Stack Perfeita.

1. `activate_project()`
2. `doctor_runtime_setup()`
3. `get_project_state()`
4. `list_checkpoints()`
5. Se necessário: `resume_task()`
6. `activate_role(...)`
7. `start_task_contract(...)`
8. Leia só regra necessária

── Se tarefa complexa ──
- `get_council_session()` → ver sessões
- Se não existir: `run_council_auto(...)`
- Complete posições, revisões → `synthesize_council(...)`

── Validação ──
- Continue do último passo validado
- `assert_step_evidence(...)` → novas evidências
- `auto_validate_output` → valide código
- `dependency_validate` → valide imports
- Se mesmo erro 2x → HALT

→ Roteiro completo: `get_prompt_script("resume")`
```

---

## 3. Prompt Anti-Loop (CONDENSADO)

```text
Reforce modo Stack Perfeita.

- Modo conciso
- `get_project_state()` → recarregue estado
- Leia só regra necessária
- `get_council_session()` → decisão estrutural em aberto
- `detect_output_dedup` → output repetido
- `ttsr_check_output` → regras TTSR
- `auto_validate_output` → valide código
- `dependency_validate` → valide imports
- `validate_response_style` → valide prosa
- `assert_step_evidence(...)` → registre prova
- Não invente, preserve conflitos
- Continue do último passo provado
- Se mesmo erro 2x → HALT
```

---

## 4. Prompt Council Complexo (CONDENSADO)

```text
Ative deliberação Council real.

1. `activate_project()`
2. `doctor_runtime_setup()`
3. `activate_role("architect", model="claude")`
4. `start_task_contract(...)`
5. `run_council_deep(...)`

── Execução ──
- `get_council_execution_prompt(...)` para etapas
- 5 posições: contrarian, first_principles, expansionist, outsider, executor
- `record_council_review(...)` → peer review
- `synthesize_council(...)`

── Síntese ──
Preservar: consensus, disagreements, discarded ideas, risk ranking, next step, confidence, evidence missing

── Pós-Síntese ──
- `assert_step_evidence(...)` → conclusão
- `groundedness_score` → verificação
- Implementação e validação
```

---

## 5. Prompt Caveman (CONDENSADO)

```text
CAVEMAN MODE: ACTIVE.

- Zero tokens de excitação
- Sem filler, sem narração
- Frases curtas, precisão técnica
- `validate_response_style(..., mode="caveman")` se crescer
- `compress_tool_output` se precisar comprimir
- Council: consenso, conflito, próximo passo, confiança
- `validate_caveman_output` → enforce
```

---

## 6. Prompt Arquitetura Modular (CONDENSADO)

```text
Ative modo Arquitetura Modular.

PRINCÍPIOS:
1. Alicerces firmes desde início
2. Um componente = um arquivo = uma responsabilidade
3. Tokens globais primeiro
4. Zero código morto

FRONTEND:
1. styles/global.css → design tokens
2. styles/index.css → entry point
3. Arquivos por componente
4. HTML semântico
5. Flexbox/Grid, mobile-first

BACKEND:
1. controllers/, services/, repositories/, utils/
2. Controllers só orquestram
3. Services processam regras
4. Repositories queries
5. Utils funções puras
6. Error handling centralizado
7. Config via env vars

ANTI-COMPLEXIDADE:
1. Arquivos: 10-300 linhas
2. Funções: 3-30 linhas
3. Zero código morto
4. Dependências: nativo > leve > pesada
5. Máximo 3 níveis de pastas

VALIDAÇÃO:
- `smart_read` → estrutura existente
- `detect_hallucination` → validar paths
- `verify_file_sync` → confirmar writes
- `auto_validate_output` → chain completa
```

---

## 7. Chamada MCP para IDEs

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"]
    }
  }
}
```

### Fallback com regras empacotadas
```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", "."]
    }
  }
}
```

---

## 8. Prompt Lean para IDEs (CONDENSADO)

```text
STACK PERFEITA — LEAN IDE MODE

1. `activate_project()`
2. `doctor_runtime_setup()`
3. `activate_role(...)`
4. `start_task_contract(...)`
5. Leia só compact-index, bundle-index e regra necessária
6. Se tarefa estrutural: `run_council_auto(...)`
7. `assert_step_evidence(...)` → registre prova
8. `auto_validate_output` → antes do código final
9. `dependency_validate` → antes de imports
10. `validate_response_style(..., mode="caveman")` se resposta crescer
11. Se falhar 2x igual → HALT
12. Roteiro completo: `get_prompt_script("initial")`
```

---

## 9. Atalhos Rápidos

| Ação | Comando |
|------|---------|
| Ativação completa | `get_prompt_script("initial")` |
| Retomada | `get_prompt_script("resume")` |
| Anti-loop | `get_prompt_script("anti_loop")` |
| Council | `get_prompt_script("council")` |
| Caveman | `get_prompt_script("caveman")` |
| Config IDE | `get_prompt_script("ide_config")` |
| IDE Lean | `get_prompt_script("ide_lean")` |
| Tudo | `get_prompt_script("all")` |

```

## opencode.json

- kind: json
- lines: 26
- summary: No inline summary detected

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "./README.md",
    "./ai-docs/compact-index.md",
    "./ai-docs/bundle-index.md",
    "./PROMPTS.md",
    "./ai-rules/01-ai-workflow-strict.md",
    "./ai-rules/03-token-economy.md",
    "./ai-rules/12-council-deliberation.md",
    "./ai-rules/13-live-council-runtime.md"
  ],
  "mcp": {
    "stack-perfeita": {
      "type": "local",
      "command": [
        "node",
        "C:/Users/Guilherme/AppData/Local/Programs/nodejs/node_modules/stack-perfeita-mcp/src/index.js",
        "--project-root",
        "."
      ],
      "enabled": true
    }
  }
}

```
