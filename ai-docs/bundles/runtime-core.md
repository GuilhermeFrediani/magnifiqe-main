# Runtime Core

Entrypoint, ativação, estado e compactação do runtime MCP.

## Included files
- `src/activation.js` — Stack Perfeita MCP — Project Activation activate_project MCP tool registration. Builds a complete project manifest: stack, rules, skills, state, fingerprint.
- `src/compaction.js` — Stack Perfeita MCP — Compaction tools compact_conversation_state, compact_logs, compact_diff, promote_summary_to_checkpoint Semantic compaction for long sessions: preserve meaning, discard noise.
- `src/index.js` — stack-perfeita-mcp v4.8.0 MCP server that exposes project AI rules as tools for any IDE/agent. Architecture: Modular — each tool category lives in its own file under src/. This file is the entry point: it wires everything together and starts the server. Registered modules: Core:       resources, rules, validators, skills, code-reading, commands, memory, project-state, compaction, profiles, roles, task-runtime, activation, council, council-live, anti-hallucination New:        compression-orchestrator (CCR pipeline), ttsr-manager (TTSR rules), learn-trigger (headroom_learn periodic cycle) Inline:     compress_markdown (CCR-enhanced) Usage: node src/index.js --rules-dir /path/to/ai-rules
- `src/project-state.js` — Stack Perfeita MCP — Project State tools get_project_state, save_project_state, checkpoint_task, list_checkpoints, resume_task
- `src/task-runtime.js` — Stack Perfeita MCP — Task runtime start_task_contract and assert_step_evidence MCP tool registrations.
- `README.md` — [Stack Perfeita MCP](https://github.com/GuilhermeFrediani/magnifiqe)

## src/activation.js

- kind: js
- lines: 378
- summary: Stack Perfeita MCP — Project Activation activate_project MCP tool registration. Builds a complete project manifest: stack, rules, skills, state, fingerprint.

```js
/**
 * Stack Perfeita MCP — Project Activation
 * activate_project MCP tool registration.
 * Builds a complete project manifest: stack, rules, skills, state, fingerprint.
 */

import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { ROOT_DIR, PROJECT_ROOT, RULES_DIR, BUNDLED_RULES_DIR, RULE_DESCRIPTIONS } from "./config.js";
import { loadState } from "./project-state.js";
import { rateLimiter } from "./rate-limiter.js";
import { readFile, parseSkillFrontmatter } from "./helpers.js";

function generateFingerprint(projectRoot, rulesDir, skillsDir) {
  const parts = [];

  const pkgPath = resolve(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      parts.push(pkg.name || "", pkg.version || "");
      if (pkg.dependencies) parts.push(Object.keys(pkg.dependencies).sort().join(","));
      if (pkg.devDependencies) parts.push(Object.keys(pkg.devDependencies).sort().join(","));
    } catch {
      // ignore malformed package.json
    }
  }

  if (existsSync(rulesDir)) {
    try {
      const rules = readdirSync(rulesDir).filter((file) => file.endsWith(".md")).sort();
      parts.push(rules.join(","));
    } catch {
      // ignore rule listing errors
    }
  }

  if (existsSync(skillsDir)) {
    try {
      const skills = readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      parts.push(skills.join(","));
    } catch {
      // ignore skill listing errors
    }
  }

  const raw = parts.join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

function readPackageJson(projectRoot) {
  const pkgPath = resolve(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}
const PROMPT_SCRIPT_SECTIONS = {
  initial: 1,
  resume: 2,
  anti_loop: 3,
  council: 4,
  caveman: 5,
  ide_config: 6,
  ide_lean: 7,
};

function getPromptSection(markdown, sectionNumber) {
  const headingRegex = new RegExp(`^##\\s+${sectionNumber}\\.\\s+`, "m");
  const startMatch = headingRegex.exec(markdown);
  if (!startMatch) return null;

  const startIndex = startMatch.index;
  const afterHeading = markdown.slice(startIndex + startMatch[0].length);
  const nextHeadingMatch = /^##\s+\d+\.\s+/m.exec(afterHeading);
  const sectionBody = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  const codeFenceMatch = sectionBody.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  if (codeFenceMatch) return codeFenceMatch[1].trim();
  return sectionBody.trim();
}

function loadPromptScript(promptName) {
  const sectionNumber = PROMPT_SCRIPT_SECTIONS[promptName];
  if (!sectionNumber) return null;
  const promptPath = resolve(ROOT_DIR, "PROMPTS.md");
  const promptMarkdown = readFile(promptPath);
  if (!promptMarkdown) return null;
  return getPromptSection(promptMarkdown, sectionNumber);
}

