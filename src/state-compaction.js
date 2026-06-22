/**
 * Stack Perfeita MCP — Automatic project state compaction
 * Predictable trimming when state grows beyond configured thresholds.
 */

import { STATE_LIMITS } from "./config.js";

const ARRAY_SECTIONS = [
  "constraints",
  "decisions",
  "files_changed",
  "next_steps",
  "open_questions",
  "risks",
];

const TRIM_PRIORITY = [
  "files_changed",
  "decisions",
  "constraints",
  "open_questions",
  "risks",
  "next_steps",
];

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clipText(text, maxChars) {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length <= maxChars) return normalized;

  const keepHead = Math.max(40, Math.floor((maxChars - 21) / 2));
  const keepTail = Math.max(20, maxChars - keepHead - 21);
  return `${normalized.slice(0, keepHead).trim()} …[trimmed]… ${normalized.slice(-keepTail).trim()}`;
}

export function measureStateSize(state) {
  return [
    state.objective || "",
    state.last_error || "",
    ...(state.constraints || []),
    ...(state.decisions || []),
    ...(state.files_changed || []),
    ...(state.next_steps || []),
    ...(state.open_questions || []),
    ...(state.risks || []),
  ].join("\n").length;
}

function trimArrayEntries(state, limits, trimmedSections) {
  for (const section of ARRAY_SECTIONS) {
    const values = Array.isArray(state[section]) ? state[section] : [];
    const clipped = values.map((item) => clipText(item, limits.autoCompactMaxEntryChars));
    const changed = clipped.some((item, index) => item !== values[index]);
    if (changed) {
      trimmedSections.add(`${section}:entry-clip`);
    }
    state[section] = clipped;
  }
}

function dropOldestUntilFit(state, limits, trimmedSections) {
  while (measureStateSize(state) > limits.autoCompactThresholdChars) {
    let dropped = false;

    for (const section of TRIM_PRIORITY) {
      const values = Array.isArray(state[section]) ? state[section] : [];
      if (values.length > limits.autoCompactKeepRecentItems) {
        values.shift();
        state[section] = values;
        trimmedSections.add(`${section}:drop-oldest`);
        dropped = true;
        break;
      }
    }

    if (!dropped) break;
  }
}

function clipHardCaps(state, limits, trimmedSections) {
  const objective = clipText(state.objective || "", limits.autoCompactMaxScalarChars);
  if (objective !== state.objective) {
    state.objective = objective;
    trimmedSections.add("objective:clip");
  }

  const lastError = state.last_error ? clipText(state.last_error, limits.autoCompactMaxScalarChars) : null;
  if (lastError !== state.last_error) {
    state.last_error = lastError;
    trimmedSections.add("last_error:clip");
  }

  for (const section of TRIM_PRIORITY) {
    const values = Array.isArray(state[section]) ? state[section] : [];
    while (values.length > limits.autoCompactKeepHardCapItems) {
      values.shift();
      trimmedSections.add(`${section}:hard-cap`);
    }
    state[section] = values;
  }
}

export function autoCompactState(rawState, customLimits = STATE_LIMITS) {
  const state = JSON.parse(JSON.stringify(rawState || {}));
  const limits = {
    autoCompactThresholdChars: customLimits.autoCompactThresholdChars,
    autoCompactHardThresholdChars: customLimits.autoCompactHardThresholdChars,
    autoCompactKeepRecentItems: customLimits.autoCompactKeepRecentItems,
    autoCompactKeepHardCapItems: customLimits.autoCompactKeepHardCapItems,
    autoCompactMaxEntryChars: customLimits.autoCompactMaxEntryChars,
    autoCompactMaxScalarChars: customLimits.autoCompactMaxScalarChars,
  };

  const beforeSize = measureStateSize(state);
  const trimmedSections = new Set();
  const policy = {
    enabled: state.compaction_policy?.enabled !== false,
    threshold_chars: state.compaction_policy?.threshold_chars || limits.autoCompactThresholdChars,
    hard_threshold_chars: state.compaction_policy?.hard_threshold_chars || limits.autoCompactHardThresholdChars,
    preserve_recent_items: state.compaction_policy?.preserve_recent_items || limits.autoCompactKeepRecentItems,
  };

  state.compaction_policy = policy;

  if (!policy.enabled) {
    state.compaction_meta = {
      ...(state.compaction_meta || {}),
      last_total_chars: beforeSize,
    };
    return { state, applied: false, event: null, beforeSize, afterSize: beforeSize };
  }

  trimArrayEntries(state, {
    ...limits,
    autoCompactKeepRecentItems: policy.preserve_recent_items,
  }, trimmedSections);

  let currentSize = measureStateSize(state);
  if (currentSize > policy.threshold_chars) {
    dropOldestUntilFit(state, {
      ...limits,
      autoCompactThresholdChars: policy.threshold_chars,
      autoCompactKeepRecentItems: policy.preserve_recent_items,
    }, trimmedSections);
    currentSize = measureStateSize(state);
  }

  if (currentSize > policy.hard_threshold_chars) {
    clipHardCaps(state, {
      ...limits,
      autoCompactKeepRecentItems: policy.preserve_recent_items,
    }, trimmedSections);
    currentSize = measureStateSize(state);
  }

  const applied = trimmedSections.size > 0;
  const event = applied
    ? {
        kind: "auto-threshold",
        timestamp: new Date().toISOString(),
        before_chars: beforeSize,
        after_chars: currentSize,
        trimmed_sections: [...trimmedSections],
        note: `Automatic state compaction kept latest context and trimmed older/oversized entries.`,
      }
    : null;

  state.compaction_meta = {
    auto_compactions: (state.compaction_meta?.auto_compactions || 0) + (applied ? 1 : 0),
    last_auto_compaction_at: applied ? event.timestamp : state.compaction_meta?.last_auto_compaction_at || null,
    last_total_chars: currentSize,
    last_compacted_chars: applied ? beforeSize - currentSize : 0,
  };

  return {
    state,
    applied,
    event,
    beforeSize,
    afterSize: currentSize,
  };
}
