/**
 * Stack Perfeita MCP — LLM Scaffolder (GAP-5)
 * Chain-of-thought scaffolding, few-shot injection, instruction simplification,
 * and reasoning-chain validation for weaker LLMs.
 */

import { z } from "zod";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, relative } from "path";
import { rateLimiter } from "./rate-limiter.js";
import { PROJECT_ROOT } from "./config.js";
import { readFile, normalizeText } from "./helpers.js";

// ─── Reasoning scaffolds by complexity × tier ───────────────────────────────

const REASONING_SCAFFOLDS = {
  simple: {
    strong: {
      outline: (task) =>
        `Task: ${task}\n\nApproach:\n1. Identify core requirement\n2. Execute\n3. Verify result`,
      steps: (task) => [
        `Identify what "${task}" requires`,
        "Execute the task",
        "Verify the output",
      ],
      checkpoints: () => ["Is the result correct?", "Is it complete?"],
    },
    medium: {
      outline: (task) =>
        `Task: ${task}\n\nStep-by-step:\n1. Parse the requirement — what exactly is needed?\n2. Plan — list the concrete actions\n3. Execute each action\n4. Checkpoint — does intermediate output make sense?\n5. Finalize — combine results\n6. Verify — re-read the requirement and confirm match`,
      steps: (task) => [
        `Parse requirement: "${task}"`,
        "List concrete actions needed",
        "Execute each action sequentially",
        "Checkpoint: verify intermediate output",
        "Combine partial results",
        "Verify final output matches requirement",
      ],
      checkpoints: () => [
        "After step 1: Do I understand all parts of the requirement?",
        "After step 3: Does each action produce the expected output?",
        "After step 5: Does the combined result match the requirement?",
      ],
    },
    weak: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `THINKING PROCESS (follow each step exactly):\n\n` +
        `Step 1 — UNDERSTAND the task:\n` +
        `  - Re-read the task description\n` +
        `  - Write down in your own words what is being asked\n` +
        `  - List any constraints or requirements mentioned\n` +
        `  CHECKPOINT: Can you explain this task to someone else? If not, re-read.\n\n` +
        `Step 2 — PLAN your approach:\n` +
        `  - What inputs do you have?\n` +
        `  - What output is expected?\n` +
        `  - What steps will get you from input to output?\n` +
        `  CHECKPOINT: Is every step concrete and actionable? No vague steps allowed.\n\n` +
        `Step 3 — EXECUTE each step:\n` +
        `  - Do one step at a time\n` +
        `  - Write the result of each step before moving on\n` +
        `  CHECKPOINT: Does the result of this step look right?\n\n` +
        `Step 4 — VERIFY:\n` +
        `  - Re-read the original task\n` +
        `  - Compare your result against what was asked\n` +
        `  - If anything is missing, go back and fix it`,
      steps: (task) => [
        `UNDERSTAND: Re-read "${task}". Write what it asks in your own words. List all constraints.`,
        `PLAN: What inputs do you have? What output is expected? List concrete steps from input to output. No vague steps.`,
        `EXECUTE step 1: [fill in]. Write the result. Check: does it look right?`,
        `EXECUTE step 2: [fill in]. Write the result. Check: does it look right?`,
        `EXECUTE step N: [fill in]. Write the result. Check: does it look right?`,
        `VERIFY: Re-read the original task. Compare your result. Is anything missing? If yes, fix it.`,
      ],
      checkpoints: () => [
        "Can you explain the task to someone else in your own words?",
        "Is every planned step concrete and actionable?",
        "Does the result of each execution step look correct?",
        "Does the final result match what was originally asked?",
      ],
    },
  },
  moderate: {
    strong: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `Analysis:\n` +
        `- Core components involved\n` +
        `- Dependencies and constraints\n` +
        `- Risk areas\n\n` +
        `Plan:\n` +
        `1. Break down into subtasks\n` +
        `2. Order by dependency\n` +
        `3. Execute\n` +
        `4. Validate`,
      steps: (task) => [
        `Analyze core components for "${task}"`,
        "Identify dependencies and constraints",
        "Break into subtasks ordered by dependency",
        "Execute subtasks",
        "Validate full result",
      ],
      checkpoints: () => [
        "Are all dependencies resolved?",
        "Does each subtask output feed the next correctly?",
        "Does the final output satisfy the full requirement?",
      ],
    },
    medium: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `Step-by-step with checkpoints:\n\n` +
        `1. DECOMPOSE the task:\n` +
        `   - List every subtask\n` +
        `   - Identify dependencies between them\n` +
        `   CHECKPOINT: Are all subtasks accounted for? Missing any?\n\n` +
        `2. SEQUENCE the subtasks:\n` +
        `   - Order by dependency (independent tasks can run first)\n` +
        `   - Note which subtasks have external dependencies\n` +
        `   CHECKPOINT: Is the ordering logical? Any circular dependencies?\n\n` +
        `3. EXECUTE each subtask:\n` +
        `   - Complete one subtask fully before moving to the next\n` +
        `   - Record output of each subtask\n` +
        `   CHECKPOINT: Does each subtask output make sense in isolation?\n\n` +
        `4. INTEGRATE results:\n` +
        `   - Combine subtask outputs\n` +
        `   - Check for conflicts between outputs\n` +
        `   CHECKPOINT: Do all parts fit together?\n\n` +
        `5. VALIDATE the whole:\n` +
        `   - Re-read original task\n` +
        `   - Check every subtask requirement is met\n` +
        `   CHECKPOINT: Is anything missing or wrong?`,
      steps: (task) => [
        `DECOMPOSE: List every subtask for "${task}". Identify dependencies between them.`,
        "SEQUENCE: Order subtasks by dependency. Note external dependencies.",
        "EXECUTE subtask 1: [fill in]. Record output. Check: does it make sense?",
        "EXECUTE subtask 2: [fill in]. Record output. Check: does it make sense?",
        "EXECUTE subtask N: [fill in]. Record output. Check: does it make sense?",
        "INTEGRATE: Combine all subtask outputs. Check for conflicts between them.",
        "VALIDATE: Re-read original task. Check every requirement is met.",
      ],
      checkpoints: () => [
        "Are all subtasks accounted for? Missing any?",
        "Is the subtask ordering logical? Any circular dependencies?",
        "Does each subtask output make sense in isolation?",
        "Do all parts fit together after integration?",
        "Is every requirement from the original task met?",
      ],
    },
    weak: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `DETAILED THINKING PROCESS:\n\n` +
        `Phase 1 — UNDERSTAND (do not skip this):\n` +
        `  1a. Read the task description carefully\n` +
        `  1b. Write the task in your own words (1-2 sentences)\n` +
        `  1c. List ALL constraints mentioned (even implicit ones)\n` +
        `  1d. List ALL expected outputs\n` +
        `  1e. Identify what you do NOT know (questions to answer)\n` +
        `  CHECKPOINT: You should have a clear list of (what to do, what constraints, what output)\n\n` +
        `Phase 2 — PLAN (be specific, no hand-waving):\n` +
        `  2a. List every subtask as a numbered item\n` +
        `  2b. For each subtask, state: INPUT needed, ACTION to take, EXPECTED output\n` +
        `  2c. Order subtasks by dependency\n` +
        `  2d. For each subtask, state ONE way you will verify its output\n` +
        `  CHECKPOINT: Every subtask has (input, action, output, verification). If not, fix it.\n\n` +
        `Phase 3 — EXECUTE (one at a time, verify each):\n` +
        `  3a. Start with the first subtask\n` +
        `  3b. State what you are about to do\n` +
        `  3c. Do it\n` +
        `  3d. Verify the output against your expected output from 2b\n` +
        `  3e. If it does not match, figure out why and fix\n` +
        `  3f. Move to next subtask\n` +
        `  CHECKPOINT: After each subtask, confirm output matches plan\n\n` +
        `Phase 4 — INTEGRATE:\n` +
        `  4a. Combine all subtask outputs in order\n` +
        `  4b. Check: does the combination satisfy ALL constraints from 1c?\n` +
        `  4c. Check: does the combination produce ALL expected outputs from 1d?\n` +
        `  CHECKPOINT: Every constraint and output is accounted for\n\n` +
        `Phase 5 — FINAL VERIFY:\n` +
        `  5a. Re-read the original task description\n` +
        `  5b. Compare your result against it point by point\n` +
        `  5c. If anything is missing or wrong, go back and fix it\n` +
        `  5d. State your confidence level: high / medium / low\n` +
        `  CHECKPOINT: High confidence means you checked every point. Medium means some unchecked. Low means re-do.`,
      steps: (task) => [
        `UNDERSTAND: Re-read "${task}". Write it in your own words. List all constraints. List all expected outputs. State what you do not know.`,
        `PLAN: For each subtask, write: INPUT needed, ACTION to take, EXPECTED output, VERIFICATION method. Order by dependency.`,
        `EXECUTE subtask 1: State what you will do. Do it. Verify output. If wrong, fix.`,
        `EXECUTE subtask 2: State what you will do. Do it. Verify output. If wrong, fix.`,
        `EXECUTE subtask N: State what you will do. Do it. Verify output. If wrong, fix.`,
        `INTEGRATE: Combine all outputs. Check ALL constraints are met. Check ALL expected outputs are present.`,
        `FINAL VERIFY: Re-read original task. Compare point by point. State confidence: high/medium/low.`,
      ],
      checkpoints: () => [
        "You can list all constraints and outputs from memory",
        "Every subtask has (input, action, output, verification)",
        "Each subtask output was verified against the plan",
        "All constraints are satisfied in the integrated result",
        "All expected outputs are present",
        "Confidence level is high (all points checked)",
      ],
    },
  },
  complex: {
    strong: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `Analysis:\n` +
        `- Architecture/components involved\n` +
        `- Dependencies, constraints, risk areas\n` +
        `- Edge cases to handle\n\n` +
        `Plan:\n` +
        `1. Decompose into phases\n` +
        `2. Design each phase\n` +
        `3. Execute with validation gates\n` +
        `4. Integration test\n` +
        `5. Final review`,
      steps: (task) => [
        `Analyze architecture for "${task}"`,
        "Identify all dependencies, constraints, and risks",
        "Enumerate edge cases",
        "Decompose into phases with design per phase",
        "Execute phases with validation gates",
        "Run integration test",
        "Final review against requirements",
      ],
      checkpoints: () => [
        "All edge cases identified?",
        "Each phase design handles its inputs/outputs cleanly?",
        "Validation gates catch issues early?",
        "Integration test covers cross-phase interactions?",
      ],
    },
    medium: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `Full reasoning chain:\n\n` +
        `1. ANALYZE the task deeply:\n` +
        `   - What is the full scope?\n` +
        `   - What are all components involved?\n` +
        `   - What are the dependencies and constraints?\n` +
        `   - What edge cases exist?\n` +
        `   - What could go wrong?\n` +
        `   CHECKPOINT: Have you identified at least 3 edge cases?\n\n` +
        `2. DESIGN the solution:\n` +
        `   - Break into logical phases\n` +
        `   - For each phase: goal, inputs, outputs, validation criteria\n` +
        `   - Identify inter-phase dependencies\n` +
        `   - Define validation gates between phases\n` +
        `   CHECKPOINT: Does every phase have clear inputs/outputs/validation?\n\n` +
        `3. IMPLEMENT phase by phase:\n` +
        `   - Execute one phase completely\n` +
        `   - Run its validation gate\n` +
        `   - Only proceed if gate passes\n` +
        `   CHECKPOINT: Does this phase output satisfy the next phase's input requirements?\n\n` +
        `4. INTEGRATE and test:\n` +
        `   - Combine all phase outputs\n` +
        `   - Run integration checks\n` +
        `   - Test edge cases identified in step 1\n` +
        `   CHECKPOINT: Do all edge cases pass?\n\n` +
        `5. REVIEW:\n` +
        `   - Re-read original requirements\n` +
        `   - Check completeness and correctness\n` +
        `   - Identify any remaining risks\n` +
        `   CHECKPOINT: Can you confidently say every requirement is met?`,
      steps: (task) => [
        `ANALYZE: Full scope of "${task}". List all components, dependencies, constraints, edge cases, risks.`,
        `DESIGN: Break into phases. For each: goal, inputs, outputs, validation criteria. Define validation gates.`,
        `IMPLEMENT phase 1: Execute, then run validation gate. Only proceed if gate passes.`,
        `IMPLEMENT phase 2: Execute, then run validation gate. Only proceed if gate passes.`,
        `IMPLEMENT phase N: Execute, then run validation gate.`,
        `INTEGRATE: Combine all outputs. Run integration checks. Test edge cases.`,
        `REVIEW: Re-read original requirements. Check completeness. Check correctness. List remaining risks.`,
      ],
      checkpoints: () => [
        "At least 3 edge cases identified",
        "Every phase has clear (goal, inputs, outputs, validation criteria)",
        "Validation gates between phases are defined and passing",
        "Integration test covers cross-phase interactions",
        "Edge cases from analysis phase are tested",
        "Every original requirement is verified as met",
      ],
    },
    weak: {
      outline: (task) =>
        `Task: ${task}\n\n` +
        `COMPLETE REASONING CHAIN (follow every step, do not skip):\n\n` +
        `Phase 1 — DEEP UNDERSTANDING (spend real time here):\n` +
        `  1a. Read the task description 3 times. Each time, write down new details you notice.\n` +
        `  1b. Write the task in your own words as if explaining to a junior developer.\n` +
        `  1c. List EVERY constraint (explicit and implicit). For each, explain WHY it exists.\n` +
        `  1d. List EVERY expected output. For each, describe what "done" looks like.\n` +
        `  1e. List the top 5 things that could go wrong. For each, write a mitigation.\n` +
        `  1f. List 3+ edge cases. For each, describe what should happen.\n` +
        `  1g. Write down what you do NOT know and what assumptions you are making.\n` +
        `  CHECKPOINT: You should have written at least 15 lines of analysis. If less, go deeper.\n\n` +
        `Phase 2 — DETAILED PLAN (every step must be concrete):\n` +
        `  2a. Break the task into phases (2-5 phases for complex tasks).\n` +
        `  2b. For each phase, fill in ALL of these:\n` +
        `       - PHASE NAME: [one line]\n` +
        `       - GOAL: [what this phase accomplishes]\n` +
        `       - INPUTS: [exactly what this phase needs]\n` +
        `       - ACTIONS: [numbered list of concrete actions]\n` +
        `       - OUTPUTS: [exactly what this phase produces]\n` +
        `       - VALIDATION: [how to check this phase is correct]\n` +
        `       - EXAMPLE: [a concrete example of what good output looks like]\n` +
        `  2c. Map dependencies: which phases depend on which?\n` +
        `  2d. Define validation gates: what must be true before starting each phase?\n` +
        `  CHECKPOINT: Every phase has ALL 7 fields filled. No placeholders. No "TBD".\n\n` +
        `Phase 3 — EXECUTE (one phase at a time, verify before moving on):\n` +
        `  3a. State which phase you are starting.\n` +
        `  3b. Verify the validation gate for this phase passes.\n` +
        `  3c. Execute each action in the phase.\n` +
        `  3d. After each action, compare output against expected output.\n` +
        `  3e. If output does not match: STOP. Diagnose. Fix. Only then continue.\n` +
        `  3f. When phase is complete, run its validation.\n` +
        `  3g. Record the phase result.\n` +
        `  CHECKPOINT: Phase output matches its designed output. Validation passes.\n\n` +
        `Phase 4 — INTEGRATE (combine everything):\n` +
        `  4a. List all phase results.\n` +
        `  4b. Combine them in dependency order.\n` +
        `  4c. For each constraint from Phase 1c: verify it is satisfied.\n` +
        `  4d. For each expected output from Phase 1d: verify it exists and is correct.\n` +
        `  4e. Test the top 3 edge cases from Phase 1f.\n` +
        `  4f. If anything fails: diagnose, fix, re-test.\n` +
        `  CHECKPOINT: Every constraint satisfied. Every output present. Top edge cases pass.\n\n` +
        `Phase 5 — FINAL CONFIDENCE CHECK:\n` +
        `  5a. Re-read the original task description.\n` +
        `  5b. Go through it point by point. For each point, write: DONE / PARTIAL / NOT DONE.\n` +
        `  5c. If any are PARTIAL or NOT DONE: go back and fix them.\n` +
        `  5d. Write your confidence level and the REASON for it.\n` +
        `  5e. List any remaining risks or known limitations.\n` +
        `  CHECKPOINT: Every point is DONE. Confidence is justified with evidence.`,
      steps: (task) => [
        `DEEP UNDERSTAND: Read "${task}" 3 times. Write own words. List constraints (with reasons). List outputs (with "done" criteria). List top 5 risks + mitigations. List 3+ edge cases. List unknowns and assumptions. Aim for 15+ lines of analysis.`,
        `DETAILED PLAN: Break into phases. For each: NAME, GOAL, INPUTS, ACTIONS (numbered), OUTPUTS, VALIDATION, EXAMPLE. Map dependencies. Define validation gates. No placeholders allowed.`,
        `EXECUTE phase 1: Verify gate. Execute each action. Compare output to expected. If mismatch, STOP and fix. Run phase validation. Record result.`,
        `EXECUTE phase 2: Verify gate. Execute each action. Compare output to expected. If mismatch, STOP and fix. Run phase validation. Record result.`,
        `EXECUTE phase N: Verify gate. Execute each action. Compare output to expected. If mismatch, STOP and fix. Run phase validation. Record result.`,
        `INTEGRATE: Combine all results. Check every constraint. Check every output. Test top 3 edge cases. Fix any failures.`,
        `FINAL CHECK: Re-read original task. Mark each point DONE/PARTIAL/NOT DONE. Fix non-DONE. Write confidence level with evidence. List remaining risks.`,
      ],
      checkpoints: () => [
        "15+ lines of analysis written in Phase 1",
        "Every phase has ALL 7 fields: name, goal, inputs, actions, outputs, validation, example",
        "No placeholders or TBD in the plan",
        "Each phase output was compared to expected and verified",
        "All constraints satisfied in integrated result",
        "All expected outputs present and correct",
        "Top edge cases pass",
        "Every point in original task marked DONE",
        "Confidence level justified with specific evidence",
      ],
    },
  },
};

