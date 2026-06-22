/**
 * Stack Perfeita MCP — Command tool
 * run_command MCP tool registration.
 */

import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";
import { COMMANDS_DIR } from "./config.js";
import { readFile } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";

export function registerCommandsTools(server) {
  // Tool: run_command
  server.tool(
    "run_command",
    "Executes a predefined slash-command template from ai-rules/commands/. Useful for repetitive complex prompts (e.g. 'code-analysis', 'ci-deployment').",
    {
      name: z.string().describe("Command name (without extension)."),
      args: z.string().optional().describe("Arguments to pass to the command template."),
    },
    async ({ name, args }) => {
      const rateLimitHit = rateLimiter.check("run_command");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const safeName = name.replace(/\.\./g, "").replace(/[\\/]/g, "");
        const cmdPath = resolve(COMMANDS_DIR, `${safeName}.md`);
        if (!existsSync(cmdPath)) {
          return { content: [{ type: "text", text: `HALT — Command not found: ${safeName}` }] };
        }
        let content = readFile(cmdPath);
        if (args) {
          content = content.replace(/\{\{\s*args\s*\}\}/g, args);
        }
        return {
          content: [{
            type: "text",
            text: `## Command: ${safeName}\n\n${content}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in run_command: ${e.message}` }] };
      }
    }
  );
}
