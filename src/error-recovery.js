/**
 * Stack Perfeita MCP — Error Recovery Patterns
 * Systematic retry and fallback patterns for error classification,
 * recovery planning, progress tracking, and pattern knowledge base.
 */

import { z } from "zod";
import { withRateLimit } from "./rate-limiter.js";

// ─── Error Patterns Database ──────────────────────────────────────────────

const ERROR_PATTERNS = {
  syntax: [
    {
      error_pattern: "Unexpected token",
      cause: "Invalid JavaScript/TypeScript syntax — missing bracket, semicolon, or comma",
      solution: "Locate the unexpected token on the reported line; check preceding line for missing delimiter",
      prevention: "Enable strict mode and use a linter (ESLint) with syntax rules",
    },
    {
      error_pattern: "Unterminated string literal",
      cause: "String opened but never closed — missing quote, template literal, or multiline string without backslash continuation",
      solution: "Count opening vs closing quotes on the line and surrounding lines; check template literal expressions for embedded quotes",
      prevention: "Use editor bracket-matching and auto-close-quote plugins",
    },
    {
      error_pattern: "Cannot use import statement outside a module",
      cause: "ES module import syntax used in a file loaded as CommonJS",
      solution: "Add \"type\": \"module\" to package.json, rename file to .mjs, or convert to require()",
      prevention: "Set \"type\": \"module\" in package.json for new projects and use .mjs for ESM-only files",
    },
    {
      error_pattern: "Identifier expected",
      cause: "Parser encountered a keyword, operator, or punctuation where a variable/function name was expected",
      solution: "Check for reserved word used as identifier, or a stray operator/punctuation",
      prevention: "Use descriptive variable names that avoid JS reserved words",
    },
  ],
  runtime: [
    {
      error_pattern: "Cannot read properties of undefined",
      cause: "Accessing a property or method on a variable that is undefined — usually a missing initialization, wrong destructuring, or async race",
      solution: "Add optional chaining (?.), nullish coalescing (??), or a guard check before access; trace the variable upstream to find where it should have been set",
      prevention: "Use TypeScript strict null checks; initialize all variables at declaration",
    },
    {
      error_pattern: "is not a function",
      cause: "Called something that is not callable — wrong import, misspelled name, or a value that was overwritten",
      solution: "Verify the import path and export name; log the value before the call to confirm its type",
      prevention: "Use named exports with explicit types; avoid reassigning module-level variables",
    },
    {
      error_pattern: "Maximum call stack size exceeded",
      cause: "Infinite recursion or deeply nested call chain without a base case",
      solution: "Add a recursion depth counter or convert to iterative approach; check for circular references",
      prevention: "Always define base cases for recursion; use iterative algorithms for unbounded input",
    },
    {
      error_pattern: "RangeError: Invalid array length",
      cause: "Array constructor received a negative, non-integer, or excessively large length value",
      solution: "Validate the length parameter before array creation; clamp to sane bounds",
      prevention: "Use Array.from() or .filter() to build arrays instead of pre-allocating with new Array(n)",
    },
  ],
  dependency: [
    {
      error_pattern: "Cannot find module",
      cause: "Node.js module resolution failed — package not installed, wrong path, or missing export",
      solution: "Run npm install / bun install; verify the import path is correct; check the package's exports map",
      prevention: "Lock dependencies with a lockfile; use import maps or path aliases consistently",
    },
    {
      error_pattern: "ERR_MODULE_NOT_FOUND",
      cause: "ES module resolution failed — file extension required but missing, or package lacks exports field",
      solution: "Add .js extension to local imports in ESM mode; verify the package has an \"exports\" field in package.json",
      prevention: "Always use full file extensions in ESM imports; use --experimental-specifier-resolution=node only as a bridge",
    },
    {
      error_pattern: "Peer dependency warning",
      cause: "A package requires a peer dependency that is missing or version-mismatched in the host project",
      solution: "Install the required peer dependency at the compatible version; check npm/bun peer dep output",
      prevention: "Audit peer dependencies before major upgrades; use npm ls or bun pm ls to verify the dependency tree",
    },
    {
      error_pattern: "Version range not satisfied",
      cause: "Installed package version does not satisfy the semver range required by another dependency",
      solution: "Update the conflicting package or adjust version ranges; run npm update / bun update",
      prevention: "Use precise versions for critical dependencies; audit regularly with npm audit or bun audit",
    },
  ],
  network: [
    {
      error_pattern: "ECONNREFUSED",
      cause: "TCP connection refused — target server is not listening on the expected host:port",
      solution: "Verify the server is running; check host/port configuration; ensure no firewall is blocking",
      prevention: "Use health-check endpoints and connection pooling with exponential backoff",
    },
    {
      error_pattern: "ETIMEDOUT",
      cause: "TCP connection timed out — network unreachable, DNS resolution slow, or server overloaded",
      solution: "Increase timeout settings; retry with backoff; check DNS resolution; try alternative endpoints",
      prevention: "Set reasonable timeouts at every layer; use circuit breakers for external calls",
    },
    {
      error_pattern: "fetch failed",
      cause: "HTTP request failed — DNS error, TLS issue, network timeout, or server returned error status",
      solution: "Check network connectivity; verify the URL and TLS certificate; read the response body for details",
      prevention: "Implement retry with exponential backoff; add response validation middleware",
    },
    {
      error_pattern: "EPIPE",
      cause: "Write to a closed pipe — the receiving process exited or closed its stdin before the write completed",
      solution: "Check if the downstream process is still alive; handle SIGPIPE gracefully; reduce write frequency",
      prevention: "Monitor child process status before writing; use stream error event handlers",
    },
  ],
  permission: [
    {
      error_pattern: "EACCES",
      cause: "Insufficient file system permissions — process lacks read/write/execute permission on the target path",
      solution: "Check file permissions with ls -la; adjust with chmod or chown; run with appropriate privileges",
      prevention: "Use principle of least privilege; store user data in user-writable directories",
    },
    {
      error_pattern: "EPERM",
      cause: "Operation not permitted — OS-level denial, often on Windows when path is locked or requires admin rights",
      solution: "Close any process using the file; run as administrator if appropriate; check antivirus interference",
      prevention: "Avoid writing to system directories; use temp directories for intermediate files",
    },
    {
      error_pattern: "EROFS",
      cause: "Read-only file system — attempting to write to a mounted read-only volume",
      solution: "Remount the file system as read-write, or write to a different location",
      prevention: "Detect read-only mounts early and redirect writes to writable paths",
    },
    {
      error_pattern: "Access denied",
      cause: "Application-level permission denial — API key missing, token expired, or role insufficient",
      solution: "Refresh or reissue authentication tokens; verify API key permissions; check role-based access",
      prevention: "Implement token refresh proactively; validate permissions at startup",
    },
  ],
  logic: [
    {
      error_pattern: "AssertionError",
      cause: "Code hit an assert() or invariant check that failed — the program state violates an assumption",
      solution: "Read the assertion message; trace inputs that violate the expected invariant; check upstream data flow",
      prevention: "Use defensive programming with clear error messages in assertions; add input validation at boundaries",
    },
    {
      error_pattern: "Stack overflow in validation",
      cause: "A recursive validation or transformation hits the stack limit — likely circular reference in data",
      solution: "Detect circular references with a visited set; convert recursive traversal to iterative with an explicit stack",
      prevention: "Use WeakRef or seen-sets for graph traversal; prefer iterative approaches for unbounded input",
    },
    {
      error_pattern: "Unexpected state transition",
      cause: "Finite state machine received an event in a state where it is not handled — invalid lifecycle sequence",
      solution: "Check the event that triggered the transition; add handling for the current state or prevent the event",
      prevention: "Document state machine transitions explicitly; use a state machine library (e.g. xstate) for complex flows",
    },
    {
      error_pattern: "NaN propagation",
      cause: "A numeric operation produced NaN which silently spread through downstream calculations",
      solution: "Add isFinite() / Number.isNaN() checks at computation boundaries; trace the NaN source",
      prevention: "Use BigInt for exact integer arithmetic; add boundary checks on division and parsing",
    },
  ],
  resource: [
    {
      error_pattern: "ENOMEM",
      cause: "Out of memory — process exceeded the available heap or system RAM",
      solution: "Profile memory usage; increase Node.js --max-old-space-size; reduce batch sizes; stream large data",
      prevention: "Use streaming for large data; set memory limits; monitor with process.memoryUsage()",
    },
    {
      error_pattern: "ENFILE",
      cause: "System-wide file descriptor limit reached — too many open files across all processes",
      solution: "Close unused file handles and sockets; increase ulimit -n; check for file descriptor leaks",
      prevention: "Use try/finally or using() to guarantee file handle cleanup; monitor fd count",
    },
    {
      error_pattern: "EBUSY",
      cause: "Resource is busy — file is locked by another process or still being written",
      solution: "Wait and retry with backoff; close the other process holding the lock; use advisory locking",
      prevention: "Use atomic write patterns (write to temp then rename); implement file locking for shared resources",
    },
    {
      error_pattern: "ENOSPC",
      cause: "No space left on device — disk or volume is full",
      solution: "Free disk space by removing old logs, temp files, or caches; check disk usage with df",
      prevention: "Set up log rotation; monitor disk usage; enforce storage quotas",
    },
  ],
};

