/**
 * Stack Perfeita MCP — Project State tools
 * get_project_state, save_project_state, checkpoint_task, list_checkpoints, resume_task
 * rewind_to_checkpoint, compress_checkpoint_results
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { PROJECT_STATE_FILE, STATE_LIMITS } from "./config.js";
import { rateLimiter } from "./rate-limiter.js";
import { autoCompactState } from "./state-compaction.js";
import { atomicWrite } from "./helpers.js";
import { semanticCompress } from "./semantic-compression.js";

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
/**
 * Compress checkpoint snapshot data using semantic compression tiers.
 * Keeps: decisions, files_changed, key findings (objective).
 * Drops: verbose intermediate data, failed attempts.
 * @param {object} snapshot - Checkpoint snapshot data
 * @param {number} tier - Compression tier (1-3)
 * @returns {{ compressed: object, stats: object }}
 */
function compressSnapshot(snapshot, tier = 2) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { compressed: snapshot, stats: { before: 0, after: 0, savings: 0 } };
  }

  const compressed = { ...snapshot };
  let totalBefore = 0;
  let totalAfter = 0;

  // Compress array sections
  for (const section of ARRAY_SECTIONS) {
    if (Array.isArray(compressed[section]) && compressed[section].length > 0) {
      const before = compressed[section].join(' ').length;
      totalBefore += before;

      // Apply semantic compression to each entry
      compressed[section] = compressed[section].map(entry => {
        const result = semanticCompress(String(entry), { tier, preserveCode: true });
        return result.compressed;
      });

      const after = compressed[section].join(' ').length;
      totalAfter += after;
    }
  }

  // Compress scalar sections
  const scalarSections = ['objective', 'last_error'];
  for (const section of scalarSections) {
    if (compressed[section] && typeof compressed[section] === 'string') {
      const before = compressed[section].length;
      totalBefore += before;

      const result = semanticCompress(compressed[section], { tier, preserveCode: true });
      compressed[section] = result.compressed;

      const after = compressed[section].length;
      totalAfter += after;
    }
  }

  return {
    compressed,
    stats: {
      before: totalBefore,
      after: totalAfter,
      savings: totalBefore - totalAfter,
      savingsPercent: totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0,
    },
  };
}

/**
 * Format compression stats for display.
 * @param {object} stats - Compression stats
 * @returns {string}
 */
function formatCompressionStats(stats) {
  if (!stats || stats.savings === 0) return '';
  return `\n\nCompression applied:\n- Before: ${stats.before} chars\n- After: ${stats.after} chars\n- Saved: ${stats.savings} chars (${stats.savingsPercent}%)`;
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
  server.tool(
    "rewind_to_checkpoint",
    "Restores to a checkpoint and compresses intermediate results. Keeps decisions, files modified, and key findings while dropping verbose exploration data.",
    {
      label: z.string().describe("Checkpoint label to rewind to"),
      tier: z.number().min(1).max(3).optional().default(2).describe("Compression tier (1-3). Higher = more aggressive. Default: 2"),
    },
    async ({ label, tier }) => {
      const rateLimitHit = rateLimiter.check("rewind_to_checkpoint");
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

        const checkpoint = checkpoints.find((entry) => entry.label === label);

        if (!checkpoint) {
          return {
            content: [{ type: "text", text: `Checkpoint "${label}" not found.\n\n${formatCheckpointList(checkpoints)}` }],
          };
        }

        // Compress the snapshot before restoring
        const { compressed, stats } = compressSnapshot(checkpoint.snapshot, tier);

        // Restore state with compressed snapshot
        const restored = { ...defaultState(), ...compressed, checkpoints };
        saveState(restored);

        const compressionInfo = formatCompressionStats(stats);

        return {
          content: [{
            type: "text",
            text: `Rewound to checkpoint: "${checkpoint.label}" (${checkpoint.timestamp}).${compressionInfo}\n\n${formatState(loadState())}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in rewind_to_checkpoint: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "compress_checkpoint_results",
    "Compresses checkpoint data in-place using semantic compression tiers. Preserves key findings while reducing token usage.",
    {
      label: z.string().describe("Checkpoint label to compress"),
      tier: z.number().min(1).max(3).optional().default(2).describe("Compression tier (1-3). Higher = more aggressive. Default: 2"),
    },
    async ({ label, tier }) => {
      const rateLimitHit = rateLimiter.check("compress_checkpoint_results");
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

        const checkpointIndex = checkpoints.findIndex((entry) => entry.label === label);

        if (checkpointIndex === -1) {
          return {
            content: [{ type: "text", text: `Checkpoint "${label}" not found.\n\n${formatCheckpointList(checkpoints)}` }],
          };
        }

        const checkpoint = checkpoints[checkpointIndex];
        const { compressed, stats } = compressSnapshot(checkpoint.snapshot, tier);

        // Update checkpoint with compressed snapshot
        checkpoints[checkpointIndex] = {
          ...checkpoint,
          snapshot: compressed,
          compressed_at: new Date().toISOString(),
          compression_tier: tier,
        };

        state.checkpoints = checkpoints;
        saveState(state);

        const compressionInfo = formatCompressionStats(stats);

        return {
          content: [{
            type: "text",
            text: `Checkpoint "${label}" compressed (tier ${tier}).${compressionInfo}\n\n${formatCheckpointList(loadState().checkpoints)}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in compress_checkpoint_results: ${e.message}` }] };
      }
    }
  );

}