// ─── Few-shot pattern detection ──────────────────────────────────────────────

const CODE_PATTERNS = [
  { name: "function_declaration", regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{[^}]*\}/gs, type: "function" },
  { name: "class_declaration", regex: /(?:export\s+)?class\s+(\w+)[^{]*\{[\s\S]*?\n\s*\}/gs, type: "class" },
  { name: "arrow_function", regex: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{[^}]*\}/gs, type: "arrow" },
  { name: "async_handler", regex: /async\s+\([^)]*\)\s*=>\s*\{[\s\S]*?return\s+\{[\s\S]*?\}\s*\}/gs, type: "handler" },
  { name: "try_catch", regex: /try\s*\{[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}/gs, type: "error-handling" },
  { name: "validation_block", regex: /(?:const|let)\s+(\w+)\s*=\s*z\.\w+\([^)]*\)[^;]*;/gs, type: "validation" },
];

const SCANNABLE_EXTENSIONS = new Set([".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx", ".py", ".rs", ".go"]);

// ─── Codebase scanning ──────────────────────────────────────────────────────

function scanProjectForExamples(maxExamples = 3) {
  const examples = [];
  try {
    scanDir(PROJECT_ROOT, examples, maxExamples, 0);
  } catch {
    // Project root may not be scannable
  }
  return examples;
}

