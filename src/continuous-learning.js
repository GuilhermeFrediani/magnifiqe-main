/**
 * Stack Perfeita MCP — Continuous Learning (Instinct-Based)
 * Observes session patterns, creates atomic instincts with confidence,
 * evolves them into skills. Project-scoped to prevent cross-contamination.
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

// Instinct store path
const STORE_DIR = resolve(process.cwd(), ".magnifiqe", "instincts");

function ensureStore() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}
function getProjectId() {
  try {
    const remote = execSync("git remote get-url origin 2>/dev/null", { encoding: "utf-8" }).trim();
    return createHash("sha256").update(remote).digest("hex").slice(0, 12);
  } catch {
    return "global";
  }
}

function loadInstincts(projectId) {
  const file = resolve(STORE_DIR, `${projectId}.json`);
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return []; }
}

function saveInstincts(projectId, instincts) {
  ensureStore();
  const file = resolve(STORE_DIR, `${projectId}.json`);
  writeFileSync(file, JSON.stringify(instincts, null, 2));
}

export function registerContinuousLearningTools(server) {
  // Tool 1: Record an observation
  server.tool(
    "instinct_observe",
    "Records a session observation (pattern, correction, error resolution). The system uses observations to create instincts — atomic learned behaviors with confidence scoring. Each observation strengthens or weakens related instincts.",
    {
      type: z.enum(["correction", "error_resolution", "pattern", "preference"]).describe("Type of observation"),
      description: z.string().describe("What was observed (e.g., 'User corrected class-based approach to functional')"),
      domain: z.enum(["code-style", "testing", "git", "debugging", "workflow", "security", "performance", "architecture"]).describe("Domain category"),
      evidence: z.string().optional().describe("Supporting evidence or context")
    },
    async ({ type, description, domain, evidence }) => {
      const projectId = getProjectId();
      const instincts = loadInstincts(projectId);

      // Check if similar instinct exists
      const existing = instincts.find(i =>
        i.domain === domain && i.description.toLowerCase().includes(description.toLowerCase().slice(0, 30))
      );

      if (existing) {
        // Strengthen existing instinct
        existing.confidence = Math.min(0.95, existing.confidence + 0.1);
        existing.observations.push({ type, description, evidence, timestamp: new Date().toISOString() });
        saveInstincts(projectId, instincts);
        return { content: [{ type: "text", text: `Instinct strengthened: "${existing.name}" (confidence: ${existing.confidence.toFixed(2)})\nObservation recorded for domain: ${domain}` }] };
      }

      // Create new instinct
      const instinct = {
        id: `instinct-${Date.now()}`,
        name: description.slice(0, 60),
        description,
        domain,
        confidence: 0.3,
        type,
        scope: "project",
        project_id: projectId,
        observations: [{ type, description, evidence, timestamp: new Date().toISOString() }],
        created: new Date().toISOString()
      };
      instincts.push(instinct);
      saveInstincts(projectId, instincts);

      return { content: [{ type: "text", text: `New instinct created: "${instinct.name}"\nDomain: ${domain} | Confidence: 0.30 (tentative)\nObservations needed: ~5 to reach confidence 0.7+` }] };
    }
  );

  // Tool 2: List instincts
  server.tool(
    "instinct_status",
    "Shows all learned instincts for the current project, sorted by confidence. Displays domain, observation count, and whether each instinct is ready for promotion.",
    {
      domain: z.string().optional().describe("Filter by domain (e.g., 'code-style', 'testing')"),
      min_confidence: z.number().optional().describe("Minimum confidence threshold (0-1, default: 0)")
    },
    async ({ domain, min_confidence }) => {
      const projectId = getProjectId();
      let instincts = loadInstincts(projectId);

      if (domain) instincts = instincts.filter(i => i.domain === domain);
      if (min_confidence) instincts = instincts.filter(i => i.confidence >= min_confidence);

      instincts.sort((a, b) => b.confidence - a.confidence);

      if (instincts.length === 0) {
        return { content: [{ type: "text", text: "No instincts recorded yet for this project.\nUse instinct_observe to start learning patterns." }] };
      }

      const report = [
        `INSTINCT STATUS — Project: ${projectId}`,
        "═══════════════════════════════════════",
        `Total instincts: ${instincts.length}`,
        "",
        ...instincts.map(i => {
          const ready = i.confidence >= 0.7 ? "READY" : i.confidence >= 0.5 ? "BUILDING" : "TENTATIVE";
          return [
            `[${ready}] ${i.name}`,
            `  Domain: ${i.domain} | Confidence: ${i.confidence.toFixed(2)} | Observations: ${i.observations.length}`,
            `  Scope: ${i.scope} | Created: ${i.created.split("T")[0]}`
          ].join("\n");
        }),
        "",
        "═══════════════════════════════════════",
        `Promotion candidates: ${instincts.filter(i => i.confidence >= 0.8).length} (confidence >= 0.8)`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  // Tool 3: Evolve instincts into skills
  server.tool(
    "instinct_evolve",
    "Clusters related instincts and generates a skill definition from the cluster. High-confidence instincts (>= 0.7) with 3+ observations are candidates for evolution.",
    {
      domain: z.string().optional().describe("Evolve instincts from this domain only")
    },
    async ({ domain }) => {
      const projectId = getProjectId();
      let instincts = loadInstincts(projectId);

      if (domain) instincts = instincts.filter(i => i.domain === domain);

      const candidates = instincts.filter(i => i.confidence >= 0.7 && i.observations.length >= 3);

      if (candidates.length === 0) {
        return { content: [{ type: "text", text: "No instincts ready for evolution yet.\nNeed: confidence >= 0.7 AND observations >= 3\nUse instinct_observe to gather more evidence." }] };
      }

      // Group by domain
      const groups = {};
      for (const i of candidates) {
        if (!groups[i.domain]) groups[i.domain] = [];
        groups[i.domain].push(i);
      }

      const skills = [];
      for (const [dom, insts] of Object.entries(groups)) {
        const skillName = `learned-${dom}`;
        const skillContent = [
          `# ${skillName}`,
          "",
          "## Auto-generated from session observations",
          "",
          "### Patterns:",
          ...insts.map(i => `- ${i.name} (confidence: ${i.confidence.toFixed(2)}, ${i.observations.length} observations)`),
          "",
          "### Rules:",
          ...insts.map(i => `- When ${i.domain}: ${i.description}`),
          "",
          `Generated: ${new Date().toISOString()}`,
          `Project: ${projectId}`
        ].join("\n");

        skills.push({ domain: dom, name: skillName, content: skillContent, instinctCount: insts.length });
      }

      return { content: [{ type: "text", text: [
        "INSTINCT EVOLUTION",
        "═══════════════════════════════════════",
        `Candidates: ${candidates.length} instincts across ${Object.keys(groups).length} domains`,
        "",
        ...skills.map(s => `[${s.name}] (${s.instinctCount} instincts)\n${s.content.slice(0, 300)}...`),
        "",
        "═══════════════════════════════════════",
        "To persist: save skill content to .magnifiqe/skills/ directory"
      ].join("\n") }] };
    }
  );
}
