/**
 * Stack Perfeita MCP — Token Profiles System
 * Filters advertised tools based on profile selection.
 * Inspired by token-savior's TOKEN_SAVIOR_PROFILE system.
 * 
 * Profiles:
 * - full (default): All 166+ tools advertised
 * - core: Daily coding tools, no memory/advanced features
 * - nav: Read-only exploration tools only
 * - lean: Essential tools, no memory engine
 * - ultra: Hot tools only + ts_extended meta-tool
 * - tiny: Minimal set, defer-load via search
 * 
 * Usage: Set TOKEN_MAGNIFIQE_PROFILE env var or use profile_select tool.
 */

import { z } from "zod";

// Tool-to-profile mapping
const TOOL_PROFILES = {
  // === CORE (always included) ===
  activate_project: ["full", "core", "nav", "lean", "ultra", "tiny"],
  doctor_runtime_setup: ["full", "core", "nav", "lean", "ultra", "tiny"],
  get_project_state: ["full", "core", "nav", "lean", "ultra"],
  save_project_state: ["full", "core", "lean", "ultra"],
  
  // === CODE READING (core) ===
  smart_outline: ["full", "core", "nav", "lean", "ultra", "tiny"],
  smart_unfold: ["full", "core", "nav", "lean", "ultra"],
  smart_read: ["full", "core", "nav", "lean", "ultra", "tiny"],
  
  // === VALIDATION (core) ===
  validate_bad_code: ["full", "core", "lean", "ultra"],
  validate_response_style: ["full", "core", "lean", "ultra"],
  validate_git_commit: ["full", "core", "lean"],
  dependency_validate: ["full", "core", "lean"],
  
  // === ANTI-HALLUCINATION (core) ===
  detect_hallucination: ["full", "core", "lean"],
  groundedness_score: ["full", "core", "lean"],
  detect_output_dedup: ["full", "core", "lean"],
  session_health: ["full", "core", "lean", "ultra"],
  session_watchdog: ["full", "core", "lean"],
  
  // === COMPRESSION/CCR (core) ===
  compress_tool_output: ["full", "core", "lean"],
  decompress_tool_output: ["full", "core", "lean"],
  semantic_compress: ["full", "core", "lean", "ultra"],
  compress_markdown: ["full", "core", "lean"],
  
  // === CAVEMAN (core) ===
  caveman_budget: ["full", "core", "lean", "ultra"],
  validate_caveman_output: ["full", "core", "lean"],
  
  // === KARPATHY (core) ===
  evaluate_karpathy_compliance: ["full", "core", "lean"],
  get_karpathy_stats: ["full", "core", "lean"],
  test_code_simplicity: ["full", "core", "lean"],
  test_goal_driven: ["full", "core", "lean"],
  get_karpathy_dashboard: ["full", "core"],
  get_karpathy_impact: ["full", "core"],
  
  // === TASK/TODO (core) ===
  todo: ["full", "core", "lean"],
  start_task_contract: ["full", "core", "lean"],
  assert_step_evidence: ["full", "core", "lean"],
  get_task_checklist: ["full", "core", "lean"],
  
  // === CI/CD (core) ===
  validate_cicd_config: ["full", "core", "lean"],
  triage_issue: ["full", "core", "lean"],
  review_pr: ["full", "core", "lean"],
  fix_issue: ["full", "core"],
  
  // === PROMPT ENGINEERING (core) ===
  adapt_prompt: ["full", "core", "lean"],
  scaffold_reasoning: ["full", "core", "lean"],
  inject_few_shot: ["full", "core", "lean"],
  save_prompt_version: ["full", "core"],
  ab_test_prompts: ["full", "core"],
  
  // === PERFORMANCE (core) ===
  run_benchmark: ["full", "core", "lean"],
  compare_models: ["full", "core", "lean"],
  estimate_tokens: ["full", "core", "lean", "ultra"],
  check_context_budget: ["full", "core", "lean", "ultra"],
  
  // === SESSION ANALYTICS (lean) ===
  track_session_event: ["full", "core", "lean"],
  get_session_summary: ["full", "core", "lean"],
  analyze_session_patterns: ["full", "core"],
  
  // === ERROR RECOVERY (lean) ===
  classify_error: ["full", "core", "lean"],
  create_recovery_plan: ["full", "core", "lean"],
  execute_recovery: ["full", "core"],
  
  // === SAST/SECURITY (lean) ===
  scan_sast_rules: ["full", "core", "lean"],
  detect_prompt_injection: ["full", "core", "lean"],
  generate_policy: ["full", "core"],
  
  // === IDE (lean) ===
  get_ide_config: ["full", "core", "lean"],
  adapt_for_ide: ["full", "core", "lean"],
  get_ide_workflow: ["full", "core"],
  
  // === NEW TOOLS (ECC-imported) ===
  verification_pipeline: ["full", "core", "lean"],
  eval_define: ["full", "core"],
  eval_run: ["full", "core"],
  eval_list: ["full", "core"],
  token_budget: ["full", "core", "lean", "ultra"],
  context_audit: ["full", "core"],
  instinct_observe: ["full", "core"],
  instinct_status: ["full", "core"],
  instinct_evolve: ["full", "core"],
  prompt_optimize: ["full", "core", "lean", "ultra"],
  prompt_diagnose: ["full", "core", "lean", "ultra"],
  acceptance_criteria: ["full", "core", "lean"],
  risk_assessment: ["full", "core", "lean"],
  error_patterns: ["full", "core", "lean"],
  error_audit: ["full", "core", "lean"],
  santa_review: ["full", "core", "lean"],
  santa_rubric: ["full", "core"],
  santa_history: ["full", "core"],
  
  // === MCP SHRINK (token economy) ===
  shrink_text: ["full", "core", "lean", "ultra"],
  shrink_tool_descriptions: ["full", "core"],
  shrink_stats: ["full", "core"],
};

