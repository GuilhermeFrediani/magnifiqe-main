/**
 * Stack Perfeita MCP — Prompt Versioning (GAP-14)
 * Version control and A/B testing for prompts.
 * File-based persistence under .prompt-versions/.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT } from "./config.js";

// ─── Persistence ────────────────────────────────────────────────────────────

const PROMPTS_DIR = join(PROJECT_ROOT, ".prompt-versions");
const AB_TESTS_DIR = join(PROMPTS_DIR, "ab-tests");

function ensureDirs() {
  if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });
  if (!existsSync(AB_TESTS_DIR)) mkdirSync(AB_TESTS_DIR, { recursive: true });
}

function promptFilePath(name) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(PROMPTS_DIR, `${safe}.json`);
}

function abTestFilePath(testId) {
  return join(AB_TESTS_DIR, `${testId}.json`);
}

function loadPromptStore(name) {
  const p = promptFilePath(name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function savePromptStore(name, store) {
  ensureDirs();
  writeFileSync(promptFilePath(name), JSON.stringify(store, null, 2), "utf-8");
}

function loadABTest(testId) {
  const p = abTestFilePath(testId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function saveABTest(testId, data) {
  ensureDirs();
  writeFileSync(abTestFilePath(testId), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Diff Engine ────────────────────────────────────────────────────────────

/**
 * Produce a human-readable line-by-line diff between two prompt strings.
 * Changed lines prefixed with +/-, unchanged with space.
 */
function computeDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diff = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === undefined) {
      diff.push(`+ ${newLine}`);
    } else if (newLine === undefined) {
      diff.push(`- ${oldLine}`);
    } else if (oldLine !== newLine) {
      diff.push(`- ${oldLine}`);
      diff.push(`+ ${newLine}`);
    } else {
      diff.push(`  ${oldLine}`);
    }
  }

  return diff.join("\n");
}

/**
 * Extract human-readable change descriptions between two prompts.
 */
function extractChanges(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const changes = [];

  if (oldLines.length !== newLines.length) {
    changes.push(
      `Line count changed: ${oldLines.length} → ${newLines.length} (${newLines.length > oldLines.length ? "added" : "removed"} ${Math.abs(newLines.length - oldLines.length)} line(s))`
    );
  }

  let additions = 0;
  let deletions = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;
    if (oldLine === undefined) additions++;
    else if (newLine === undefined) deletions++;
    else if (oldLine !== newLine) {
      additions++;
      deletions++;
    }
  }

  if (additions > 0) changes.push(`${additions} line(s) changed or added`);
  if (deletions > 0 && additions === 0) changes.push(`${deletions} line(s) removed`);

  // Word count diff
  const oldWords = oldText.split(/\s+/).filter(Boolean).length;
  const newWords = newText.split(/\s+/).filter(Boolean).length;
  if (oldWords !== newWords) {
    changes.push(`Word count: ${oldWords} → ${newWords} (${newWords > oldWords ? "+" : ""}${newWords - oldWords})`);
  }

  if (changes.length === 0) changes.push("No differences found");

  return changes;
}

/**
 * Generate a recommendation based on version comparison.
 */
function generateRecommendation(oldText, newText, versionA, versionB) {
  const changes = extractChanges(oldText, newText);
  const oldWords = oldText.split(/\s+/).filter(Boolean).length;
  const newWords = newText.split(/\s+/).filter(Boolean).length;

  const parts = [];

  if (newText.length < oldText.length) {
    parts.push(`Version ${versionB} is more concise (${newText.length} chars vs ${oldText.length}).`);
  } else if (newText.length > oldText.length) {
    parts.push(`Version ${versionB} is more detailed (${newText.length} chars vs ${oldText.length}).`);
  } else {
    parts.push("Both versions have the same length.");
  }

  if (newWords < oldWords) {
    parts.push("Shorter prompts generally improve LLM focus and reduce token cost.");
  } else if (newWords > oldWords * 1.5) {
    parts.push("Significantly longer prompt may increase latency and token cost without proportional quality gain.");
  }

  if (changes.length <= 2 && changes[0] === "No differences found") {
    parts.push("Versions are identical — consider whether a new version is needed.");
  } else {
    parts.push("Review the diff to verify intent is preserved.");
  }

  return parts.join(" ");
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

/**
 * save_prompt_version — Save a prompt version with metadata.
 */
function handleSavePromptVersion({ name, prompt, description, tags }) {
  try {
    const rlh = rateLimiter.check("save_prompt_version");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    ensureDirs();

    let store = loadPromptStore(name);
    if (!store) {
      store = { name, versions: [] };
    }

    const version = store.versions.length + 1;
    const entry = {
      version,
      prompt,
      description: description || "",
      tags: tags || [],
      created_at: new Date().toISOString(),
    };

    store.versions.push(entry);
    savePromptStore(name, store);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          version,
          name,
          saved_at: entry.created_at,
          tags: entry.tags,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — save_prompt_version failed: ${e.message}` }] };
  }
}

/**
 * get_prompt_version — Retrieve a specific or latest prompt version.
 */
function handleGetPromptVersion({ name, version }) {
  try {
    const rlh = rateLimiter.check("get_prompt_version");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    const store = loadPromptStore(name);
    if (!store || store.versions.length === 0) {
      return {
        content: [{ type: "text", text: `HALT: No versions found for prompt "${name}".` }],
      };
    }

    let entry;
    if (version !== undefined && version !== null) {
      entry = store.versions.find(v => v.version === version);
      if (!entry) {
        return {
          content: [{
            type: "text",
            text: `HALT: Version ${version} not found for prompt "${name}". Available: 1–${store.versions.length}.`,
          }],
        };
      }
    } else {
      entry = store.versions[store.versions.length - 1];
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: store.name,
          version: entry.version,
          prompt: entry.prompt,
          description: entry.description,
          tags: entry.tags,
          created_at: entry.created_at,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — get_prompt_version failed: ${e.message}` }] };
  }
}