export function registerActivationTools(server) {
  server.tool(
    "activate_project",
    "Builds a project manifest in one call: stack summary, available rules, skills, state snapshot, and cache strategy. Use at session start. Mode 'compact' returns ~40% fewer tokens.",
    {
      project_root: z.string().optional().describe("Absolute path to the project root. Defaults to current working directory."),
      mode: z.enum(["full", "compact"]).default("full").describe("full = complete manifest (~500 tokens). compact = stripped-down version (~300 tokens)."),
    },
    async ({ project_root, mode }) => {
      const rateLimitHit = rateLimiter.check("activate_project");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const root = project_root ? resolve(project_root) : PROJECT_ROOT;
      const localRulesDir = resolve(root, "ai-rules");
      const rulesDir = project_root
        ? (existsSync(localRulesDir) ? localRulesDir : BUNDLED_RULES_DIR)
        : RULES_DIR;
      const skillsDir = resolve(root, ".claude", "skills");
      const stateFile = resolve(root, ".claude", "project_state.json");

      const pkg = readPackageJson(root);
      const fingerprint = generateFingerprint(root, rulesDir, skillsDir);

      const stackLines = [];
      if (pkg) {
        const deps = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
        const devDeps = pkg.devDependencies ? Object.keys(pkg.devDependencies) : [];
        const scripts = pkg.scripts ? Object.keys(pkg.scripts) : [];

        stackLines.push(`- Name: ${pkg.name || "(unnamed)"}`);
        stackLines.push(`- Version: ${pkg.version || "0.0.0"}`);
        if (deps.length) stackLines.push(`- Dependencies (${deps.length}): ${deps.slice(0, 10).join(", ")}${deps.length > 10 ? "..." : ""}`);
        if (devDeps.length) stackLines.push(`- DevDependencies (${devDeps.length}): ${devDeps.slice(0, 8).join(", ")}${devDeps.length > 8 ? "..." : ""}`);
        if (scripts.length) stackLines.push(`- Scripts: ${scripts.join(", ")}`);
      } else {
        stackLines.push("- No package.json found");
      }

      const rulesLines = [];
      if (existsSync(rulesDir)) {
        try {
          const ruleFiles = readdirSync(rulesDir).filter((file) => file.endsWith(".md")).sort();
          for (const file of ruleFiles) {
            const description = RULE_DESCRIPTIONS[file] || "Custom rule file";
            rulesLines.push(`- ${file}: ${description}`);
          }
        } catch {
          rulesLines.push("- Could not read ai-rules directory");
        }
      } else {
        rulesLines.push("- No ai-rules/ directory found");
      }

      const skillsLines = [];
      if (existsSync(skillsDir)) {
        try {
          const dirs = readdirSync(skillsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();

          for (const dir of dirs) {
            const skillPath = join(skillsDir, dir, "SKILL.md");
            if (!existsSync(skillPath)) continue;
            const content = readFile(skillPath);
            const frontmatter = content ? parseSkillFrontmatter(content) : {};
            skillsLines.push(`- ${frontmatter.name || dir}: ${frontmatter.description || "No description"}`);
          }
        } catch {
          skillsLines.push("- Could not read .claude/skills directory");
        }
      } else {
        skillsLines.push("- No .claude/skills/ directory found");
      }

      const state = loadState(stateFile);
      const stateLines = [
        `- Objective: ${state.objective || "(not set)"}`,
        `- Checkpoints: ${state.checkpoints?.length || 0}`,
        `- Auto compactions: ${state.compaction_meta?.auto_compactions || 0}`,
      ];
      if (state.next_steps?.length) stateLines.push(`- Next steps: ${state.next_steps.join(", ")}`);
      if (state.decisions?.length) stateLines.push(`- Recent decisions: ${state.decisions.slice(-3).join(", ")}`);
      if (state.open_questions?.length) stateLines.push(`- Open questions: ${state.open_questions.length}`);
      if (state.risks?.length) stateLines.push(`- Risks: ${state.risks.length}`);

      const isCompact = mode === "compact";
      const maxListItems = isCompact ? 5 : Infinity;

      const manifest = [
        `## Project Activated: ${pkg?.name || root}`,
        `- Root: ${root}`,
        `- Fingerprint: ${fingerprint}`,
        "",
        "### Stack",
        ...stackLines,
        "",
        `### Rules (${rulesLines.length})`,
        ...rulesLines.slice(0, maxListItems),
        ...(rulesLines.length > maxListItems ? [`- ... and ${rulesLines.length - maxListItems} more`] : []),
        "",
        `### Skills (${skillsLines.length})`,
        ...skillsLines.slice(0, maxListItems),
        ...(skillsLines.length > maxListItems ? [`- ... and ${skillsLines.length - maxListItems} more`] : []),
        "",
        "### State",
        ...stateLines,
      ];

      if (!isCompact) {
        manifest.push(
          "",
          "### Recommended sequence",
          "- Call doctor_runtime_setup() once at session start to verify paths and MCP config",
          "- Call get_model_profile(<provider>) once",
          "- Call activate_role(<role>, model=<provider>) for task posture",
          "- Start a task contract with start_task_contract(...) before major work",
          "- For high-blast-radius or ambiguous work: call run_council_auto(...) and switch to deep mode when recommended",
          "- In deep mode, use get_council_execution_prompt(...) and normalize_council_json(...) before recording weak model output",
          "- Call get_rules_bundle('index') as stable prefix",
          "- Load only the rule needed with get_rules(topic)",
          "- Use list_checkpoints() before resume_task(label) when resuming older work",
          "- Record proof with assert_step_evidence(...) at meaningful milestones",
          "- Before final code: validate_bad_code; before final prose: validate_response_style",
          "- dependency_validate now covers workspaces, package exports, ts/jsconfig paths, and Vite aliases",
          "",
          "### Cache strategy",
          "- Static: rules bundle, model profile, stable project manifest",
          "- Volatile: project state, observations, diffs, logs",
          "- Project state auto-compacts at threshold to preserve recent high-signal context",
          "- Prefer compaction for logs/diffs instead of carrying raw output forward",
        );
      }

      return {
        content: [{ type: "text", text: manifest.join("\n") }],
      };
    }
  );

  server.tool(
    "doctor_runtime_setup",
    "Checks runtime setup, resolved rule directories, skills, AI docs, and returns ready-to-paste MCP config snippets for IDEs.",
    {
      project_root: z.string().optional().describe("Absolute or relative project root to inspect. Defaults to current configured project root."),
    },
    async ({ project_root }) => {
      const rateLimitHit = rateLimiter.check("doctor_runtime_setup");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const root = project_root ? resolve(project_root) : PROJECT_ROOT;
      const localRulesDir = resolve(root, "ai-rules");
      const resolvedRulesDir = project_root
        ? (existsSync(localRulesDir) ? localRulesDir : BUNDLED_RULES_DIR)
        : RULES_DIR;
      const bundledRulesDir = BUNDLED_RULES_DIR;
      const skillsDir = resolve(root, ".claude", "skills");
      const aiDocsDir = resolve(root, "ai-docs");
      const usingLocalRules = existsSync(localRulesDir) && resolvedRulesDir === localRulesDir;
      const usingBundledRules = resolvedRulesDir === bundledRulesDir;

      const portableCursorConfig = {
        mcpServers: {
          "stack-perfeita": {
            command: "npx",
            args: ["stack-perfeita-mcp", "--project-root", ".", ...(usingLocalRules ? ["--rules-dir", "./ai-rules"] : [])],
          },
        },
      };

      const resolvedCursorConfig = {
        mcpServers: {
          "stack-perfeita": {
            command: "npx",
            args: ["stack-perfeita-mcp", "--project-root", root, ...(usingLocalRules ? ["--rules-dir", "./ai-rules"] : [])],
          },
        },
      };

      const lines = [
        `## Runtime doctor`,
        `- project_root: ${root}`,
        `- resolved_rules_dir: ${resolvedRulesDir}`,
        `- local_rules_dir: ${localRulesDir}`,
        `- bundled_rules_dir: ${bundledRulesDir}`,
        `- using_local_rules: ${usingLocalRules}`,
        `- using_bundled_rules: ${usingBundledRules}`,
        `- project_rules_exist: ${existsSync(localRulesDir)}`,
        `- bundled_rules_exist: ${existsSync(bundledRulesDir)}`,
        `- skills_exist: ${existsSync(skillsDir) && readdirSync(skillsDir, { withFileTypes: true }).some(d => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")))}`,
        `- ai_docs_exist: ${existsSync(aiDocsDir)}`,
        `- ai_docs_bundle_index: ${existsSync(resolve(aiDocsDir, "bundle-index.md"))}`,
        `- project_state_file: ${resolve(root, ".claude", "project_state.json")}`,
        `- council_state_file: ${resolve(root, ".claude", "council_state.json")}`,
        "",
        "### Portable MCP config (copy/paste for IDEs)",
        "```json",
        JSON.stringify(portableCursorConfig, null, 2),
        "```",
        "",
        "### Resolved MCP config (diagnostic)",
        "```json",
        JSON.stringify(resolvedCursorConfig, null, 2),
        "```",
        "",
        "### Recommended command",
        usingLocalRules
          ? "npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules"
          : "npx stack-perfeita-mcp --project-root .",
        "",
        "### Resolved command for this machine",
        usingLocalRules
          ? `npx stack-perfeita-mcp --project-root ${root} --rules-dir ./ai-rules`
          : `npx stack-perfeita-mcp --project-root ${root}`,
        "",
        "### Notes",
        usingLocalRules
          ? "- Local project rules detected. Prefer the portable command with --project-root . and --rules-dir ./ai-rules."
          : "- No local ai-rules detected. The server can run with bundled rules until you bootstrap project-local rules.",
        "- The old call without --project-root can fail when the IDE launches the MCP from a different working directory.",
        "- Use npm run docs:ai before heavy AI reading sessions.",
        "- Use stack-perfeita init to bootstrap local rules and skills when needed.",
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "get_prompt_script",
    "Returns one ready-to-use Stack Perfeita prompt script from PROMPTS.md. Use to inject the exact workflow into the IDE without loading the whole prompt pack.",
    {
      name: z.enum(["initial", "resume", "anti_loop", "council", "caveman", "ide_config", "ide_lean", "all"]).describe("Prompt pack section to return."),
    },
    async ({ name }) => {
      const rateLimitHit = rateLimiter.check("get_prompt_script");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const promptPath = resolve(ROOT_DIR, "PROMPTS.md");
      const promptMarkdown = readFile(promptPath);
      if (!promptMarkdown) {
        return {
          content: [{ type: "text", text: `HALT — Prompt pack not found: ${promptPath}` }],
        };
      }

      if (name === "all") {
        return {
          content: [{ type: "text", text: promptMarkdown }],
        };
      }

      const promptText = loadPromptScript(name);
      if (!promptText) {
        return {
          content: [{ type: "text", text: `HALT — Prompt section not found for ${name}.` }],
        };
      }

      return {
        content: [{ type: "text", text: promptText }],
      };
    }
  );
}

```

## src/compaction.js

- kind: js
- lines: 227
- summary: Stack Perfeita MCP — Compaction tools compact_conversation_state, compact_logs, compact_diff, promote_summary_to_checkpoint Semantic compaction for long sessions: preserve meaning, discard noise.

```js
/**
 * Stack Perfeita MCP — Compaction tools
 * compact_conversation_state, compact_logs, compact_diff, promote_summary_to_checkpoint
 * Semantic compaction for long sessions: preserve meaning, discard noise.
 */

import { z } from "zod";
import { loadState, saveState } from "./project-state.js";
import { rateLimiter } from "./rate-limiter.js";

/**
 * Extract error/warning lines from log text.
 * Matches: ERROR, WARN, FAIL, exception, traceback, Error:, panic, FATAL
 */
export function extractErrorsFromLogs(logText, keepErrors = true) {
  const lines = logText.split("\n");
  const errorPattern = /\b(ERROR|WARN|FAIL|FATAL|exception|traceback|Error:|panic|CRITICAL)\b/i;
  const errors = [];
  const summary = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (errorPattern.test(trimmed)) {
      errors.push(trimmed);
    } else {
      summary.push(trimmed);
    }
  }

  const totalLines = lines.filter(l => l.trim()).length;
  const header = `## Log Compaction\n\n- Total lines: ${totalLines}\n- Errors/warnings: ${errors.length}\n- Info lines discarded: ${summary.length}`;

  if (keepErrors && errors.length > 0) {
    return `${header}\n\n### Errors & Warnings\n\`\`\`\n${errors.join("\n")}\n\`\`\``;
  }

  return header;
}

/**
 * Summarize a unified diff: extract changed files and function hunks.
 */
export function summarizeDiff(diffText) {
  const lines = diffText.split("\n");
  const files = [];
  const hunks = [];
  let addCount = 0;
  let delCount = 0;
  let currentFile = null;

  for (const line of lines) {
    // New file
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      files.push(currentFile);
    }
    // Hunk header: @@ -start,count +start,count @@ function
    const hunkMatch = line.match(/^@@\s+[^@]+@@\s*(.*)/);
    if (hunkMatch) {
      const context = hunkMatch[1].trim();
      if (context && currentFile) {
        hunks.push(`${currentFile}: ${context}`);
      }
    }
    // Count additions/deletions
    if (line.startsWith("+") && !line.startsWith("+++")) addCount++;
    if (line.startsWith("-") && !line.startsWith("---")) delCount++;
  }

  const header = `## Diff Compaction\n\n- Files changed: ${files.length}\n- Lines added: +${addCount}\n- Lines removed: -${delCount}`;
  const filesList = files.length > 0 ? `\n\n### Files\n${files.map(f => `- ${f}`).join("\n")}` : "";
  const hunksList = hunks.length > 0 ? `\n\n### Functions/Sections\n${hunks.map(h => `- ${h}`).join("\n")}` : "";

  return `${header}${filesList}${hunksList}`;
}

export function registerCompactionTools(server) {
  // Tool: compact_conversation_state
  server.tool(
    "compact_conversation_state",
    "Saves a structured summary of the current conversation state to project memory, allowing context to be freed. Use before context gets too large or at natural breakpoints.",
    {
      summary: z.string().describe("Concise summary of what happened so far: decisions made, files changed, current status."),
    },
    async ({ summary }) => {
      const rateLimitHit = rateLimiter.check("compact_conversation_state");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        if (!state.compaction_history) state.compaction_history = [];

        const entry = {
          timestamp: new Date().toISOString(),
          summary,
        };

        state.compaction_history.push(entry);
        saveState(state);

        return {
          content: [{
            type: "text",
            text: `Conversation state compacted (${state.compaction_history.length} entries saved).\n\nUse promote_summary_to_checkpoint(label) to create a formal checkpoint from this summary.\n\nLatest summary:\n${summary}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compact_conversation_state: ${e.message}` }] };
      }
    }
  );

  // Tool: compact_logs
  server.tool(
    "compact_logs",
    "Extracts only errors and warnings from log output, discarding informational noise. Use after running tests, builds, or any command that produces verbose output.",
    {
      log_text: z.string().describe("Raw log output to compact."),
      keep_errors: z.boolean().default(true).describe("Keep error/warning lines (true) or just show summary counts (false)."),
    },
    async ({ log_text, keep_errors }) => {
      const rateLimitHit = rateLimiter.check("compact_logs");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const compacted = extractErrorsFromLogs(log_text, keep_errors);
        const savings = log_text.length - compacted.length;

        return {
          content: [{
            type: "text",
            text: `[Compacted ${savings} chars from logs]\n\n${compacted}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compact_logs: ${e.message}` }] };
      }
    }
  );

  // Tool: compact_diff
  server.tool(
    "compact_diff",
    "Summarizes a unified diff showing only changed files, function hunks, and line counts. Use after git diff or reviewing PRs to save context.",
    {
      diff_text: z.string().describe("Raw unified diff text to compact."),
    },
    async ({ diff_text }) => {
      const rateLimitHit = rateLimiter.check("compact_diff");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const compacted = summarizeDiff(diff_text);
        const savings = diff_text.length - compacted.length;

        return {
          content: [{
            type: "text",
            text: `[Compacted ${savings} chars from diff]\n\n${compacted}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compact_diff: ${e.message}` }] };
      }
    }
  );

  // Tool: promote_summary_to_checkpoint
  server.tool(
    "promote_summary_to_checkpoint",
    "Promotes the most recent compact_conversation_state summary into a formal checkpoint. This creates a rollback point from the compacted state.",
    {
      label: z.string().describe("Short label for this checkpoint (e.g., 'after-auth', 'post-refactor')."),
    },
    async ({ label }) => {
      const rateLimitHit = rateLimiter.check("promote_summary_to_checkpoint");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const state = loadState();
        const history = state.compaction_history || [];

        if (history.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No compaction history found. Use compact_conversation_state(summary) first.",
            }],
          };
        }

        const latest = history[history.length - 1];

        // Create checkpoint from current state (same logic as checkpoint_task)
        const { checkpoints: _cp, ...rest } = state;
        const snapshot = JSON.parse(JSON.stringify(rest));

        const checkpoint = {
          label,
          timestamp: new Date().toISOString(),
          snapshot,
          from_compaction: latest.summary,
        };

        state.checkpoints = state.checkpoints || [];
        state.checkpoints.push(checkpoint);
        saveState(state);

        return {
          content: [{
            type: "text",
            text: `Checkpoint promoted: "${label}" from compaction at ${latest.timestamp}.\n\n${state.checkpoints.length} checkpoint(s) total.\n\nUse resume_task(label="${label}") to restore.`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in promote_summary_to_checkpoint: ${e.message}` }] };
      }
    }
  );
}

```

## src/index.js

- kind: js
- lines: 190
- summary: stack-perfeita-mcp v4.8.0 MCP server that exposes project AI rules as tools for any IDE/agent. Architecture: Modular — each tool category lives in its own file under src/. This file is the entry point: it wires everything together and starts the server. Registered modules: Core:       resources, rules, validators, skills, code-reading, commands, memory, project-state, compaction, profiles, roles, task-runtime, activation, council, council-live, anti-hallucination New:        compression-orchestrator (CCR pipeline), ttsr-manager (TTSR rules), learn-trigger (headroom_learn periodic cycle) Inline:     compress_markdown (CCR-enhanced) Usage: node src/index.js --rules-dir /path/to/ai-rules

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

## src/project-state.js

- kind: js
- lines: 352
- summary: Stack Perfeita MCP — Project State tools get_project_state, save_project_state, checkpoint_task, list_checkpoints, resume_task

```js
/**
 * Stack Perfeita MCP — Project State tools
 * get_project_state, save_project_state, checkpoint_task, list_checkpoints, resume_task
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { PROJECT_STATE_FILE, STATE_LIMITS } from "./config.js";
import { rateLimiter } from "./rate-limiter.js";
import { autoCompactState } from "./state-compaction.js";
import { atomicWrite } from "./helpers.js";

export const VALID_SECTIONS = [
  "objective",
  "constraints",
  "decisions",
  "files_changed",
  "next_steps",
  "open_questions",
  "risks",
  "last_error",
];

const ARRAY_SECTIONS = new Set([
  "constraints",
  "decisions",
  "files_changed",
  "next_steps",
  "open_questions",
  "risks",
]);

export function defaultState() {
  return {
    objective: "",
    constraints: [],
    decisions: [],
    files_changed: [],
    next_steps: [],
    open_questions: [],
    risks: [],
    last_error: null,
    checkpoints: [],
    compaction_history: [],
    compaction_policy: {
      enabled: true,
      threshold_chars: STATE_LIMITS.autoCompactThresholdChars,
      hard_threshold_chars: STATE_LIMITS.autoCompactHardThresholdChars,
      preserve_recent_items: STATE_LIMITS.autoCompactKeepRecentItems,
    },
    compaction_meta: {
      auto_compactions: 0,
      last_auto_compaction_at: null,
      last_total_chars: 0,
      last_compacted_chars: 0,
    },
    updated_at: new Date().toISOString(),
  };
}

function sanitizeState(state) {
  const safe = { ...defaultState(), ...state };

  for (const section of ARRAY_SECTIONS) {
    const values = Array.isArray(safe[section]) ? safe[section] : [];
    const unique = [];
    const seen = new Set();
    for (const value of values) {
      const normalized = String(value).trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push(normalized);
    }
    safe[section] = unique.slice(-STATE_LIMITS.maxArrayItems);
  }

  safe.checkpoints = Array.isArray(safe.checkpoints)
    ? safe.checkpoints.slice(-STATE_LIMITS.maxCheckpoints)
    : [];

  safe.compaction_history = Array.isArray(safe.compaction_history)
    ? safe.compaction_history.slice(-STATE_LIMITS.maxCompactionHistory)
    : [];

  safe.objective = String(safe.objective || "").trim();
  safe.last_error = safe.last_error ? String(safe.last_error).trim() : null;

  safe.compaction_policy = {
    enabled: safe.compaction_policy?.enabled !== false,
    threshold_chars: Number(safe.compaction_policy?.threshold_chars) || STATE_LIMITS.autoCompactThresholdChars,
    hard_threshold_chars: Number(safe.compaction_policy?.hard_threshold_chars) || STATE_LIMITS.autoCompactHardThresholdChars,
    preserve_recent_items: Number(safe.compaction_policy?.preserve_recent_items) || STATE_LIMITS.autoCompactKeepRecentItems,
  };

  safe.compaction_meta = {
    auto_compactions: Number(safe.compaction_meta?.auto_compactions) || 0,
    last_auto_compaction_at: safe.compaction_meta?.last_auto_compaction_at || null,
    last_total_chars: Number(safe.compaction_meta?.last_total_chars) || 0,
    last_compacted_chars: Number(safe.compaction_meta?.last_compacted_chars) || 0,
  };

  safe.updated_at = new Date().toISOString();
  return safe;
}

export function loadState(filePath = PROJECT_STATE_FILE) {
  if (!existsSync(filePath)) return defaultState();
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    return sanitizeState(data);
  } catch {
    return defaultState();
  }
}

export function saveState(state, filePath = PROJECT_STATE_FILE) {
  try {
    const sanitized = sanitizeState(state);
    const compacted = autoCompactState(sanitized, STATE_LIMITS);

    if (compacted.applied && compacted.event) {
      compacted.state.compaction_history = [
        ...(compacted.state.compaction_history || []),
        compacted.event,
      ].slice(-STATE_LIMITS.maxCompactionHistory);
    }

    compacted.state.updated_at = new Date().toISOString();
    atomicWrite(filePath, JSON.stringify(compacted.state, null, 2));
  } catch (e) {
    process.stderr.write(`Failed to save project state: ${e.message}\n`);
  }
}

function formatState(state, section) {
  if (section) {
    const value = state[section];
    if (value === undefined) return `Section "${section}" not found.`;
    if (Array.isArray(value)) {
      return value.length === 0
        ? `## ${section}\n\n(empty)`
        : `## ${section}\n\n${value.map((entry, index) => `${index + 1}. ${entry}`).join("\n")}`;
    }
    return `## ${section}\n\n${value ?? "(empty)"}`;
  }

  const lines = ["## Project State", `*Updated: ${state.updated_at}*`, ""];

  for (const key of VALID_SECTIONS) {
    const value = state[key];
    lines.push(`### ${key}`);
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push("(empty)");
      else value.forEach((entry, index) => lines.push(`${index + 1}. ${entry}`));
    } else {
      lines.push(value ?? "(empty)");
    }
    lines.push("");
  }

  lines.push("### checkpoints", `${state.checkpoints?.length ?? 0} checkpoint(s) saved`, "");
  lines.push("### compaction_history", `${state.compaction_history?.length ?? 0} compacted summary(ies) saved`, "");
  lines.push("### compaction_meta");
  lines.push(`- Auto compactions: ${state.compaction_meta?.auto_compactions ?? 0}`);
  lines.push(`- Last auto compaction: ${state.compaction_meta?.last_auto_compaction_at ?? "(none)"}`);
  lines.push(`- Last state size: ${state.compaction_meta?.last_total_chars ?? 0} chars`);
  lines.push(`- Last chars trimmed: ${state.compaction_meta?.last_compacted_chars ?? 0}`);

  return lines.join("\n");
}