// ─── Recovery Strategies ──────────────────────────────────────────────────

const RECOVERY_STRATEGIES = {
  syntax: {
    primary: "Fix the syntax error at the reported location",
    fallback: "Revert the last change that introduced the error, then re-apply incrementally",
    retry_viable: false,
    estimated_time: "2-10 minutes",
    steps: [
      "Read the error message and note the file, line, and column",
      "Navigate to the reported location and fix the syntax",
      "Re-run the build or lint to verify the fix",
      "Check for cascading errors that may appear after fixing the first one",
    ],
  },
  runtime: {
    primary: "Trace the error origin and add defensive guards",
    fallback: "Wrap the failing code in a try/catch and add graceful degradation",
    retry_viable: true,
    estimated_time: "5-30 minutes",
    steps: [
      "Read the full stack trace to identify the origin file and function",
      "Add null/undefined checks or optional chaining at the crash point",
      "Re-run to verify the immediate fix",
      "Trace upstream to find why the value was undefined in the first place",
      "Fix the root cause and remove the defensive guard if no longer needed",
    ],
  },
  dependency: {
    primary: "Reinstall or update the problematic dependency",
    fallback: "Find an alternative package that provides the same functionality",
    retry_viable: true,
    estimated_time: "5-20 minutes",
    steps: [
      "Identify the missing or broken dependency from the error",
      "Check if it is listed in package.json and installed in node_modules",
      "Run the appropriate install command (npm install / bun install)",
      "If version conflict, adjust version ranges or use overrides",
      "Re-run the operation that failed",
    ],
  },
  network: {
    primary: "Retry with exponential backoff",
    fallback: "Switch to alternative endpoint or cache fallback",
    retry_viable: true,
    estimated_time: "1-10 minutes",
    steps: [
      "Verify network connectivity and DNS resolution",
      "Retry the request with increasing delay (1s, 2s, 4s)",
      "If retries fail, check if an alternative endpoint is available",
      "If the service is down, use cached data or a fallback response",
      "Log the failure for monitoring and alerting",
    ],
  },
  permission: {
    primary: "Escalate permissions or fix access paths",
    fallback: "Relocate the operation to a permitted path",
    retry_viable: false,
    estimated_time: "2-15 minutes",
    steps: [
      "Identify the target path and required permission from the error",
      "Check current permissions with stat / ls -la",
      "Adjust permissions or ownership as needed",
      "If not possible, relocate the file or operation to a permitted directory",
      "Re-run the operation",
    ],
  },
  logic: {
    primary: "Debug the logic error with assertions and test cases",
    fallback: "Isolate the failing logic and implement a workaround",
    retry_viable: true,
    estimated_time: "10-60 minutes",
    steps: [
      "Reproduce the error with a minimal test case",
      "Add logging or assertions to trace the state at the failure point",
      "Identify the incorrect assumption or missing edge case",
      "Fix the root cause logic",
      "Add a regression test to prevent recurrence",
    ],
  },
  resource: {
    primary: "Free the constrained resource and retry",
    fallback: "Increase resource limits or redesign to use fewer resources",
    retry_viable: true,
    estimated_time: "5-30 minutes",
    steps: [
      "Identify which resource is exhausted from the error",
      "Close unused handles, files, or connections",
      "Free memory by clearing caches or reducing batch sizes",
      "If the resource is genuinely needed, increase the limit",
      "Re-run the operation",
    ],
  },
};

