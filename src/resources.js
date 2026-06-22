/**
 * Stack Perfeita MCP — MCP Resource registrations
 * Exposes ai-rules/*.md as MCP resources for discovery and reading.
 */

import { RULES_DIR, RULE_DESCRIPTIONS, PROJECT_STATE_FILE, MEMORY_FILE } from "./config.js";
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
