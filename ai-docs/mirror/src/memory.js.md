# src/memory.js

- kind: js
- lines: 95
- bytes: 3029

## Summary
Stack Perfeita MCP — Memory tools save_observation, search_observations. Uses JSON file persistence with simple dedupe + trimming.

## Imports
- `zod`
- `fs`
- `./config.js`
- `./rate-limiter.js`
- `./helpers.js`

## Exports
- `registerMemoryTools`

## Source
```js
/**
 * Stack Perfeita MCP — Memory tools
 * save_observation, search_observations.
 * Uses JSON file persistence with simple dedupe + trimming.
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { MEMORY_FILE, STATE_LIMITS } from "./config.js";
import { rateLimiter } from "./rate-limiter.js";
import { atomicWrite } from "./helpers.js";

function normalizeMemory(data) {
  if (!Array.isArray(data)) return [];
  const unique = [];
  const seen = new Set();

  for (const item of data) {
    const text = String(item?.text || "").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    unique.push({
      timestamp: item?.timestamp || new Date().toISOString(),
      text,
    });
  }

  return unique.slice(-STATE_LIMITS.maxObservations);
}

function loadMemory(filePath = MEMORY_FILE) {
  if (!existsSync(filePath)) return [];
  try {
    return normalizeMemory(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch {
    return [];
  }
}

function saveMemory(data, filePath = MEMORY_FILE) {
  try {
    atomicWrite(filePath, JSON.stringify(normalizeMemory(data), null, 2));
  } catch (e) {
    process.stderr.write(`Failed to save memory: ${e.message}\n`);
  }
}

export function registerMemoryTools(server) {
  server.tool(
    "save_observation",
    "Saves an observation, learning, or architectural decision to persistent session memory. Duplicate entries are deduped.",
    { observation: z.string().describe("Observation text to save.") },
    async ({ observation }) => {
      const rateLimitHit = rateLimiter.check("save_observation");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const memory = loadMemory();
        memory.push({ timestamp: new Date().toISOString(), text: observation });
        saveMemory(memory);
        return {
          content: [{ type: "text", text: "Observation saved to session memory." }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error saving observation: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "search_observations",
    "Searches saved observations using a keyword query.",
    { query: z.string().describe("Keyword to search for in memory.") },
    async ({ query }) => {
      const rateLimitHit = rateLimiter.check("search_observations");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      const memory = loadMemory();
      const results = memory.filter((entry) => entry.text.toLowerCase().includes(query.toLowerCase()));

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No observations found matching: "${query}"` }] };
      }

      const lines = results.map((entry) => `[${entry.timestamp}] ${entry.text}`);
      return {
        content: [{ type: "text", text: `## Observations matching "${query}"\n\n${lines.join("\n")}` }],
      };
    }
  );

}

```