// ─── Recovery Plan Store ──────────────────────────────────────────────────

const recoveryPlans = new Map();
let planCounter = 0;

// ─── Classification Engine ────────────────────────────────────────────────

const SYNTAX_SIGNALS = [
  "unexpected token",
  "unexpected end of input",
  "unterminated string",
  "cannot use import",
  "identifier expected",
  "expected",
  "missing",
  "invalid syntax",
  "referenceerror",
];

const RUNTIME_SIGNALS = [
  "cannot read propert",
  "is not a function",
  "is not defined",
  "is not a constructor",
  "maximum call stack",
  "rangeerror",
  "typeerror",
  "null reference",
  "undefined is not",
];

const DEPENDENCY_SIGNALS = [
  "cannot find module",
  "err_module_not_found",
  "peer dependency",
  "version range not satisfied",
  "missing peer",
  "no such file or directory",
  "module not found",
  "err_require",
];

const NETWORK_SIGNALS = [
  "econnrefused",
  "etimedout",
  "fetch failed",
  "epipe",
  "socket hang up",
  "econnreset",
  "enotfound",
  "network",
  "certificate",
  "tls",
  "http/",
];

const PERMISSION_SIGNALS = [
  "eacces",
  "eperm",
  "erofs",
  "access denied",
  "permission denied",
  "operation not permitted",
  "unauthorized",
  "forbidden",
];

