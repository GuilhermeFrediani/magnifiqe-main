/**
 * Stack Perfeita MCP — Chain-of-Thought Scaffolding (GAP-12)
 * Explicit reasoning scaffolding for complex tasks: creates structured
 * reasoning chains, validates them for completeness, synthesizes
 * conclusions from chain steps, and provides domain-specific templates.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── Domain Templates ─────────────────────────────────────────────────────

const DOMAIN_TEMPLATES = {
  code: {
    template: [
      {
        phase: "Problem Decomposition",
        steps: [
          "Identify the exact behavior required (input → output contract)",
          "List all edge cases and boundary conditions",
          "Map dependencies on existing code or APIs",
          "Define acceptance criteria before writing any code",
        ],
        tips: [
          "Write the function signature first — it IS the contract",
          "Consider the failure modes before the happy path",
          "Check if a similar function already exists in the codebase",
        ],
      },
      {
        phase: "Assumptions",
        steps: [
          "State all assumptions about input types and ranges",
          "Document expected side effects (mutations, I/O, network)",
          "Note any performance constraints (latency, memory, throughput)",
          "Clarify threading/concurrency expectations",
        ],
        tips: [
          "If you can't state the assumption clearly, you don't understand it",
          "Every assumption is a potential bug — mark it",
          "Write down what the code must NOT do, not just what it should",
        ],
      },
      {
        phase: "Analysis",
        steps: [
          "Choose the simplest algorithm that meets the contract",
          "Evaluate time/space complexity (Big-O)",
          "Compare at least two approaches and justify the choice",
          "Identify the minimal set of data structures needed",
        ],
        tips: [
          "Boring is beautiful — prefer standard library solutions",
          "If you need a complex abstraction, you may have the wrong approach",
          "Measure before optimizing; never guess at performance",
        ],
      },
      {
        phase: "Implementation Strategy",
        steps: [
          "Break into the smallest testable units",
          "Define the order of implementation (which part first?)",
          "Plan error handling strategy (throw vs return vs sentinel)",
          "Identify what NOT to implement in this pass",
        ],
        tips: [
          "Implement the deepest dependency first — build upward",
          "Keep each unit under 20 lines if possible",
          "Write the test for the hardest edge case before the code",
        ],
      },
      {
        phase: "Synthesis",
        steps: [
          "Review the implementation against the original contract",
          "Check for unintended coupling or hidden state",
          "Verify error paths are covered, not just happy path",
          "Confirm the code communicates intent without comments",
        ],
        tips: [
          "If a comment explains what the code does, the code is unclear",
          "Read your code as if you've never seen it before",
          "The best code review is a fresh pair of eyes — simulate one",
        ],
      },
      {
        phase: "Conclusion",
        steps: [
          "State the final implementation decision clearly",
          "List trade-offs accepted and why",
          "Identify follow-up work that should NOT be done now",
          "Confirm the contract is met with specific evidence",
        ],
        tips: [
          "Never ship without knowing what you traded away",
          "Document the 'why' not the 'what' — the code shows the what",
          "If the conclusion doesn't match the problem statement, restart",
        ],
      },
    ],
    examples: [
      "Implement a rate limiter middleware that handles concurrent requests with sliding window algorithm",
      "Refactor a monolithic authentication handler into separate concerns without changing behavior",
      "Add input validation to an API endpoint that currently trusts all client data",
    ],
  },

  architecture: {
    template: [
      {
        phase: "Problem Decomposition",
        steps: [
          "Define the system boundary — what is in scope and what is not",
          "Enumerate the actors, services, and data flows involved",
          "Identify the core architectural drivers (scalability, consistency, availability)",
          "Map current state vs desired state as concrete deltas",
        ],
        tips: [
          "Draw boxes and arrows before writing text — architecture is topology",
          "If you can't draw it simply, you don't understand it yet",
          "Separate the 'must have' from the 'nice to have' ruthlessly",
        ],
      },
      {
        phase: "Assumptions",
        steps: [
          "Document load expectations (requests/sec, data volume, growth rate)",
          "State availability and consistency requirements (CAP trade-offs)",
          "List existing system constraints that cannot change",
          "Identify team capabilities and operational maturity level",
        ],
        tips: [
          "Write down the budget — every architectural decision costs something",
          "If the team can't operate it, it doesn't matter how elegant it is",
          "Assume the requirements WILL change — design for that",
        ],
      },
      {
        phase: "Analysis",
        steps: [
          "Evaluate candidate patterns (event-driven, CQRS, microservices, monolith, etc.)",
          "Analyze failure modes for each candidate architecture",
          "Assess data consistency implications of each approach",
          "Compare operational complexity vs development complexity",
        ],
        tips: [
          "Start with the simplest architecture that MIGHT work",
          "Every microservice is an operational tax — justify each one",
          "The best architecture is the one the team can maintain at 3 AM",
        ],
      },
      {
        phase: "Design Decisions",
        steps: [
          "Select the primary communication pattern (sync vs async, REST vs gRPC vs events)",
          "Choose the data ownership model (database per service vs shared vs hybrid)",
          "Define the observability strategy (logging, tracing, metrics)",
          "Plan the migration path from current to target state",
        ],
        tips: [
          "Make reversible decisions quickly; invest time in irreversible ones",
          "If you can't migrate incrementally, the migration will fail",
          "Observability is not optional — it IS part of the architecture",
        ],
      },
      {
        phase: "Synthesis",
        steps: [
          "Verify the architecture addresses all identified architectural drivers",
          "Check for single points of failure and mitigations",
          "Validate that the design can handle the growth assumptions",
          "Confirm operational runbooks can be written for this architecture",
        ],
        tips: [
          "If you can't write a runbook, the architecture has invisible complexity",
          "Single points of failure are bugs, not features",
          "Validate with a spike or proof-of-concept before committing",
        ],
      },
      {
        phase: "Conclusion",
        steps: [
          "State the chosen architecture with clear rationale",
          "List the key trade-offs and accepted risks",
          "Define the migration milestones with concrete deliverables",
          "Identify the first thing to build and the last thing to build",
        ],
        tips: [
          "Architecture is a living document — plan the next review date",
          "The first implementation should validate the hardest assumption",
          "If the team disagrees, the architecture is wrong — consensus matters",
        ],
      },
    ],
    examples: [
      "Design a real-time event processing system that handles 10K events/sec with exactly-once semantics",
      "Plan a migration from a monolithic application to domain-driven microservices",
      "Architect a multi-tenant SaaS platform with strict data isolation requirements",
    ],
  },

  debug: {
    template: [
      {
        phase: "Problem Decomposition",
        steps: [
          "Define the exact symptoms (error messages, unexpected behavior, performance degradation)",
          "Determine when the problem first appeared (recent change, gradual drift, sudden failure)",
          "Scope the impact (all users, specific conditions, specific data)",
          "Establish the reproduction steps with exact inputs and expected vs actual outputs",
        ],
        tips: [
          "If you can't reproduce it, you can't debug it — find reproduction first",
          "Symptoms are not the problem — they're clues",
          "Write down the reproduction steps, don't keep them in your head",
        ],
      },
      {
        phase: "Assumptions",
        steps: [
          "List what you believe to be true about the system state",
          "Identify assumptions about recent changes that might be relevant",
          "State what you assume about the environment (OS, runtime, dependencies)",
          "Note any assumptions about the data (shape, volume, timing)",
        ],
        tips: [
          "Every debugging session starts with assumptions — and most start wrong",
          "If you assume the code is wrong, you'll miss the config bug",
          "Document assumptions so you can systematically eliminate them",
        ],
      },
      {
        phase: "Analysis",
        steps: [
          "Gather evidence: logs, stack traces, metrics, traces",
          "Apply binary search: bisect the problem space to narrow the scope",
          "Form 2-3 hypotheses ranked by likelihood",
          "For each hypothesis, list what evidence would confirm or deny it",
        ],
        tips: [
          "Read the error message carefully — the answer is usually in it",
          "Binary search is the fastest way to find any bug",
          "Never skip gathering evidence to jump to a fix",
        ],
      },
      {
        phase: "Investigation",
        steps: [
          "Test the highest-likelihood hypothesis first with targeted evidence gathering",
          "Use instrumentation (logging, tracing, breakpoints) to observe the failure",
          "Isolate the variable — change one thing at a time",
          "Document what you tried and what you found at each step",
        ],
        tips: [
          "Print statements are fast and powerful — don't underestimate them",
          "If you changed two things, you don't know which one mattered",
          "The investigation log is your most valuable debugging artifact",
        ],
      },
      {
        phase: "Synthesis",
        steps: [
          "Identify the root cause with evidence to support the conclusion",
          "Map the causal chain from root cause to observed symptoms",
          "Assess the blast radius — what else might be affected?",
          "Evaluate whether a quick fix or deep fix is appropriate right now",
        ],
        tips: [
          "Fix the root cause, not the symptom — unless the symptom is dangerous now",
          "If you can't explain the causal chain, you haven't found the root cause",
          "A temporary fix with a ticket is better than a permanent fix that breaks things",
        ],
      },
      {
        phase: "Conclusion",
        steps: [
          "Implement the fix with a test that would have caught this bug",
          "Verify the fix with the original reproduction steps",
          "Check for regressions in related functionality",
          "Add monitoring to detect this class of bug in the future",
        ],
        tips: [
          "A fix without a test is a bug waiting to happen again",
          "Regression tests should fail without the fix, pass with it",
          "If the same bug class can happen elsewhere, find and fix those too",
        ],
      },
    ],
    examples: [
      "Debug a race condition in an async data pipeline that causes intermittent data loss",
      "Investigate a memory leak in a long-running Node.js service that OOMs after 48 hours",
      "Track down why an API endpoint returns correct results for some users but 500s for others",
    ],
  },

  design: {
    template: [
      {
        phase: "Problem Decomposition",
        steps: [
          "Identify the user who will interact with this and their primary goal",
          "Map the current workflow (before the design change) step by step",
          "Define the desired workflow (after the design change) step by step",
          "List constraints: technical, business, accessibility, and regulatory",
        ],
        tips: [
          "Start with the user's problem, not the solution",
          "If you can't describe the user's goal in one sentence, the problem isn't clear",
          "Constraints are not obstacles — they're design parameters",
        ],
      },
      {
        phase: "Assumptions",
        steps: [
          "State assumptions about user technical literacy and context",
          "Document assumptions about usage environment (device, connectivity, time pressure)",
          "List assumptions about content volume and complexity",
          "Clarify assumptions about error states and recovery flows",
        ],
        tips: [
          "The user is not you — design for the least technical person who'll use this",
          "Assume the worst environment: slow connection, small screen, distracted user",
          "Error states are half the design — don't leave them for later",
        ],
      },
      {
        phase: "Analysis",
        steps: [
          "Evaluate information architecture — how should content be organized?",
          "Analyze interaction patterns: what flows feel natural vs forced?",
          "Compare reference implementations for similar problems",
          "Identify the core interaction that must be frictionless",
        ],
        tips: [
          "Look at how others solved similar problems — borrow patterns, not aesthetics",
          "The core interaction is the one users do 80% of the time — optimize for it",
          "If the user has to think about HOW to use it, the design failed",
        ],
      },
      {
        phase: "Design Decisions",
        steps: [
          "Define the primary user flow from entry to completion",
          "Design the information hierarchy (what's seen first, what's discoverable)",
          "Choose interaction patterns that match user mental models",
          "Plan the feedback system (confirmations, errors, loading states)",
        ],
        tips: [
          "Progressive disclosure: show what's needed, reveal the rest on demand",
          "Consistency beats cleverness — use patterns the user already knows",
          "Every state is a design opportunity: loading, error, empty, success",
        ],
      },
      {
        phase: "Synthesis",
        steps: [
          "Walk through the primary flow end-to-end as the user would",
          "Identify points of confusion, friction, or uncertainty",
          "Verify accessibility requirements are met (contrast, focus, screen readers)",
          "Check that the design degrades gracefully under edge conditions",
        ],
        tips: [
          "If you can't walk through the flow in under 30 seconds, simplify",
          "Accessibility is not a feature — it's a requirement",
          "Edge cases in the UI are where users lose trust",
        ],
      },
      {
        phase: "Conclusion",
        steps: [
          "State the design rationale — why these choices over alternatives",
          "List open questions that need user testing to resolve",
          "Define the smallest testable version of the design",
          "Identify the metrics that will validate success post-launch",
        ],
        tips: [
          "A design that can't be tested is a guess, not a design",
          "Metrics should measure user success, not system performance",
          "Ship the smallest version that proves the core hypothesis",
        ],
      },
    ],
    examples: [
      "Design a CLI tool output format that communicates complex status at a glance",
      "Redesign a dashboard that currently overwhelms users with too much data at once",
      "Design an error recovery flow for a file upload system with partial failure modes",
    ],
  },
};

// ─── Reasoning Chain Builder ──────────────────────────────────────────────

/**
 * Generate a structured reasoning chain for a given problem.
 * The chain structure adapts to domain and depth level.
 */