function formatCheckpointList(checkpoints) {
  if (!checkpoints || checkpoints.length === 0) {
    return "No checkpoints found. Use checkpoint_task(label) to create one first.";
  }

  const lines = checkpoints
    .slice()
    .reverse()
    .map((checkpoint, index) => {
      const objective = checkpoint.snapshot?.objective || "(no objective)";
      return `${index + 1}. ${checkpoint.label} — ${checkpoint.timestamp}\n   objective: ${objective}`;
    });

  return `## Checkpoints (${checkpoints.length})\n\n${lines.join("\n")}`;
}

export function registerProjectStateTools(server) {
  server.tool(
    "get_project_state",
    "Returns the current project state or one specific section. Use before resuming work or making risky changes.",
    {
      section: z.enum(VALID_SECTIONS).optional().describe("Specific section to retrieve. Omit for the full state."),
    },
    async ({ section }) => {
      const rateLimitHit = rateLimiter.check("get_project_state");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        return {
          content: [{ type: "text", text: formatState(state, section) }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in get_project_state: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "save_project_state",
    "Updates one section of the project state. Array sections are appended with dedupe; scalar sections are replaced. Automatic threshold compaction trims older entries when state grows too large.",
    {
      section: z.enum(VALID_SECTIONS).describe("Which section to update."),
      content: z.string().describe("Content to save for that section."),
    },
    async ({ section, content }) => {
      const rateLimitHit = rateLimiter.check("save_project_state");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        if (ARRAY_SECTIONS.has(section)) {
          state[section] = [...state[section], content];
        } else {
          state[section] = content;
        }
        saveState(state);

        const fresh = loadState();
        return {
          content: [{
            type: "text",
            text: `Project state updated: ${section}.\n\n${formatState(fresh, section)}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error saving project state: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "checkpoint_task",
    "Creates a labeled snapshot of the current project state. Use before risky edits, refactors, or context resets.",
    {
      label: z.string().describe("Short checkpoint label, e.g. 'before-refactor' or 'auth-done'."),
    },
    async ({ label }) => {
      const rateLimitHit = rateLimiter.check("checkpoint_task");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        const { checkpoints: _ignored, ...rest } = state;
        const snapshot = JSON.parse(JSON.stringify(rest));

        state.checkpoints = state.checkpoints || [];
        state.checkpoints.push({
          label,
          timestamp: new Date().toISOString(),
          snapshot,
        });
        saveState(state);

        return {
          content: [{
            type: "text",
            text: `Checkpoint saved: "${label}".\n\n${formatCheckpointList(loadState().checkpoints)}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in checkpoint_task: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "list_checkpoints",
    "Lists saved checkpoints in reverse chronological order with labels, timestamps, and snapshot objectives.",
    {},
    async () => {
      const rateLimitHit = rateLimiter.check("list_checkpoints");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        return {
          content: [{ type: "text", text: formatCheckpointList(state.checkpoints) }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in list_checkpoints: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "resume_task",
    "Restores project state from a checkpoint. If label is omitted, restores the most recent checkpoint.",
    {
      label: z.string().optional().describe("Checkpoint label to restore. Omit for most recent."),
    },
    async ({ label }) => {
      const rateLimitHit = rateLimiter.check("resume_task");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const state = loadState();
        const checkpoints = state.checkpoints || [];
        if (checkpoints.length === 0) {
          return {
            content: [{ type: "text", text: "No checkpoints found. Use checkpoint_task(label) to create one first." }],
          };
        }

        const checkpoint = label
          ? checkpoints.find((entry) => entry.label === label)
          : checkpoints[checkpoints.length - 1];

        if (!checkpoint) {
          return {
            content: [{ type: "text", text: `Checkpoint "${label}" not found.\n\n${formatCheckpointList(checkpoints)}` }],
          };
        }

        const restored = { ...defaultState(), ...checkpoint.snapshot, checkpoints };
        saveState(restored);

        return {
          content: [{
            type: "text",
            text: `Resumed from checkpoint: "${checkpoint.label}" (${checkpoint.timestamp}).\n\n${formatState(loadState())}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in resume_task: ${e.message}` }] };
      }
    }
  );
}


```

## src/task-runtime.js

- kind: js
- lines: 162
- summary: Stack Perfeita MCP — Task runtime start_task_contract and assert_step_evidence MCP tool registrations.

```js
/**
 * Stack Perfeita MCP — Task runtime
 * start_task_contract and assert_step_evidence MCP tool registrations.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { PROJECT_ROOT } from "./config.js";
import { rateLimiter } from "./rate-limiter.js";

export const TASK_RUNTIME_FILE = resolve(PROJECT_ROOT, ".claude", "task_runtime.json");

export function defaultTaskRuntime() {
  return {
    current_contract: null,
    contracts_history: [],
    evidence_log: [],
    updated_at: new Date().toISOString(),
  };
}

export function loadTaskRuntime(filePath = TASK_RUNTIME_FILE) {
  if (!existsSync(filePath)) return defaultTaskRuntime();
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    return {
      ...defaultTaskRuntime(),
      ...data,
      contracts_history: Array.isArray(data.contracts_history) ? data.contracts_history : [],
      evidence_log: Array.isArray(data.evidence_log) ? data.evidence_log : [],
    };
  } catch {
    return defaultTaskRuntime();
  }
}

export function saveTaskRuntime(state, filePath = TASK_RUNTIME_FILE) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const sanitized = {
    ...defaultTaskRuntime(),
    ...state,
    contracts_history: Array.isArray(state.contracts_history) ? state.contracts_history.slice(-20) : [],
    evidence_log: Array.isArray(state.evidence_log) ? state.evidence_log.slice(-100) : [],
    updated_at: new Date().toISOString(),
  };
  writeFileSync(filePath, JSON.stringify(sanitized, null, 2), "utf-8");
}

function formatContract(contract) {
  if (!contract) return "(no active contract)";
  return [
    `- Objective: ${contract.objective}`,
    `- Inputs: ${contract.inputs}`,
    `- Outputs: ${contract.outputs}`,
    `- Non-goals: ${contract.non_goals}`,
    `- Acceptance criteria: ${contract.acceptance_criteria}`,
    `- Risks: ${contract.risks}`,
    `- Minimum evidence: ${contract.minimum_evidence}`,
    `- Created at: ${contract.created_at}`,
  ].join("\n");
}

function formatEvidence(entry) {
  return [
    `- Hypothesis: ${entry.hypothesis}`,
    `- Evidence: ${entry.evidence}`,
    `- Verification: ${entry.verification}`,
    `- Status: ${entry.status}`,
    `- Timestamp: ${entry.timestamp}`,
  ].join("\n");
}

export function registerTaskRuntimeTools(server) {
  server.tool(
    "start_task_contract",
    "Creates or updates a formal task contract with objective, inputs, outputs, non-goals, acceptance criteria, risks, and minimum evidence.",
    {
      objective: z.string().describe("Primary objective for the task."),
      inputs: z.string().describe("Important inputs, dependencies, or context."),
      outputs: z.string().describe("Expected deliverable or result."),
      non_goals: z.string().describe("What this task must not try to solve."),
      acceptance_criteria: z.string().describe("Concrete conditions required for completion."),
      risks: z.string().describe("Known risks or failure modes."),
      minimum_evidence: z.string().describe("Minimum proof required before claiming success."),
    },
    async ({ objective, inputs, outputs, non_goals, acceptance_criteria, risks, minimum_evidence }) => {
      const rateLimitHit = rateLimiter.check("start_task_contract");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const state = loadTaskRuntime();
        const contract = {
          objective,
          inputs,
          outputs,
          non_goals,
          acceptance_criteria,
          risks,
          minimum_evidence,
          created_at: new Date().toISOString(),
        };

        state.current_contract = contract;
        state.contracts_history = [...state.contracts_history, contract];
        saveTaskRuntime(state);

        return {
          content: [{
            type: "text",
            text: `## Task contract started\n\n${formatContract(contract)}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in start_task_contract: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "assert_step_evidence",
    "Registers step-level evidence with hypothesis, evidence, verification action, and status. Use to avoid claiming progress without proof.",
    {
      hypothesis: z.string().describe("What you think is true right now."),
      evidence: z.string().describe("Concrete evidence gathered so far."),
      verification: z.string().describe("What was executed or checked to verify the hypothesis."),
      status: z.enum(["pending", "verified", "falsified"]).describe("Current status of the step hypothesis."),
    },
    async ({ hypothesis, evidence, verification, status }) => {
      const rateLimitHit = rateLimiter.check("assert_step_evidence");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const state = loadTaskRuntime();
        const entry = {
          hypothesis,
          evidence,
          verification,
          status,
          timestamp: new Date().toISOString(),
        };

        state.evidence_log = [...state.evidence_log, entry];
        saveTaskRuntime(state);

        return {
          content: [{
            type: "text",
            text: `## Step evidence recorded\n\n${formatEvidence(entry)}\n\nEvidence log size: ${state.evidence_log.length}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in assert_step_evidence: ${e.message}` }] };
      }
    }
  );
}


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