function scanDir(dir, examples, max, depth) {
  if (depth > 4 || examples.length >= max) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (examples.length >= max) return;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, examples, max, depth + 1);
    } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      extractExamplesFromFile(fullPath, examples, max);
    }
  }
}

function extractExamplesFromFile(filePath, examples, max) {
  if (examples.length >= max) return;
  const content = readFile(filePath);
  if (!content || content.length < 50) return;
  const relPath = relative(PROJECT_ROOT, filePath);
  const lines = content.split("\n");

  for (const pattern of CODE_PATTERNS) {
    if (examples.length >= max) return;
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      if (examples.length >= max) return;
      const matchStart = content.substring(0, match.index).split("\n").length;
      const matchText = match[0];
      const matchLines = matchText.split("\n");
      if (matchLines.length < 3 || matchLines.length > 60) continue;

      // Extract explanation from preceding comments or JSDoc
      const explanation = extractComment(lines, matchStart - 1);

      examples.push({
        pattern: pattern.type,
        code: matchText,
        explanation: explanation || `Found ${pattern.type} in ${relPath}`,
        file: relPath,
      });
    }
  }
}

function extractComment(lines, targetLine) {
  // Look for JSDoc or comment block immediately before the target
  for (let i = targetLine - 1; i >= Math.max(0, targetLine - 8); i--) {
    const line = lines[i]?.trim();
    if (!line) break;
    if (line.startsWith("/**") || line.startsWith("*") || line.startsWith("//") || line.startsWith("#")) {
      const commentLines = [];
      for (let j = i; j <= targetLine - 1; j++) {
        const cl = lines[j]?.trim();
        if (!cl) break;
        commentLines.push(cl.replace(/^\/\*\*?\s?|\*\/?$/g, "").replace(/^\*\s?/, "").replace(/^\/\/\s?/, "").replace(/^#\s?/, ""));
      }
      const text = commentLines.filter((l) => l.trim()).join(" ").trim();
      if (text.length > 5) return text;
    }
  }
  return null;
}

// ─── Instruction simplification ─────────────────────────────────────────────

function simplifyInstructions(instructions, targetModel) {
  const originalLength = instructions.length;
  const changes = [];
  let simplified = instructions;

  // Step 1: Split into sentences
  const sentences = splitIntoSentences(simplified);

  // Step 2: Break compound sentences into simple ones
  const simplifiedSentences = [];
  for (const sentence of sentences) {
    const parts = breakCompoundSentence(sentence);
    simplifiedSentences.push(...parts);
  }
  if (simplifiedSentences.length !== sentences.length) {
    changes.push(`Split ${sentences.length} complex sentences into ${simplifiedSentences.length} simple ones`);
  }

  // Step 3: Remove ambiguity markers
  const ambiguous = findAmbiguityMarkers(simplifiedSentences);
  if (ambiguous.length > 0) {
    changes.push(`Flagged ${ambiguous.length} ambiguous phrases for clarification`);
  }

  // Step 4: Add structure markers
  let numbered = simplifiedSentences.map((s, i) => `${i + 1}. ${s.trim()}`);
  simplified = numbered.join("\n\n");
  changes.push("Added numbered structure for sequential processing");

  // Step 5: Model-specific adjustments
  if (targetModel === "weak") {
    simplified = addWeakModelAids(simplified);
    changes.push("Added explicit step-by-step guidance for weak model");
  } else if (targetModel === "medium") {
    simplified = addMediumModelAids(simplified);
    changes.push("Added checkpoint reminders for medium model");
  }

  // Step 6: Add summary at the end
  simplified += `\n\nSUMMARY: Complete the ${numbered.length} steps above in order. After each step, verify the output before moving to the next.`;
  changes.push("Added execution summary with verification instruction");

  return {
    simplified,
    original_length: originalLength,
    simplified_length: simplified.length,
    changes,
  };
}

function splitIntoSentences(text) {
  // Split on sentence boundaries: period+space, newline, semicolon
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function breakCompoundSentence(sentence) {
  // Break sentences joined by ", and", "; ", ", or", "while", "when", "after", "before"
  const compoundPatterns = [
    /,\s*and\s+/gi,
    /;\s*/g,
    /,\s*or\s+/gi,
    /\s+while\s+/gi,
    /\s+when\s+/gi,
    /\s+after\s+/gi,
    /\s+before\s+/gi,
    /\s+then\s+/gi,
    /\s+also\s+/gi,
    /\s+additionally\s+/gi,
  ];

  let parts = [sentence];
  for (const pattern of compoundPatterns) {
    const newParts = [];
    for (const part of parts) {
      const splits = part.split(pattern);
      newParts.push(...splits.filter((s) => s.trim().length > 0));
    }
    parts = newParts;
  }

  // Only split if result is at least 2 meaningful parts
  if (parts.length < 2 || parts.every((p) => p.trim().length < 10)) {
    return [sentence];
  }
  return parts.map((p) => p.trim());
}

function findAmbiguityMarkers(sentences) {
  const markers = [];
  const ambiguousPatterns = [
    { regex: /\bproperly\b/gi, suggestion: "Define what 'properly' means specifically" },
    { regex: /\bcorrectly\b/gi, suggestion: "Define the expected output format" },
    { regex: /\bas needed\b/gi, suggestion: "Specify exact conditions" },
    { regex: /\bif necessary\b/gi, suggestion: "Define when it is necessary" },
    { regex: /\bmight\b/gi, suggestion: "Replace with 'must' or 'should'" },
    { regex: /\bcould\b/gi, suggestion: "Replace with 'must' or 'should'" },
    { regex: /\betc\.?\b/gi, suggestion: "List all items explicitly" },
    { regex: /\band so on\b/gi, suggestion: "List all items explicitly" },
    { regex: /\bthink about\b/gi, suggestion: "Replace with a concrete action" },
    { regex: /\bhandle\b(?!r|ing)\b/gi, suggestion: "Specify exactly what 'handle' means" },
    { regex: /\bprocess\b/gi, suggestion: "Specify the exact processing steps" },
  ];

  for (const sentence of sentences) {
    for (const { regex, suggestion } of ambiguousPatterns) {
      if (regex.test(sentence)) {
        markers.push({ phrase: sentence.substring(0, 80), suggestion });
      }
    }
  }
  return markers;
}

function addWeakModelAids(text) {
  return (
    text +
    "\n\nIMPORTANT INSTRUCTIONS FOR WEAK MODEL:\n" +
    "- Do one step at a time. Do not try to do everything at once.\n" +
    "- After each step, check: is this what was asked?\n" +
    "- If you are unsure, write down what you think and ask for confirmation.\n" +
    "- Never guess. If you do not know, say so.\n" +
    "- Write out your thinking process before giving the final answer."
  );
}

function addMediumModelAids(text) {
  return (
    text +
    "\n\nREMINDERS:\n" +
    "- Verify each step's output before moving to the next.\n" +
    "- If a step produces unexpected results, diagnose before continuing."
  );
}

// ─── Reasoning validation ────────────────────────────────────────────────────

function validateReasoningChain(reasoning, expectedConclusion) {
  const gaps = [];
  const suggestions = [];

  const normalizedReasoning = normalizeText(reasoning).toLowerCase();
  const normalizedConclusion = normalizeText(expectedConclusion).toLowerCase();

  // Check 1: Is there actually reasoning content?
  const wordCount = reasoning.trim().split(/\s+/).length;
  if (wordCount < 20) {
    gaps.push("Reasoning is too short — likely missing critical steps");
    suggestions.push("Expand reasoning to include at least 3-5 distinct steps");
  }

  // Check 2: Does the reasoning reach the expected conclusion?
  const conclusionWords = normalizedConclusion.split(/\s+/).filter((w) => w.length > 4);
  const coveredWords = conclusionWords.filter((w) => normalizedReasoning.includes(w));
  const coverageRatio = conclusionWords.length > 0 ? coveredWords.length / conclusionWords.length : 0;

  if (coverageRatio < 0.3) {
    gaps.push("Reasoning does not address the expected conclusion — missing core reasoning");
    suggestions.push(`Ensure reasoning covers: ${expectedConclusion}`);
  } else if (coverageRatio < 0.6) {
    gaps.push("Reasoning partially addresses the conclusion — some key points missing");
    suggestions.push("Add reasoning steps that connect to the conclusion's key terms");
  }

  // Check 3: Is there logical structure? (step markers, transitions)
  const hasStructure = /\b(step\s*\d|first|second|third|therefore|thus|hence|because|since|given|if\s|when\s|so\s|consequently|as a result|in conclusion)\b/i.test(reasoning);
  if (!hasStructure && wordCount > 50) {
    gaps.push("Reasoning lacks logical structure — no step markers or transitions found");
    suggestions.push("Add numbered steps or transition words (first, therefore, thus, etc.)");
  }

  // Check 4: Are there unsupported claims? (assertions without evidence/reasoning)
  const assertionPatterns = [
    /\b(clearly|obviously|it is evident|undeniably|without doubt|surely|definitely)\b/gi,
    /\b(must be|has to be|can only be|is always|is never)\b/gi,
  ];
  const unsupportedClaims = [];
  for (const pattern of assertionPatterns) {
    let match;
    while ((match = pattern.exec(reasoning)) !== null) {
      const context = reasoning.substring(Math.max(0, match.index - 40), Math.min(reasoning.length, match.index + match[0].length + 40));
      unsupportedClaims.push(context.trim());
    }
  }
  if (unsupportedClaims.length > 0) {
    gaps.push(`Found ${unsupportedClaims.length} unsupported assertion(s) — claims made without reasoning`);
    suggestions.push("For each assertion, add the reasoning that supports it");
  }

  // Check 5: Does the conclusion actually follow from the reasoning?
  const reasoningSegments = reasoning.split(/\n\s*\n|\n\d+[\.\)]\s|\. (?=[A-Z])/).filter((s) => s.trim().length > 10);
  if (reasoningSegments.length >= 2) {
    const lastSegment = normalizeText(reasoningSegments[reasoningSegments.length - 1]);
    const conclusionPresent = conclusionWords.some((w) => lastSegment.includes(w));
    if (!conclusionPresent && coverageRatio > 0.3) {
      gaps.push("Conclusion is not stated at the end of the reasoning chain");
      suggestions.push("Add a clear conclusion statement that summarizes the reasoning");
    }
  }

  // Check 6: Circular reasoning detection
  if (reasoningSegments.length >= 3) {
    const segmentSets = reasoningSegments.map((s) => new Set(normalizeText(s).split(/\s+/).filter((w) => w.length > 4)));
    for (let i = 0; i < segmentSets.length - 1; i++) {
      for (let j = i + 1; j < segmentSets.length; j++) {
        const overlap = [...segmentSets[i]].filter((w) => segmentSets[j].has(w));
        const smaller = Math.min(segmentSets[i].size, segmentSets[j].size);
        if (smaller > 0 && overlap.length / smaller > 0.7) {
          gaps.push("Possible circular reasoning — two segments make the same point differently");
          suggestions.push("Ensure each reasoning step adds new information, not just rephrases");
          break;
        }
      }
      if (gaps.some((g) => g.includes("circular"))) break;
    }
  }

  return {
    valid: gaps.length === 0,
    gaps,
    suggestions,
  };
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerLLMScaffolderTools(server) {
  // ── scaffold_reasoning ────────────────────────────────────────────────
  server.tool(
    "scaffold_reasoning",
    "Generates a chain-of-thought reasoning scaffold tailored to task complexity and model capability. Strong models get minimal outlines, medium models get step-by-step with checkpoints, weak models get detailed CoT with examples.",
    {
      task: z.string().describe("Task description to scaffold reasoning for"),
      complexity: z
        .enum(["simple", "moderate", "complex"])
        .default("moderate")
        .describe("Task complexity level"),
      model_tier: z
        .enum(["strong", "medium", "weak"])
        .default("medium")
        .describe("Model capability tier — determines scaffolding depth"),
    },
    async ({ task, complexity, model_tier }) => {
      const rateLimitHit = rateLimiter.check("scaffold_reasoning");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const scaffold = REASONING_SCAFFOLDS[complexity]?.[model_tier];
        if (!scaffold) {
          return {
            content: [{ type: "text", text: `HALT — Unknown complexity/tier combination: ${complexity}/${model_tier}` }],
          };
        }

        const outline = scaffold.outline(task);
        const steps = scaffold.steps(task);
        const checkpoints = scaffold.checkpoints();

        const output = [
          `REASONING SCAFFOLD — ${complexity} task × ${model_tier} model`,
          `="`.repeat(30),
          "",
          outline,
          "",
          "─".repeat(40),
          "STEPS:",
          ...steps.map((s, i) => `  ${i + 1}. ${s}`),
          "",
          "CHECKPOINTS:",
          ...checkpoints.map((c, i) => `  ✓ ${c}`),
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
          scaffold: outline,
          steps,
          checkpoints,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in scaffold_reasoning: ${e.message}` }],
        };
      }
    }
  );

  // ── inject_few_shot ──────────────────────────────────────────────────
  server.tool(
    "inject_few_shot",
    "Scans the project for similar code patterns and generates few-shot examples to guide LLM output. Returns examples with pattern type, code snippet, and explanation.",
    {
      task: z.string().describe("Task description to find relevant examples for"),
      file_path: z
        .string()
        .optional()
        .describe("Specific file path to scan for examples (defaults to project-wide scan)"),
      max_examples: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(3)
        .describe("Maximum number of examples to return"),
    },
    async ({ task, file_path, max_examples }) => {
      const rateLimitHit = rateLimiter.check("inject_few_shot");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const examples = [];

        if (file_path) {
          // Scan specific file
          const absPath = file_path.startsWith("/") || file_path.match(/^[A-Z]:\\/i)
            ? file_path
            : join(PROJECT_ROOT, file_path);
          const content = readFile(absPath);
          if (!content) {
            return {
              content: [{ type: "text", text: `HALT — Could not read file: ${file_path}` }],
            };
          }
          const relPath = relative(PROJECT_ROOT, absPath);
          extractExamplesFromFile(absPath, examples, max_examples);
          // If no patterns matched, use the whole file as a single example
          if (examples.length === 0 && content.trim().length > 0) {
            examples.push({
              pattern: "file_content",
              code: content.length > 2000 ? content.substring(0, 2000) + "\n... (truncated)" : content,
              explanation: `Full content of ${relPath}`,
              file: relPath,
            });
          }
        } else {
          // Project-wide scan
          examples.push(...scanProjectForExamples(max_examples));
        }

        if (examples.length === 0) {
          return {
            content: [{ type: "text", text: "HALT — No relevant code examples found in the project." }],
          };
        }

        // Build the prompt addition
        const promptParts = examples.map(
          (ex, i) =>
            `EXAMPLE ${i + 1} [${ex.pattern}] (from ${ex.file}):\n` +
            `Purpose: ${ex.explanation}\n` +
            "```\n" +
            ex.code +
            "\n```"
        );

        const promptAddition =
          `FEW-SHOT EXAMPLES (use as reference for your output):\n\n` +
          promptParts.join("\n\n");

        const outputLines = [
          `FEW-SHOT EXAMPLES — ${examples.length} found`,
          "=".repeat(40),
          "",
        ];

        for (const [i, ex] of examples.entries()) {
          outputLines.push(
            `${i + 1}. [${ex.pattern}] ${ex.file}`,
            `   ${ex.explanation}`,
            `   Code (${ex.code.split("\n").length} lines):`,
            "   " + ex.code.split("\n").slice(0, 5).join("\n   ") + (ex.code.split("\n").length > 5 ? "\n   ..." : ""),
            ""
          );
        }

        outputLines.push("─".repeat(40), "PROMPT ADDITION (ready to use):", "", promptAddition);

        return {
          content: [{ type: "text", text: outputLines.join("\n") }],
          examples: examples.map(({ file, ...rest }) => rest),
          prompt_addition: promptAddition,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in inject_few_shot: ${e.message}` }],
        };
      }
    }
  );

  // ── simplify_for_model ──────────────────────────────────────────────
  server.tool(
    "simplify_for_model",
    "Takes complex instructions and simplifies them for weaker models: breaks into smaller steps, adds explicit examples, removes ambiguity.",
    {
      instructions: z.string().describe("Complex instructions to simplify"),
      target_model: z
        .enum(["strong", "medium", "weak"])
        .default("weak")
        .describe("Target model capability — weak gets most simplification"),
    },
    async ({ instructions, target_model }) => {
      const rateLimitHit = rateLimiter.check("simplify_for_model");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = simplifyInstructions(instructions, target_model);

        const output = [
          `SIMPLIFIED INSTRUCTIONS — target: ${target_model} model`,
          "=".repeat(40),
          "",
          `Original: ${result.original_length} chars → Simplified: ${result.simplified_length} chars`,
          "",
          "CHANGES MADE:",
          ...result.changes.map((c) => `  - ${c}`),
          "",
          "─".repeat(40),
          "SIMPLIFIED OUTPUT:",
          "",
          result.simplified,
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
          simplified: result.simplified,
          original_length: result.original_length,
          simplified_length: result.simplified_length,
          changes: result.changes,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in simplify_for_model: ${e.message}` }],
        };
      }
    }
  );

  // ── reasoning_checkpoint ─────────────────────────────────────────────
  server.tool(
    "reasoning_checkpoint",
    "Validates that a reasoning chain is complete and logical. Checks for gaps, missing steps, unsupported conclusions, and circular reasoning.",
    {
      reasoning: z.string().describe("The reasoning chain to validate"),
      expected_conclusion: z.string().describe("What the reasoning should conclude"),
    },
    async ({ reasoning, expected_conclusion }) => {
      const rateLimitHit = rateLimiter.check("reasoning_checkpoint");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = validateReasoningChain(reasoning, expected_conclusion);

        const output = [
          `REASONING CHECKPOINT — ${result.valid ? "PASS" : "FAIL"}`,
          "=".repeat(40),
          "",
          `Valid: ${result.valid ? "YES" : "NO"}`,
          "",
        ];

        if (result.gaps.length > 0) {
          output.push("GAPS FOUND:");
          result.gaps.forEach((g, i) => output.push(`  ${i + 1}. ${g}`));
          output.push("");
        }

        if (result.suggestions.length > 0) {
          output.push("SUGGESTIONS:");
          result.suggestions.forEach((s, i) => output.push(`  ${i + 1}. ${s}`));
          output.push("");
        }

        if (result.valid) {
          output.push("Reasoning chain is complete and logically sound.");
        } else {
          output.push(`HALT — Reasoning has ${result.gaps.length} gap(s). Fix before proceeding.`);
        }

        return {
          content: [{ type: "text", text: output.join("\n") }],
          valid: result.valid,
          gaps: result.gaps,
          suggestions: result.suggestions,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in reasoning_checkpoint: ${e.message}` }],
        };
      }
    }
  );
}
