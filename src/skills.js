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
