/**
 * Stack Perfeita MCP — Todo Manager
 * Phased task management with init, start, done, drop, rm, append, view.
 * Tasks addressed by verbatim content string. Auto-promotes next pending task.
 */

import { readFileSync, existsSync } from "fs";
import { z } from "zod";
import { TODO_STATE_FILE } from "./config.js";
import { atomicWrite } from "./helpers.js";

// ─── Internal State ──────────────────────────────────────────────────────────

function defaultTodoState() {
  return { phases: [] };
}

function loadTodoState(filePath = TODO_STATE_FILE) {
  if (!existsSync(filePath)) return defaultTodoState();
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return defaultTodoState();
  }
}

function saveTodoState(state, filePath = TODO_STATE_FILE) {
  atomicWrite(filePath, JSON.stringify(state, null, 2));
}

function findTask(state, text) {
  for (const phase of state.phases) {
    for (const task of phase.tasks) {
      if (task.text === text) return { task, phase };
    }
  }
  return null;
}

function autoPromote(state) {
  for (const phase of state.phases) {
    if (!phase.tasks.some((t) => t.status === "in-progress")) {
      const next = phase.tasks.find((t) => t.status === "pending");
      if (next) next.status = "in-progress";
    }
  }
}

function formatTodoView(state) {
  if (state.phases.length === 0) return "No phases defined. Use init to create a task list.";

  const lines = [];
  for (const phase of state.phases) {
    lines.push(`## ${phase.name}`);
    if (phase.tasks.length === 0) {
      lines.push("  (no tasks)");
      continue;
    }
    for (const task of phase.tasks) {
      const marker =
        task.status === "in-progress"
          ? "\u25ba"
          : task.status === "done"
          ? "\u2713"
          : task.status === "dropped"
          ? "\u2717"
          : "\u25cb";
      lines.push(`  ${marker} ${task.text}`);
    }
    lines.push("");
  }

  const summary = { total: 0, done: 0, active: 0, pending: 0, dropped: 0 };
  for (const phase of state.phases) {
    for (const task of phase.tasks) {
      summary.total++;
      if (task.status === "done") summary.done++;
      else if (task.status === "in-progress") summary.active++;
      else if (task.status === "pending") summary.pending++;
      else if (task.status === "dropped") summary.dropped++;
    }
  }
  lines.push(`Summary: ${summary.total} total, ${summary.done} done, ${summary.active} active, ${summary.pending} pending, ${summary.dropped} dropped`);

  return lines.join("\n");
}

// ─── Operations ──────────────────────────────────────────────────────────────

function opInit(op) {
  const phases = op.list.map((p) => ({
    name: p.phase,
    tasks: p.items.map((text) => ({ text, status: "pending" })),
  }));
  return { phases };
}

function opStart(state, op) {
  if (!op.task) throw new Error("start requires task");
  const found = findTask(state, op.task);
  if (!found) throw new Error(`Task not found: "${op.task}"`);
  found.task.status = "in-progress";
}

function opDone(state, op) {
  if (!op.task) throw new Error("done requires task");
  const found = findTask(state, op.task);
  if (!found) throw new Error(`Task not found: "${op.task}"`);
  found.task.status = "done";
  autoPromote(state);
}

function opDrop(state, op) {
  if (!op.task) throw new Error("drop requires task");
  const found = findTask(state, op.task);
  if (!found) throw new Error(`Task not found: "${op.task}"`);
  found.task.status = "dropped";
  autoPromote(state);
}

function opRemove(state, op) {
  if (op.task) {
    const found = findTask(state, op.task);
    if (!found) throw new Error(`Task not found: "${op.task}"`);
    found.phase.tasks = found.phase.tasks.filter((t) => t !== found.task);
    return;
  }
  if (op.phase) {
    const idx = state.phases.findIndex((p) => p.name === op.phase);
    if (idx === -1) throw new Error(`Phase not found: "${op.phase}"`);
    state.phases.splice(idx, 1);
    return;
  }
  throw new Error("rm requires task or phase");
}

function opAppend(state, op) {
  if (!op.phase) throw new Error("append requires phase");
  let phase = state.phases.find((p) => p.name === op.phase);
  if (!phase) {
    phase = { name: op.phase, tasks: [] };
    state.phases.push(phase);
  }
  if (!op.items || op.items.length === 0) throw new Error("append requires items");
  for (const text of op.items) {
    if (!phase.tasks.some((t) => t.text === text)) {
      phase.tasks.push({ text, status: "pending" });
    }
  }
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerTodoTools(server) {
  server.tool(
    "todo",
    "Manages phased task list with operations: init, start, done, drop, rm, append, view. Tasks are addressed by verbatim content string.",
    {
      ops: z.array(
        z.object({
          op: z.enum(["init", "start", "done", "drop", "rm", "append", "view"]),
          task: z.string().optional(),
          phase: z.string().optional(),
          items: z.array(z.string()).optional(),
          list: z
            .array(
              z.object({
                phase: z.string(),
                items: z.array(z.string()),
              })
            )
            .optional(),
        })
      ),
    },
    async ({ ops }) => {
      try {
        let state = loadTodoState();

        for (const op of ops) {
          switch (op.op) {
            case "init":
              state = opInit(op);
              break;
            case "start":
              opStart(state, op);
              break;
            case "done":
              opDone(state, op);
              break;
            case "drop":
              opDrop(state, op);
              break;
            case "rm":
              opRemove(state, op);
              break;
            case "append":
              opAppend(state, op);
              break;
            case "view":
              break;
            default:
              throw new Error(`Unknown operation: ${op.op}`);
          }
        }

        // Always save state (except for view-only)
        const isViewOnly = ops.every((o) => o.op === "view");
        if (!isViewOnly) {
          saveTodoState(state);
        }

        const view = formatTodoView(state);
        return {
          content: [{ type: "text", text: view }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT \u2014 Todo error: ${e.message}` }],
        };
      }
    }
  );
}