/**
 * list_prompt_versions — List all versions of a prompt.
 */
function handleListPromptVersions({ name }) {
  try {
    const rlh = rateLimiter.check("list_prompt_versions");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    const store = loadPromptStore(name);
    if (!store || store.versions.length === 0) {
      return {
        content: [{ type: "text", text: `HALT: No versions found for prompt "${name}".` }],
      };
    }

    const versions = store.versions.map(v => ({
      version: v.version,
      description: v.description,
      tags: v.tags,
      created_at: v.created_at,
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: store.name,
          versions,
          total: versions.length,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — list_prompt_versions failed: ${e.message}` }] };
  }
}

/**
 * compare_prompt_versions — Diff two versions of a prompt.
 */
function handleComparePromptVersions({ name, version_a, version_b }) {
  try {
    const rlh = rateLimiter.check("compare_prompt_versions");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    const store = loadPromptStore(name);
    if (!store || store.versions.length === 0) {
      return {
        content: [{ type: "text", text: `HALT: No versions found for prompt "${name}".` }],
      };
    }

    const entryA = store.versions.find(v => v.version === version_a);
    const entryB = store.versions.find(v => v.version === version_b);

    if (!entryA) {
      return {
        content: [{
          type: "text",
          text: `HALT: Version ${version_a} not found for prompt "${name}". Available: 1–${store.versions.length}.`,
        }],
      };
    }
    if (!entryB) {
      return {
        content: [{
          type: "text",
          text: `HALT: Version ${version_b} not found for prompt "${name}". Available: 1–${store.versions.length}.`,
        }],
      };
    }

    const diff = computeDiff(entryA.prompt, entryB.prompt);
    const changes = extractChanges(entryA.prompt, entryB.prompt);
    const recommendation = generateRecommendation(entryA.prompt, entryB.prompt, version_a, version_b);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          version_a: {
            version: entryA.version,
            description: entryA.description,
            prompt: entryA.prompt,
            created_at: entryA.created_at,
          },
          version_b: {
            version: entryB.version,
            description: entryB.description,
            prompt: entryB.prompt,
            created_at: entryB.created_at,
          },
          diff,
          changes,
          recommendation,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — compare_prompt_versions failed: ${e.message}` }] };
  }
}

/**
 * ab_test_prompts — Set up an A/B test between two prompt variants.
 */
function handleABTestPrompts({ name, variant_a, variant_b, traffic_split }) {
  try {
    const rlh = rateLimiter.check("ab_test_prompts");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    ensureDirs();

    const split = traffic_split !== undefined ? traffic_split : 50;
    if (split < 0 || split > 100) {
      return {
        content: [{ type: "text", text: "HALT: traffic_split must be between 0 and 100." }],
      };
    }

    const testId = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`;
    const testData = {
      test_id: testId,
      name,
      variants: {
        a: { id: "a", prompt: variant_a, impressions: 0, successes: 0, total_score: 0 },
        b: { id: "b", prompt: variant_b, impressions: 0, successes: 0, total_score: 0 },
      },
      traffic_split: split,
      status: "active",
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    saveABTest(testId, testData);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          test_id: testId,
          variants: { a: "a", b: "b" },
          traffic_split: split,
          status: "active",
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — ab_test_prompts failed: ${e.message}` }] };
  }
}

/**
 * get_ab_test_results — Return A/B test results.
 */
