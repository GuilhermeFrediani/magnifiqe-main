/**
 * Stack Perfeita MCP — Recommendation Writer
 * Writes learned corrections to memory/state files.
 * Port of Headroom's writer.py pattern.
 */

import { atomicWrite, readFile } from "../helpers.js";

/**
 * Write recommendations to session memory file.
 * @param {string} memoryFile - Path to session_memory.json
 * @param {import("./analyzer.js").Recommendation[]} recommendations
 * @returns {number} Number of recommendations written
 */
export function writeRecommendations(memoryFile, recommendations) {
  if (!recommendations.length) return 0;

  let memory = { observations: [] };
  try {
    const content = readFile(memoryFile);
    if (content) memory = JSON.parse(content);
  } catch {
    // Start fresh
  }

  if (!Array.isArray(memory.observations)) memory.observations = [];

  let written = 0;
  for (const rec of recommendations) {
    const observation = `[learned] ${rec.target}: ${rec.content} (reason: ${rec.reason})`;

    // Deduplicate by content
    const isDuplicate = memory.observations.some(
      o => typeof o === "string" && o.toLowerCase() === observation.toLowerCase()
    );

    if (!isDuplicate) {
      memory.observations.push({
        text: observation,
        timestamp: new Date().toISOString(),
        source: "headroom_learn",
        estimatedTokensSaved: rec.estimatedTokensSaved || 0,
      });
      written++;
    }
  }

  // Trim to max 100 observations
  if (memory.observations.length > 100) {
    memory.observations = memory.observations.slice(-100);
  }

  atomicWrite(memoryFile, JSON.stringify(memory, null, 2));
  return written;
}

/**
 * Generate a human-readable summary of applied recommendations.
 * @param {import("./analyzer.js").Recommendation[]} recommendations
 * @returns {string}
 */
export function formatRecommendationSummary(recommendations) {
  if (!recommendations.length) return "No recommendations generated.";

  const lines = [`## Headroom Learn — ${recommendations.length} Recommendations\n`];
  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    lines.push(`${i + 1}. **[${rec.target}]** ${rec.content}`);
    lines.push(`   Reason: ${rec.reason}`);
    if (rec.estimatedTokensSaved) lines.push(`   Est. tokens saved: ${rec.estimatedTokensSaved}`);
    lines.push("");
  }
  return lines.join("\n");
}