function buildReasoningChain(problem, domain, depth) {
  const domainTemplate = DOMAIN_TEMPLATES[domain];
  if (!domainTemplate) {
    return null;
  }

  const templatePhases = domainTemplate.template;

  // Depth controls how many elaboration steps per phase
  const depthMultiplier = { shallow: 1, medium: 2, deep: 3 }[depth] || 2;
  const tokenEstimatePerStep = { shallow: 50, medium: 100, deep: 200 }[depth] || 100;

  const chain = [];
  let stepNum = 1;

  for (const phase of templatePhases) {
    // Number of steps to include from this phase
    const stepsToInclude = Math.min(phase.steps.length, depthMultiplier);

    for (let i = 0; i < stepsToInclude; i++) {
      chain.push({
        step: stepNum,
        purpose: `${phase.phase}: ${phase.steps[i].split("—")[0].trim()}`,
        prompt: generatePromptForStep(phase.phase, phase.steps[i], problem, domain),
        expected_output: generateExpectedOutput(phase.phase, phase.steps[i], depth),
      });
      stepNum++;
    }
  }

  return chain;
}

/**
 * Generate a targeted prompt for a single reasoning step.
 */
function generatePromptForStep(phase, stepDescription, problem, domain) {
  const problemRef = `"${problem}"`;

  const promptMap = {
    "Problem Decomposition": `Break down the problem ${problemRef} into its core components. ${stepDescription}. What are the fundamental pieces that need to be addressed?`,
    "Assumptions": `For the problem ${problemRef}, ${stepDescription}. Be explicit about what you are taking for granted — unstated assumptions are hidden bugs.`,
    "Analysis": `Analyzing ${problemRef}: ${stepDescription}. Ground your analysis in concrete evidence, not intuition.`,
    "Design Decisions": `For ${problemRef}, ${stepDescription}. Each decision should be justified with a clear rationale and stated trade-offs.`,
    "Implementation Strategy": `For ${problemRef}, ${stepDescription}. Be specific about what goes where and why.`,
    "Investigation": `Investigating ${problemRef}: ${stepDescription}. Document every observation, even if it seems irrelevant.`,
    "Synthesis": `Synthesizing findings for ${problemRef}: ${stepDescription}. Connect the dots — how do the individual pieces form a coherent whole?`,
    "Conclusion": `Concluding analysis of ${problemRef}: ${stepDescription}. State your conclusion with supporting evidence and stated limitations.`,
  };

  return promptMap[phase] || `${stepDescription} — Applied to: ${problemRef}`;
}