function handleGetABTestResults({ test_id }) {
  try {
    const rlh = rateLimiter.check("get_ab_test_results");
    if (rlh) return { content: [{ type: "text", text: rlh }] };

    const test = loadABTest(test_id);
    if (!test) {
      return {
        content: [{ type: "text", text: `HALT: A/B test "${test_id}" not found.` }],
      };
    }

    const calcRate = (v) => v.impressions > 0 ? +(v.successes / v.impressions).toFixed(4) : 0;
    const rateA = calcRate(test.variants.a);
    const rateB = calcRate(test.variants.b);
    const totalA = test.variants.a.impressions;
    const totalB = test.variants.b.impressions;

    // Simple confidence heuristic based on sample sizes
    let confidence = 0;
    const minSamples = 10;
    if (totalA >= minSamples && totalB >= minSamples) {
      const diff = Math.abs(rateA - rateB);
      const pooledRate = (test.variants.a.successes + test.variants.b.successes) / (totalA + totalB || 1);
      const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / totalA + 1 / totalB));
      if (se > 0) {
        const zScore = diff / se;
        // Rough confidence from z-score
        if (zScore > 2.576) confidence = 0.99;
        else if (zScore > 1.96) confidence = 0.95;
        else if (zScore > 1.645) confidence = 0.90;
        else confidence = +(0.5 + 0.5 * Math.erf(zScore / Math.sqrt(2))).toFixed(4);
      }
    }

    let winner = null;
    if (confidence >= 0.95 && totalA >= minSamples && totalB >= minSamples) {
      winner = rateA > rateB ? "a" : rateB > rateA ? "b" : null;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          test_id: test.test_id,
          name: test.name,
          status: test.status,
          traffic_split: test.traffic_split,
          created_at: test.created_at,
          results: {
            a: {
              impressions: totalA,
              successes: test.variants.a.successes,
              success_rate: rateA,
            },
            b: {
              impressions: totalB,
              successes: test.variants.b.successes,
              success_rate: rateB,
            },
          },
          winner,
          confidence,
        }, null, 2),
      }],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `HALT — get_ab_test_results failed: ${e.message}` }] };
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Register all prompt-versioning tools on the MCP server.
 * @param {McpServer} server
 */
export function registerPromptVersioningTools(server) {
  // 1. save_prompt_version
  server.tool(
    "save_prompt_version",
    "Save a prompt version with metadata. Auto-increments version number. File-based persistence under .prompt-versions/.",
    {
      name: z.string().min(1).describe("Unique name identifier for the prompt (e.g. 'code-review-system')."),
      prompt: z.string().min(1).describe("The full prompt text to save."),
      description: z.string().optional().describe("Optional description of this version's purpose or changes."),
      tags: z.array(z.string()).optional().describe("Optional tags for categorization (e.g. ['production', 'v2'])."),
    },
    handleSavePromptVersion,
  );

  // 2. get_prompt_version
  server.tool(
    "get_prompt_version",
    "Retrieve a specific prompt version by name and version number. If version is omitted, returns the latest version.",
    {
      name: z.string().min(1).describe("Name of the prompt to retrieve."),
      version: z.number().int().positive().optional().describe("Version number to retrieve. Omit for latest."),
    },
    handleGetPromptVersion,
  );

  // 3. list_prompt_versions
  server.tool(
    "list_prompt_versions",
    "List all saved versions of a prompt, including metadata (description, tags, timestamps).",
    {
      name: z.string().min(1).describe("Name of the prompt to list versions for."),
    },
    handleListPromptVersions,
  );

  // 4. compare_prompt_versions
  server.tool(
    "compare_prompt_versions",
    "Compare two versions of a prompt side-by-side with a unified diff, change summary, and recommendation.",
    {
      name: z.string().min(1).describe("Name of the prompt to compare versions of."),
      version_a: z.number().int().positive().describe("First version number (baseline)."),
      version_b: z.number().int().positive().describe("Second version number (target)."),
    },
    handleComparePromptVersions,
  );

  // 5. ab_test_prompts
  server.tool(
    "ab_test_prompts",
    "Set up an A/B test between two prompt variants with configurable traffic split. Returns test ID for tracking.",
    {
      name: z.string().min(1).describe("Name/label for this A/B test."),
      variant_a: z.string().min(1).describe("Full prompt text for variant A (control)."),
      variant_b: z.string().min(1).describe("Full prompt text for variant B (treatment)."),
      traffic_split: z.number().int().min(0).max(100).optional().describe("Percentage of traffic to variant A (0-100, default 50)."),
    },
    handleABTestPrompts,
  );

  // 6. get_ab_test_results
  server.tool(
    "get_ab_test_results",
    "Retrieve results for an A/B test, including impression counts, success rates, confidence level, and winner (if statistically significant).",
    {
      test_id: z.string().min(1).describe("The test ID returned by ab_test_prompts."),
    },
    handleGetABTestResults,
  );
}