const LOGIC_SIGNALS = [
  "assertionerror",
  "assertion",
  "assert",
  "invariant",
  "state machine",
  "invalid state",
  "nan",
  "overflow",
  "underflow",
  "deadlock",
  "livelock",
];

const RESOURCE_SIGNALS = [
  "enomem",
  "enfile",
  "emfile",
  "ebusy",
  "enospc",
  "out of memory",
  "heap",
  "allocation failed",
  "too many open files",
  "no space left",
];

/**
 * Score a string against signal keywords.
 * Returns the count of signals found (case-insensitive).
 */
function scoreSignals(text, signals) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const signal of signals) {
    if (lower.includes(signal)) score += 1;
  }
  return score;
}

/**
 * Classify an error message into a structured verdict.
 * Returns { category, severity, confidence }.
 */
function classifyError(error_message, stack_trace = "", context = "") {
  const combined = `${error_message} ${stack_trace} ${context}`;

  const scores = {
    syntax: scoreSignals(combined, SYNTAX_SIGNALS),
    runtime: scoreSignals(combined, RUNTIME_SIGNALS),
    dependency: scoreSignals(combined, DEPENDENCY_SIGNALS),
    network: scoreSignals(combined, NETWORK_SIGNALS),
    permission: scoreSignals(combined, PERMISSION_SIGNALS),
    logic: scoreSignals(combined, LOGIC_SIGNALS),
    resource: scoreSignals(combined, RESOURCE_SIGNALS),
  };

  // Find the category with the highest score
  let bestCategory = "runtime"; // default
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Severity assessment
  const severity = assessSeverity(bestCategory, combined);

  return {
    category: bestCategory,
    severity,
    confidence: bestScore > 0 ? Math.min(bestScore / 3, 1.0) : 0.3,
  };
}

/**
 * Assess severity based on category and error content.
 */
function assessSeverity(category, text) {
  const lower = text.toLowerCase();

  // Critical indicators
  if (
    lower.includes("heap") ||
    lower.includes("enomem") ||
    lower.includes("segfault") ||
    lower.includes("fatal") ||
    lower.includes("corrupt")
  ) {
    return "critical";
  }

  // High severity
  if (
    category === "permission" ||
    category === "resource" ||
    lower.includes("eacces") ||
    lower.includes("eperm") ||
    lower.includes("enospc") ||
    lower.includes("cannot find module")
  ) {
    return "high";
  }

  // Low severity
  if (
    category === "syntax" ||
    (category === "runtime" && lower.includes("deprecation"))
  ) {
    return "low";
  }

  return "medium";
}

// ─── Recovery Plan Generation ─────────────────────────────────────────────

