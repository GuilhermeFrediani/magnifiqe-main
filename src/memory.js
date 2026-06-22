/**
 * Stack Perfeita MCP — Memory tools
 * save_observation, search_observations, save_session_state, get_session_state,
 * create_handoff, resume_from_handoff.
 * Uses JSON file persistence with simple dedupe + trimming.
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { MEMORY_FILE, SESSION_STATE_FILE, STATE_LIMITS } from "./config.js";
import { rateLimiter, withRateLimit } from "./rate-limiter.js";
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

// Session state helpers

function getSessionStateFile() {
  return process.env.SESSION_STATE_FILE || SESSION_STATE_FILE;
}

function loadSessionState(filePath) {
  const fp = filePath || getSessionStateFile();
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

function saveSessionState(state, filePath) {
  const fp = filePath || getSessionStateFile();
  try {
    atomicWrite(fp, JSON.stringify(state, null, 2));
  } catch (e) {
    process.stderr.write(`Failed to save session state: ${e.message}\n`);
  }
}

function loadHandoffs(filePath) {
  const fp = filePath || getSessionStateFile();
  if (!existsSync(fp)) return [];
  try {
    const data = JSON.parse(readFileSync(fp, "utf-8"));
    return data.handoffs || [];
  } catch {
    return [];
  }
}

function saveHandoffs(handoffs, filePath) {
  const fp = filePath || getSessionStateFile();
  try {
    const existing = loadSessionState(fp) || {};
    const data = { ...existing, handoffs };
    atomicWrite(fp, JSON.stringify(data, null, 2));
  } catch (e) {
    process.stderr.write(`Failed to save handoffs: ${e.message}\n`);
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

  // ─── Session Memory Tools ─────────────────────────────────────────────────

  server.tool(
    "save_session_state",
    "Saves structured session state including goal, subtask, status, plan, assumptions, and blockers.",
    {
      goal: z.string().describe("Current goal of the session."),
      current_subtask: z.string().describe("Current subtask being worked on."),
      loaded_skills: z.array(z.string()).optional().describe("List of loaded skills."),
      status: z.enum(["active", "paused", "completed"]).describe("Session status."),
      plan: z.array(z.string()).optional().describe("List of plan items."),
      assumptions: z.array(z.string()).optional().describe("List of assumptions."),
      blockers: z.array(z.string()).optional().describe("List of blockers."),
    },
    withRateLimit("save_session_state", async ({ goal, current_subtask, loaded_skills, status, plan, assumptions, blockers }) => {
      try {
        const state = {
          goal,
          current_subtask,
          loaded_skills: loaded_skills || [],
          status,
          plan: plan || [],
          assumptions: assumptions || [],
          blockers: blockers || [],
          timestamp: new Date().toISOString(),
        };
        saveSessionState(state);
        return {
          content: [{ type: "text", text: "Session state saved successfully." }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error saving session state: ${e.message}` }] };
      }
    })
  );

  server.tool(
    "get_session_state",
    "Returns the latest session state.",
    {},
    withRateLimit("get_session_state", async () => {
      try {
        const state = loadSessionState();
        if (!state) {
          return { content: [{ type: "text", text: "No session state found." }] };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — get_session_state failed: ${e.message}` }] };
      }
    })
  );

  server.tool(
    "create_handoff",
    "Creates a handoff document for session transfer with resume point, next actions, watch outs, and context summary.",
    {
      resume_from: z.string().describe("Where to resume in the work."),
      next_actions: z.array(z.string()).describe("List of next actions to take."),
      watch_outs: z.array(z.string()).optional().describe("Things to watch out for."),
      context_summary: z.string().describe("Summary of the current context."),
    },
    withRateLimit("create_handoff", async ({ resume_from, next_actions, watch_outs, context_summary }) => {
      try {
        const handoff = {
          resume_from,
          next_actions,
          watch_outs: watch_outs || [],
          context_summary,
          timestamp: new Date().toISOString(),
        };
        const handoffs = loadHandoffs();
        handoffs.push(handoff);
        saveHandoffs(handoffs);
        return {
          content: [{ type: "text", text: `Handoff document created. Resume from: ${resume_from}` }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error creating handoff: ${e.message}` }] };
      }
    })
  );

  server.tool(
    "resume_from_handoff",
    "Loads a handoff document and restores session context.",
    {
      index: z.number().optional().describe("Index of handoff to resume from (default: latest)."),
    },
    withRateLimit("resume_from_handoff", async ({ index }) => {
      const handoffs = loadHandoffs();
      if (handoffs.length === 0) {
        return { content: [{ type: "text", text: "HALT — No handoff documents found." }] };
      }
      const handoffIndex = index !== undefined ? index : handoffs.length - 1;
      if (handoffIndex < 0 || handoffIndex >= handoffs.length) {
        return { content: [{ type: "text", text: `HALT — Invalid handoff index: ${handoffIndex}. Available: 0-${handoffs.length - 1}` }] };
      }
      const handoff = handoffs[handoffIndex];
      return {
        content: [{ type: "text", text: JSON.stringify(handoff, null, 2) }],
      };
    })
  );

}
