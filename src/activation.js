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
  caveman: 4,
  ide_config: 5,
  ide_lean: 6,
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
      name: z.enum(["initial", "resume", "anti_loop", "caveman", "ide_config", "ide_lean", "all"]).describe("Prompt pack section to return."),
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