function generateRecoveryPlan(error_category, failed_action, _project_context = "") {
  const strategy = RECOVERY_STRATEGIES[error_category] || RECOVERY_STRATEGIES.runtime;

  const steps = strategy.steps.map((action, i) => {
    const step = {
      step: i + 1,
      action,
      expected_outcome: "",
      rollback: "",
    };

    switch (i) {
      case 0:
        step.expected_outcome = "Identify the exact location and cause of the error";
        step.rollback = "N/A — read-only diagnostic step";
        break;
      case 1:
        step.expected_outcome = "Apply the primary fix or gather more information";
        step.rollback = "Revert the change with git checkout or undo";
        break;
      case 2:
        step.expected_outcome = "Verify the fix resolves the immediate error";
        step.rollback = "Revert if the fix introduced new issues";
        break;
      case 3:
        step.expected_outcome = "Confirm no cascading issues remain";
        step.rollback = "Revert to the previous working state";
        break;
      case 4:
        step.expected_outcome = "Prevent recurrence with tests or documentation";
        step.rollback = "Remove the preventive measure if it causes issues";
        break;
      default:
        step.expected_outcome = "Continue recovery process";
        step.rollback = "Revert to previous step";
    }

    return step;
  });

  return {
    plan: steps,
    estimated_time: strategy.estimated_time,
    primary_strategy: strategy.primary,
    fallback_strategy: strategy.fallback,
    retry_viable: strategy.retry_viable,
    failed_action,
  };
}

// ─── Tool Registration ────────────────────────────────────────────────────

/**
 * Register error recovery tools on the MCP server.
 * Tools: classify_error, create_recovery_plan, execute_recovery, get_recovery_patterns
 */