/**
 * Generate expected output description for a step.
 */
function generateExpectedOutput(phase, stepDescription, depth) {
  const detailLevel = {
    shallow: "Brief summary",
    medium: "Structured analysis with supporting points",
    deep: "Detailed analysis with evidence, alternatives considered, and explicit reasoning",
  }[depth];

  return `${detailLevel}. Step focus: ${stepDescription}`;
}

// ─── Reasoning Chain Validator ────────────────────────────────────────────

/**
 * Validate a completed reasoning chain for logical soundness.
 */
function validateChain(chain, problem) {
  const gaps = [];
  let score = 100;

  if (!Array.isArray(chain) || chain.length === 0) {
    return { valid: false, gaps: [{ step: 0, issue: "Chain is empty or not an array", suggestion: "Provide a non-empty reasoning chain with at least one step" }], score: 0 };
  }

  // Check step numbering continuity
  for (let i = 0; i < chain.length; i++) {
    const expected = i + 1;
    if (chain[i].step !== expected) {
      gaps.push({
        step: expected,
        issue: `Step numbering gap: expected step ${expected} but found step ${chain[i].step}`,
        suggestion: `Renumber steps sequentially starting from 1`,
      });
      score -= 5;
    }
  }

  // Check for empty or minimal content
  for (const entry of chain) {
    if (!entry.content || entry.content.trim().length < 10) {
      gaps.push({
        step: entry.step,
        issue: `Step ${entry.step} has insufficient content (${(entry.content || "").length} chars)`,
        suggestion: `Expand the reasoning at step ${entry.step} with specific analysis, evidence, or rationale`,
      });
      score -= 10;
    }
  }

  // Check for problem relevance — does the chain reference the problem?
  const problemWords = problem
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const chainText = chain.map((c) => c.content || "").join(" ").toLowerCase();
  const relevantWordsFound = problemWords.filter((w) => chainText.includes(w));

  if (problemWords.length > 0 && relevantWordsFound.length / problemWords.length < 0.2) {
    gaps.push({
      step: 1,
      issue: "Chain content has low relevance to the original problem — may have drifted",
      suggestion: "Ensure each step explicitly connects back to the problem statement",
    });
    score -= 15;
  }

  // Check for unsupported conclusions — last step should reference earlier steps
  const lastStep = chain[chain.length - 1];
  if (lastStep && lastStep.content) {
    const earlierSteps = chain.slice(0, -1);
    const lastContent = lastStep.content.toLowerCase();
    const hasBackRef = earlierSteps.some((step) => {
      const words = (step.content || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      return words.some((w) => lastContent.includes(w));
    });
    if (!hasBackRef && earlierSteps.length > 1) {
      gaps.push({
        step: lastStep.step,
        issue: "Conclusion appears disconnected from earlier reasoning steps",
        suggestion: `Reference specific findings from earlier steps when stating the conclusion`,
      });
      score -= 10;
    }
  }

  // Check for circular reasoning — repeated content across steps
  const stepContents = chain.map((c) => (c.content || "").toLowerCase().trim());
  for (let i = 0; i < stepContents.length; i++) {
    for (let j = i + 1; j < stepContents.length; j++) {
      if (stepContents[i].length > 20 && stepContents[j].length > 20) {
        const similarity = computeSimilarity(stepContents[i], stepContents[j]);
        if (similarity > 0.8) {
          gaps.push({
            step: chain[j].step,
            issue: `Step ${chain[j].step} is nearly identical to step ${chain[i].step} — possible circular reasoning`,
            suggestion: `Advance the reasoning at step ${chain[j].step} instead of restating earlier analysis`,
          });
          score -= 15;
        }
      }
    }
  }

  // Check for logical flow — each step should build on prior
  for (let i = 1; i < chain.length; i++) {
    const prevWords = new Set(
      (chain[i - 1].content || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
    );
    const currWords = (chain[i].content || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const overlap = currWords.filter((w) => prevWords.has(w));
    if (prevWords.size > 0 && currWords.length > 0 && overlap.length / currWords.length < 0.05 && i > 1) {
      gaps.push({
        step: chain[i].step,
        issue: `Step ${chain[i].step} appears disconnected from the preceding step`,
        suggestion: `Ensure step ${chain[i].step} builds on the findings or conclusions from step ${chain[i - 1].step}`,
      });
      score -= 5;
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    valid: score >= 70,
    gaps,
    score,
  };
}

/**
 * Simple word-overlap similarity metric (0-1).
 */
function computeSimilarity(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ─── Conclusion Synthesizer ──────────────────────────────────────────────

/**
 * Synthesize a conclusion from completed reasoning chain steps.
 */
function synthesizeConclusion(chain, confidenceThreshold) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return {
      conclusion: "No reasoning chain provided — cannot synthesize a conclusion.",
      confidence: 0,
      key_findings: [],
      uncertainties: ["No input data to analyze"],
      recommendations: ["Provide a reasoning chain with at least one step"],
    };
  }

  const allText = chain.map((c) => c.content || "").join("\n");
  const wordFreq = computeWordFrequency(allText);

  // Extract key findings — sentences that appear analytical or conclusive
  const keyFindings = extractKeyFindings(chain);
  const uncertainties = extractUncertainties(allText);
  const recommendations = extractRecommendations(allText);

  // Compute confidence based on chain quality signals
  let confidence = computeConfidence(chain, allText, keyFindings, uncertainties);

  // Generate the synthesis conclusion
  const conclusion = generateConclusionText(chain, keyFindings, uncertainties, recommendations);

  // If confidence is below threshold, flag it
  const meetsThreshold = confidence >= confidenceThreshold;

  return {
    conclusion,
    confidence: Math.round(confidence * 100) / 100,
    key_findings: keyFindings,
    uncertainties: meetsThreshold ? uncertainties : [...uncertainties, `Confidence ${Math.round(confidence * 100)}% is below threshold ${Math.round(confidenceThreshold * 100)}% — more analysis recommended`],
    recommendations,
  };
}

/**
 * Compute word frequency across all chain content.
 */
function computeWordFrequency(text) {
  const freq = {};
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "about", "this",
    "that", "it", "its", "and", "or", "but", "not", "if", "then",
    "so", "than", "too", "very", "just", "also", "what", "which",
    "who", "whom", "how", "when", "where", "why", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such",
    "no", "only", "own", "same", "their", "them", "they", "these",
    "those", "through", "during", "before", "after", "above", "below",
    "between", "because", "while", "until", "again", "further", "once",
    "here", "there", "up", "down", "out", "off", "over", "under",
    "need", "should", "must",
  ]);

  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  for (const w of words) {
    if (!stopWords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return freq;
}

/**
 * Extract key findings from chain steps.
 */
function extractKeyFindings(chain) {
  const findings = [];

  for (const step of chain) {
    const content = step.content || "";
    // Look for declarative statements (sentences that state facts or conclusions)
    const sentences = content.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 15);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      // Heuristic: findings often start with or contain analytical language
      const isAnalytical = /\b(shows?|indicates?|suggests?|confirms?|reveals?|demonstrates?|results? in|leads? to|implies?|because|therefore|thus|hence|finding|conclusion|result|evidence)\b/.test(lower);
      const isDeclarative = /^(the |this |it |there |we |our |a |an )/.test(lower);

      if ((isAnalytical || isDeclarative) && sentence.length > 20 && sentence.length < 300) {
        findings.push(sentence.charAt(0).toUpperCase() + sentence.slice(1));
      }
    }
  }

  // Deduplicate and limit
  const unique = [...new Set(findings)];
  return unique.slice(0, 8);
}

/**
 * Extract statements expressing uncertainty.
 */
function extractUncertainties(text) {
  const uncertainties = [];
  const uncertaintyPatterns = [
    /\b(unclear|uncertain|unknown|uncertainty|may not|might not|not sure|unclear if|it depends|further investigation|need to verify|need to check|assumption|risk|could be|possibly|potentially|not enough|insufficient|incomplete|missing|inconclusive)\b/gi,
  ];

  const sentences = text.split(/[.!?]+/).map((s) => s.trim());

  for (const sentence of sentences) {
    for (const pattern of uncertaintyPatterns) {
      if (pattern.test(sentence) && sentence.length > 15 && sentence.length < 300) {
        uncertainties.push(sentence.charAt(0).toUpperCase() + sentence.slice(1));
        break;
      }
    }
  }

  return [...new Set(uncertainties)].slice(0, 6);
}

/**
 * Extract recommendations from chain content.
 */
function extractRecommendations(text) {
  const recommendations = [];
  const recPatterns = [
    /\b(recommend|should|ought to|consider|suggest|propose|action item|next step|follow.up|implement|refactor|improve|add|remove|change|update|fix|create|build|test|validate|verify|document|deploy)\b/gi,
  ];

  const sentences = text.split(/[.!?]+/).map((s) => s.trim());

  for (const sentence of sentences) {
    for (const pattern of recPatterns) {
      if (pattern.test(sentence) && sentence.length > 15 && sentence.length < 300) {
        recommendations.push(sentence.charAt(0).toUpperCase() + sentence.slice(1));
        break;
      }
    }
  }

  return [...new Set(recommendations)].slice(0, 6);
}

/**
 * Compute confidence score (0-1) based on chain quality signals.
 */
function computeConfidence(chain, allText, keyFindings, uncertainties) {
  let confidence = 0.5; // baseline

  // Positive signals
  const chainLength = chain.length;
  if (chainLength >= 6) confidence += 0.1;
  if (chainLength >= 10) confidence += 0.05;

  // Content density — more substantive content = higher confidence
  const avgLength = allText.length / chainLength;
  if (avgLength > 100) confidence += 0.05;
  if (avgLength > 200) confidence += 0.05;

  // Evidence-based reasoning — analytical language density
  const analyticalMatches = allText.match(/\b(because|therefore|however|evidence|data|shows?|indicates?|confirms?|measured|observed|tested|verified)\b/gi);
  const analyticalDensity = analyticalMatches ? analyticalMatches.length / allText.split(/\s+/).length : 0;
  if (analyticalDensity > 0.01) confidence += 0.05;
  if (analyticalDensity > 0.02) confidence += 0.05;

  // Negative signals
  if (uncertainties.length > 3) confidence -= 0.1;
  if (uncertainties.length > 5) confidence -= 0.05;

  // Chain coverage — does it span multiple phases?
  const phases = new Set();
  for (const step of chain) {
    const content = (step.content || "").toLowerCase();
    if (/decompos|break.?down|component/i.test(content)) phases.add("decomposition");
    if (/assum|taken for/i.test(content)) phases.add("assumptions");
    if (/analyz|examin|evaluat/i.test(content)) phases.add("analysis");
    if (/synth|connect|integrate/i.test(content)) phases.add("synthesis");
    if (/conclu|final|decision|summary/i.test(content)) phases.add("conclusion");
  }
  if (phases.size >= 4) confidence += 0.1;
  if (phases.size >= 3) confidence += 0.05;

  // Key findings count
  if (keyFindings.length >= 3) confidence += 0.05;
  if (keyFindings.length >= 5) confidence += 0.05;

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Generate a human-readable conclusion text from findings.
 */
function generateConclusionText(chain, keyFindings, uncertainties, recommendations) {
  const parts = [];

  parts.push(`Analysis completed across ${chain.length} reasoning steps.`);

  if (keyFindings.length > 0) {
    parts.push(`Key findings: ${keyFindings.slice(0, 3).join("; ")}.`);
  }

  if (uncertainties.length > 0) {
    parts.push(`Areas of uncertainty: ${uncertainties.slice(0, 2).join("; ")}.`);
  }

  if (recommendations.length > 0) {
    parts.push(`Recommended actions: ${recommendations.slice(0, 2).join("; ")}.`);
  }

  return parts.join(" ");
}

// ─── Tool Registration ────────────────────────────────────────────────────

export function registerChainOfThoughtTools(server) {
  // ── create_reasoning_chain ────────────────────────────────────────────
  server.tool(
    "create_reasoning_chain",
    "Creates a structured reasoning chain for a problem. Generates step-by-step reasoning with problem decomposition, assumptions, analysis steps, synthesis, and conclusion — tailored to the specified domain and depth.",
    {
      problem: z.string().describe("The problem or question to build a reasoning chain for"),
      domain: z
        .enum(["code", "architecture", "debug", "design"])
        .default("code")
        .describe("The domain context — determines the phases and prompts in the reasoning chain"),
      depth: z
        .enum(["shallow", "medium", "deep"])
        .default("medium")
        .describe("Reasoning depth — shallow (1 step/phase), medium (2), deep (3)"),
    },
    async ({ problem, domain, depth }) => {
      const rateLimitHit = rateLimiter.check("create_reasoning_chain");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const chain = buildReasoningChain(problem, domain, depth);
        if (!chain) {
          return {
            content: [{ type: "text", text: `HALT — Unknown domain: "${domain}". Supported: code, architecture, debug, design` }],
          };
        }

        const totalSteps = chain.length;
        const estimatedTokens = chain.reduce(
          (sum, step) => sum + step.prompt.length + step.expected_output.length,
          0
        );

        const outputLines = [
          `REASONING CHAIN — domain: ${domain} | depth: ${depth}`,
          "=".repeat(50),
          `Problem: ${problem}`,
          `Steps: ${totalSteps}`,
          `Estimated reasoning tokens: ~${estimatedTokens}`,
          "",
        ];

        for (const step of chain) {
          outputLines.push(`STEP ${step.step}: ${step.purpose}`);
          outputLines.push(`  Prompt: ${step.prompt}`);
          outputLines.push(`  Expected: ${step.expected_output}`);
          outputLines.push("");
        }

        outputLines.push("─".repeat(50));
        outputLines.push(`Use validate_reasoning_chain to check your completed chain.`);
        outputLines.push(`Use synthesize_conclusion to generate a conclusion from your chain.`);

        return {
          content: [{ type: "text", text: outputLines.join("\n") }],
          chain,
          total_steps: totalSteps,
          estimated_reasoning_tokens: estimatedTokens,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in create_reasoning_chain: ${e.message}` }],
        };
      }
    }
  );

  // ── validate_reasoning_chain ──────────────────────────────────────────
  server.tool(
    "validate_reasoning_chain",
    "Validates a completed reasoning chain for completeness and logical soundness. Checks for logical gaps, missing steps, unsupported conclusions, circular reasoning, and drift from the original problem.",
    {
      chain: z
        .array(
          z.object({
            step: z.number().int().min(1),
            content: z.string(),
          })
        )
        .min(1)
        .describe("The completed reasoning chain steps with their content"),
      problem: z.string().describe("The original problem the chain was reasoning about"),
    },
    async ({ chain, problem }) => {
      const rateLimitHit = rateLimiter.check("validate_reasoning_chain");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = validateChain(chain, problem);

        const outputLines = [
          `REASONING CHAIN VALIDATION — ${result.valid ? "PASS" : "FAIL"}`,
          "=".repeat(50),
          `Score: ${result.score}/100`,
          `Valid: ${result.valid ? "YES" : "NO"}`,
          `Steps evaluated: ${chain.length}`,
          "",
        ];

        if (result.gaps.length > 0) {
          outputLines.push(`GAPS FOUND: ${result.gaps.length}`);
          outputLines.push("");
          for (const gap of result.gaps) {
            outputLines.push(`  Step ${gap.step}: ${gap.issue}`);
            outputLines.push(`    Fix: ${gap.suggestion}`);
          }
          outputLines.push("");
        } else {
          outputLines.push("No logical gaps detected. Chain is structurally sound.");
          outputLines.push("");
        }

        outputLines.push("─".repeat(50));
        if (result.valid) {
          outputLines.push("Chain passes validation. Ready for conclusion synthesis.");
        } else {
          outputLines.push(`HALT — Chain has ${result.gaps.length} issue(s). Address gaps before synthesizing.`);
        }

        return {
          content: [{ type: "text", text: outputLines.join("\n") }],
          valid: result.valid,
          gaps: result.gaps,
          score: result.score,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in validate_reasoning_chain: ${e.message}` }],
        };
      }
    }
  );

  // ── synthesize_conclusion ─────────────────────────────────────────────
  server.tool(
    "synthesize_conclusion",
    "Synthesizes a conclusion from reasoning chain steps. Aggregates findings, identifies consensus points, flags uncertainties, and generates a confidence-scored conclusion with recommendations.",
    {
      chain: z
        .array(
          z.object({
            step: z.number().int().min(1),
            content: z.string(),
          })
        )
        .min(1)
        .describe("The completed reasoning chain steps with their content"),
      confidence_threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.7)
        .describe("Minimum confidence score to pass (0-1). Below this, uncertainties are flagged."),
    },
    async ({ chain, confidence_threshold }) => {
      const rateLimitHit = rateLimiter.check("synthesize_conclusion");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const result = synthesizeConclusion(chain, confidence_threshold);

        const outputLines = [
          "CONCLUSION SYNTHESIS",
          "=".repeat(50),
          `Confidence: ${Math.round(result.confidence * 100)}% (threshold: ${Math.round(confidence_threshold * 100)}%)`,
          "",
          "CONCLUSION:",
          result.conclusion,
          "",
        ];

        if (result.key_findings.length > 0) {
          outputLines.push("KEY FINDINGS:");
          for (const f of result.key_findings) {
            outputLines.push(`  • ${f}`);
          }
          outputLines.push("");
        }

        if (result.uncertainties.length > 0) {
          outputLines.push("UNCERTAINTIES:");
          for (const u of result.uncertainties) {
            outputLines.push(`  ⚠ ${u}`);
          }
          outputLines.push("");
        }

        if (result.recommendations.length > 0) {
          outputLines.push("RECOMMENDATIONS:");
          for (const r of result.recommendations) {
            outputLines.push(`  → ${r}`);
          }
          outputLines.push("");
        }

        outputLines.push("─".repeat(50));
        if (result.confidence >= confidence_threshold) {
          outputLines.push("Confidence meets threshold. Conclusion is ready to use.");
        } else {
          outputLines.push(`HALT — Confidence ${Math.round(result.confidence * 100)}% is below threshold ${Math.round(confidence_threshold * 100)}%. Consider expanding the chain or addressing flagged uncertainties.`);
        }

        return {
          content: [{ type: "text", text: outputLines.join("\n") }],
          conclusion: result.conclusion,
          confidence: result.confidence,
          key_findings: result.key_findings,
          uncertainties: result.uncertainties,
          recommendations: result.recommendations,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in synthesize_conclusion: ${e.message}` }],
        };
      }
    }
  );

  // ── get_domain_templates ──────────────────────────────────────────────
  server.tool(
    "get_domain_templates",
    "Returns reasoning templates for a specific domain (code, architecture, debug, design). Each template includes phases, steps, and tips for structured problem-solving in that domain.",
    {
      domain: z
        .string()
        .describe("Domain to get templates for: code, architecture, debug, or design"),
    },
    async ({ domain }) => {
      const rateLimitHit = rateLimiter.check("get_domain_templates");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      try {
        const domainData = DOMAIN_TEMPLATES[domain];
        if (!domainData) {
          const available = Object.keys(DOMAIN_TEMPLATES).join(", ");
          return {
            content: [{ type: "text", text: `HALT — Unknown domain: "${domain}". Available domains: ${available}` }],
          };
        }

        const outputLines = [
          `DOMAIN TEMPLATE: ${domain.toUpperCase()}`,
          "=".repeat(50),
          "",
        ];

        for (const phase of domainData.template) {
          outputLines.push(`PHASE: ${phase.phase}`);
          outputLines.push("  Steps:");
          for (const step of phase.steps) {
            outputLines.push(`    • ${step}`);
          }
          outputLines.push("  Tips:");
          for (const tip of phase.tips) {
            outputLines.push(`    → ${tip}`);
          }
          outputLines.push("");
        }

        outputLines.push("─".repeat(50));
        outputLines.push("EXAMPLE PROBLEMS:");
        for (const ex of domainData.examples) {
          outputLines.push(`  • ${ex}`);
        }
        outputLines.push("");
        outputLines.push(`Use create_reasoning_chain with domain="${domain}" to generate a chain for your specific problem.`);

        return {
          content: [{ type: "text", text: outputLines.join("\n") }],
          template: domainData.template,
          examples: domainData.examples,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `HALT — Error in get_domain_templates: ${e.message}` }],
        };
      }
    }
  );
}