// Profile definitions with token estimates
const PROFILES = {
  full: { name: "Full", description: "All tools advertised", estimatedTokens: 8800 },
  core: { name: "Core", description: "Daily coding, no memory/advanced", estimatedTokens: 5800 },
  lean: { name: "Lean", description: "Essential tools only", estimatedTokens: 3100 },
  ultra: { name: "Ultra", description: "Hot tools + meta-tool", estimatedTokens: 2100 },
  tiny: { name: "Tiny", description: "Minimal, defer-load via search", estimatedTokens: 1070 },
};

// Current session profile
let currentProfile = process.env.TOKEN_MAGNIFIQE_PROFILE || "full";

export function registerTokenProfileTools(server) {
  // Tool 1: Select a profile
  server.tool(
    "profile_select",
    "Selects a tool profile that filters which tools are advertised in tools/list. Reduces token consumption by hiding tools not needed for current work. Profiles: full (all), core (daily coding), lean (essential), ultra (hot tools), tiny (minimal).",
    {
      profile: z.enum(["full", "core", "lean", "ultra", "tiny"]).describe("Profile to activate")
    },
    async ({ profile }) => {
      currentProfile = profile;
      const prof = PROFILES[profile];
      const toolsInProfile = Object.entries(TOOL_PROFILES)
        .filter(([_, profiles]) => profiles.includes(profile))
        .length;
      const totalTools = Object.keys(TOOL_PROFILES).length;
      const hidden = totalTools - toolsInProfile;
      const savingsPercent = Math.round((hidden / totalTools) * 100);

      const report = [
        "PROFILE SELECTED",
        "═══════════════════════════════════════",
        `Profile: ${prof.name}`,
        `Description: ${prof.description}`,
        `Tools advertised: ${toolsInProfile}/${totalTools}`,
        `Tools hidden: ${hidden} (${savingsPercent}% reduction)`,
        `Estimated tokens: ~${prof.estimatedTokens.toLocaleString()}`,
        "",
        "## Visible Tools by Category",
        ...getToolsByCategory(profile),
        "",
        "═══════════════════════════════════════",
        `Switch profile: profile_select profile:"core"`
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  // Tool 2: Show current profile
  server.tool(
    "profile_status",
    "Shows the currently active profile and its tool count, estimated tokens, and available profiles.",
    {},
    async () => {
      const prof = PROFILES[currentProfile];
      const toolsInProfile = Object.entries(TOOL_PROFILES)
        .filter(([_, profiles]) => profiles.includes(currentProfile))
        .length;
      const totalTools = Object.keys(TOOL_PROFILES).length;

      const report = [
        "TOKEN PROFILE STATUS",
        "═══════════════════════════════════════",
        `Current profile: ${prof.name} (${currentProfile})`,
        `Tools advertised: ${toolsInProfile}/${totalTools}`,
        `Estimated tokens: ~${prof.estimatedTokens.toLocaleString()}`,
        "",
        "## Available Profiles",
        ...Object.entries(PROFILES).map(([key, p]) => {
          const count = Object.entries(TOOL_PROFILES)
            .filter(([_, profiles]) => profiles.includes(key))
            .length;
          const marker = key === currentProfile ? " ← ACTIVE" : "";
          return `[${key}] ${p.name}: ${count} tools (~${p.estimatedTokens.toLocaleString()} tokens)${marker}`;
        }),
        "",
        "═══════════════════════════════════════",
        "Environment: TOKEN_MAGNIFIQE_PROFILE=core"
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  // Tool 3: Filter tools list (called internally or by client)
  server.tool(
    "profile_filter_tools",
    "Returns the filtered list of tool names for the current profile. Use this to understand which tools will be visible to the LLM.",
    {},
    async () => {
      const visibleTools = Object.entries(TOOL_PROFILES)
        .filter(([_, profiles]) => profiles.includes(currentProfile))
        .map(([name]) => name);

      return { content: [{ type: "text", text: visibleTools.join("\n") }] };
    }
  );
}

function getToolsByCategory(profile) {
  const categories = {
    "Activation/State": ["activate_project", "doctor_runtime_setup", "get_project_state", "save_project_state"],
    "Code Reading": ["smart_outline", "smart_unfold", "smart_read"],
    "Validation": ["validate_bad_code", "validate_response_style", "validate_git_commit", "dependency_validate"],
    "Anti-Hallucination": ["detect_hallucination", "groundedness_score", "detect_output_dedup", "session_health", "session_watchdog"],
    "Compression": ["compress_tool_output", "decompress_tool_output", "semantic_compress", "compress_markdown"],
    "Caveman": ["caveman_budget", "validate_caveman_output"],
    "Karpathy": ["evaluate_karpathy_compliance", "get_karpathy_stats", "test_code_simplicity", "test_goal_driven", "get_karpathy_dashboard", "get_karpathy_impact"],
    "Token Economy": ["shrink_text", "shrink_tool_descriptions", "shrink_stats", "token_budget", "context_audit", "prompt_optimize", "prompt_diagnose"],
  };

  const lines = [];
  for (const [cat, tools] of Object.entries(categories)) {
    const visible = tools.filter(t => TOOL_PROFILES[t]?.includes(profile));
    if (visible.length > 0) {
      lines.push(`  ${cat}: ${visible.join(", ")}`);
    }
  }
  return lines;
}