export function registerErrorRecoveryTools(server) {
  // ── classify_error ──────────────────────────────────────────────────────
  server.tool(
    "classify_error",
    "Classifies an error and suggests a recovery strategy. Analyzes error message, stack trace, and context to categorize into syntax, runtime, dependency, network, permission, logic, or resource errors. Returns severity, recovery strategy, and actionable next steps.",
    {
      error_message: z
        .string()
        .describe("The error message or error text to classify"),
      stack_trace: z
        .string()
        .optional()
        .describe("Optional stack trace for deeper analysis"),
      context: z
        .string()
        .optional()
        .describe("Optional context about what operation was being performed"),
    },
    withRateLimit("classify_error", async ({ error_message, stack_trace, context }) => {
      const classification = classifyError(error_message, stack_trace || "", context || "");
      const strategy = RECOVERY_STRATEGIES[classification.category] || RECOVERY_STRATEGIES.runtime;

      const suggestedActions = [
        strategy.primary,
        strategy.fallback,
        ...strategy.steps.slice(0, 2),
      ];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                category: classification.category,
                severity: classification.severity,
                confidence: classification.confidence,
                recovery_strategy: strategy.primary,
                suggested_actions: suggestedActions,
                retry_viable: strategy.retry_viable,
                estimated_time: strategy.estimated_time,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  // ── create_recovery_plan ────────────────────────────────────────────────
  server.tool(
    "create_recovery_plan",
    "Creates a step-by-step recovery plan for an error. Generates a structured plan with numbered steps, expected outcomes, rollback points, and time estimates. Use after classify_error to get an actionable recovery roadmap.",
    {
      error_category: z
        .string()
        .describe(
          "Error category from classify_error: syntax, runtime, dependency, network, permission, logic, or resource"
        ),
      failed_action: z
        .string()
        .describe("Description of the action that failed"),
      project_context: z
        .string()
        .optional()
        .describe("Optional context about the project or environment"),
    },
    withRateLimit("create_recovery_plan", async ({ error_category, failed_action, project_context }) => {
      const validCategories = [
        "syntax",
        "runtime",
        "dependency",
        "network",
        "permission",
        "logic",
        "resource",
      ];
      const category = validCategories.includes(error_category)
        ? error_category
        : "runtime";

      const recoveryPlan = generateRecoveryPlan(category, failed_action, project_context || "");
      const planId = `plan-${++planCounter}-${Date.now()}`;

      // Store the plan
      recoveryPlans.set(planId, {
        ...recoveryPlan,
        category,
        created_at: new Date().toISOString(),
        current_step: 0,
        status: "active",
        attempts: [],
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                plan_id: planId,
                plan: recoveryPlan.plan,
                estimated_time: recoveryPlan.estimated_time,
                primary_strategy: recoveryPlan.primary_strategy,
                fallback_strategy: recoveryPlan.fallback_strategy,
                retry_viable: recoveryPlan.retry_viable,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  // ── execute_recovery ────────────────────────────────────────────────────
  server.tool(
    "execute_recovery",
    "Tracks recovery attempt progress for an active recovery plan. Records step outcomes (success/failure/partial), suggests next steps or alternatives, and can recommend abandoning the plan when attempts are exhausted.",
    {
      plan_id: z
        .string()
        .describe("The plan_id returned by create_recovery_plan"),
      current_step: z
        .number()
        .describe("The step number currently being executed (1-indexed)"),
      outcome: z
        .enum(["success", "failure", "partial"])
        .describe("Outcome of the current step"),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about what happened during this step"),
    },
    withRateLimit("execute_recovery", async ({ plan_id, current_step, outcome, notes }) => {
      const plan = recoveryPlans.get(plan_id);
      if (!plan) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Plan not found: ${plan_id}. Create a new plan with create_recovery_plan.`,
                  status: "plan_not_found",
                  give_up: false,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Record the attempt
      plan.attempts.push({
        step: current_step,
        outcome,
        notes: notes || "",
        timestamp: new Date().toISOString(),
      });

      const strategy = RECOVERY_STRATEGIES[plan.category] || RECOVERY_STRATEGIES.runtime;
      const totalSteps = strategy.steps.length;

      // Count failures for this step
      const stepFailures = plan.attempts.filter(
        (a) => a.step === current_step && a.outcome === "failure"
      ).length;
      const totalFailures = plan.attempts.filter(
        (a) => a.outcome === "failure"
      ).length;

      let status = "";
      let nextStep = undefined;
      let alternative = undefined;
      let giveUp = false;

      switch (outcome) {
        case "success":
          if (current_step >= totalSteps) {
            status = "recovery_complete";
            plan.status = "completed";
          } else {
            status = "step_complete";
            nextStep = `Proceed to step ${current_step + 1}: ${strategy.steps[current_step]}`;
            plan.current_step = current_step + 1;
          }
          break;

        case "failure":
          if (stepFailures >= 3) {
            // Too many failures on the same step — suggest fallback
            status = "step_failed_exhausted";
            alternative = `Step ${current_step} has failed ${stepFailures} times. Consider the fallback: ${strategy.fallback}`;
            giveUp = totalFailures >= 5;
          } else {
            status = "step_failed_retry";
            alternative = `Retry step ${current_step} or try: ${strategy.fallback}`;
            if (!strategy.retry_viable) {
              alternative += " Note: this error type is not typically retryable — consider the fallback approach.";
            }
          }
          break;

        case "partial":
          if (current_step >= totalSteps) {
            status = "recovery_partial";
            plan.status = "partial";
          } else {
            status = "step_partial";
            nextStep = `Proceed to step ${current_step + 1} with the partial fix applied`;
            alternative = "Or retry the current step for a complete fix";
            plan.current_step = current_step + 1;
          }
          break;
      }

      if (totalFailures >= 5) {
        giveUp = true;
        status = "recommended_abandon";
        alternative =
          "5+ failures recorded across steps. Consider a fundamentally different approach or seek external help.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status,
                plan_status: plan.status,
                next_step: nextStep,
                alternative,
                give_up: giveUp,
                attempts_on_step: stepFailures,
                total_attempts: plan.attempts.length,
                total_failures: totalFailures,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  // ── get_recovery_patterns ───────────────────────────────────────────────
  server.tool(
    "get_recovery_patterns",
    "Returns common error patterns and their solutions from the knowledge base. Filter by category to see patterns for syntax, runtime, dependency, network, permission, logic, or resource errors. Each pattern includes the error signature, root cause, solution, and prevention strategy.",
    {
      category: z
        .string()
        .optional()
        .describe(
          "Optional category filter: syntax, runtime, dependency, network, permission, logic, or resource"
        ),
    },
    withRateLimit("get_recovery_patterns", async ({ category }) => {
      const validCategories = [
        "syntax",
        "runtime",
        "dependency",
        "network",
        "permission",
        "logic",
        "resource",
      ];

      let patterns;
      if (category && validCategories.includes(category)) {
        patterns = (ERROR_PATTERNS[category] || []).map((p) => ({
          ...p,
          category,
        }));
      } else {
        // Return all patterns, flattened
        patterns = [];
        for (const [cat, catPatterns] of Object.entries(ERROR_PATTERNS)) {
          for (const p of catPatterns) {
            patterns.push({ ...p, category: cat });
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                category: category || "all",
                count: patterns.length,
                patterns,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );
}
