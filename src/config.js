/**
 * Stack Perfeita MCP — Configuration
 * All constants, topic maps, rule descriptions, response-style rules, and bad-code patterns.
 */

import { existsSync } from "fs";
import { resolve, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

function readCliFlag(flag) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

function resolveAgainstProject(projectRoot, value) {
  if (!value) return null;
  return isAbsolute(value) ? resolve(value) : resolve(projectRoot, value);
}

const PROJECT_ROOT = resolveAgainstProject(process.cwd(), readCliFlag("--project-root")) || resolve(process.cwd());
const BUNDLED_RULES_DIR = resolve(ROOT_DIR, "ai-rules");
const PROJECT_RULES_DIR = resolve(PROJECT_ROOT, "ai-rules");
const EXPLICIT_RULES_DIR = resolveAgainstProject(PROJECT_ROOT, readCliFlag("--rules-dir"));
const RULES_DIR = EXPLICIT_RULES_DIR
  || (existsSync(PROJECT_RULES_DIR) ? PROJECT_RULES_DIR : BUNDLED_RULES_DIR);

const SRC_DIR = resolve(PROJECT_ROOT, "src");
const SKILLS_DIR = resolve(PROJECT_ROOT, ".claude/skills");
const COMMANDS_DIR = resolve(RULES_DIR, "commands");
const MEMORY_FILE = resolve(PROJECT_ROOT, ".claude", "session_memory.json");
const SESSION_STATE_FILE = resolve(PROJECT_ROOT, ".claude", "session-state.json");
const PROJECT_STATE_FILE = resolve(PROJECT_ROOT, ".claude", "project_state.json");
const TODO_STATE_FILE = resolve(PROJECT_ROOT, ".claude", "todo-state.json");

const STATE_LIMITS = {
  maxArrayItems: 50,
  maxCheckpoints: 20,
  maxCompactionHistory: 30,
  maxObservations: 100,
  autoCompactThresholdChars: 4000,
  autoCompactHardThresholdChars: 7000,
  autoCompactKeepRecentItems: 12,
  autoCompactKeepHardCapItems: 6,
  autoCompactMaxEntryChars: 220,
  autoCompactMaxScalarChars: 480,
};

const TOPIC_MAP = {
  "overview":     "00-project-overview.md",
  "project":      "00-project-overview.md",
  "workflow":     "01-ai-workflow-strict.md",
  "process":      "01-ai-workflow-strict.md",
  "flow":         "01-ai-workflow-strict.md",
  "coding":       "02-coding-standards.md",
  "standards":    "02-coding-standards.md",
  "naming":       "02-coding-standards.md",
  "tokens":       "03-token-economy.md",
  "economy":      "03-token-economy.md",
  "security":     "04-security-secrets.md",
  "secrets":      "04-security-secrets.md",
  "debugging":    "05-debugging-mastery.md",
  "debug":        "05-debugging-mastery.md",
  "ci":           "06-ci-cd-testing.md",
  "testing":      "06-ci-cd-testing.md",
  "tests":        "06-ci-cd-testing.md",
  "frontend":     "07-frontend-semantic.md",
  "semantic":     "07-frontend-semantic.md",
  "a11y":         "07-frontend-semantic.md",
  "backend":      "08-backend-architecture.md",
  "arch":         "08-backend-architecture.md",
  "bad":          "09-bad-patterns-halt.md",
  "patterns":     "09-bad-patterns-halt.md",
  "blacklist":    "09-bad-patterns-halt.md",
  "antipatterns": "09-bad-patterns-halt.md",
  "behavior":     "10-llm-behavioral-rules.md",
  "llm":          "10-llm-behavioral-rules.md",
  "global":       "10-llm-behavioral-rules.md",
  "excitation":   "10-llm-behavioral-rules.md",
  "filler":       "10-llm-behavioral-rules.md",
  "hesitation":   "10-llm-behavioral-rules.md",
  "systematic":   "11-systematic-debugging.md",
  "debug-method": "11-systematic-debugging.md",
  "modular-frontend": "14-modular-frontend.md",
  "css-modular":      "14-modular-frontend.md",
  "design-tokens":    "14-modular-frontend.md",
  "modular-backend":  "15-modular-backend.md",
  "services":         "15-modular-backend.md",
  "controllers":      "15-modular-backend.md",
  "debug-discipline": "16-debug-discipline.md",
  "debug-process":    "16-debug-discipline.md",
  "logging":          "16-debug-discipline.md",
  "anti-complexity":  "17-anti-complexity.md",
  "minimal":          "17-anti-complexity.md",
  "code-size":        "17-anti-complexity.md",
  "refactor":         "17-anti-complexity.md",
  "karpathy":         "18-karpathy-guidelines.md",
  "anti-slop":        "18-karpathy-guidelines.md",
  "simplicity":       "18-karpathy-guidelines.md",
  "surgical":         "18-karpathy-guidelines.md",
  "goal-driven":      "18-karpathy-guidelines.md",
  "fullstack":        "19-fullstack-architecture.md",
  "modular":          "19-fullstack-architecture.md",
  "architecture":     "19-fullstack-architecture.md",
  "separation":       "19-fullstack-architecture.md",
  "layers":           "19-fullstack-architecture.md",
};

const RULE_DESCRIPTIONS = {
  "00-project-overview.md":         "Project domain, stack, and non-functional requirements",
  "01-ai-workflow-strict.md":       "AI workflow rules — anti-hallucination, P.E.R., zero-loop",
  "02-coding-standards.md":         "Caveman style — naming, variables, loops, functions",
  "03-token-economy.md":            "Token compression — block filler, semantic compaction",
  "04-security-secrets.md":         "OWASP 2025/2026, secrets management, agentic risks",
  "05-debugging-mastery.md":        "Structured debugging — no blind logs, reproduce-reduce-prove",
  "06-ci-cd-testing.md":            "CI/CD as product — pipeline gates, SAST, coverage",
  "07-frontend-semantic.md":        "Semantic HTML, a11y, CSS modern, Core Web Vitals",
  "08-backend-architecture.md":     "Backend rules — validation at edge, ACID, stateless, N+1",
  "09-bad-patterns-halt.md":        "Bad code blacklist — halt on rotten foundation",
  "10-llm-behavioral-rules.md":     "Universal LLM rules — excitation blocking, global behavior",
  "11-systematic-debugging.md":     "4-phase systematic debugging — root cause, hypothesis, fix, verify",
  "14-modular-frontend.md":         "Modular CSS architecture — entry point, design tokens, isolated components",
  "15-modular-backend.md":          "Modular backend services — controllers, services, repositories, utils layers",
  "16-debug-discipline.md":         "Debug discipline — reproduce, isolate, understand, fix, validate",
  "17-anti-complexity.md":          "Anti-complexity — minimal files, small functions, zero dead code",
  "18-karpathy-guidelines.md":      "Karpathy anti-slop — think before coding, simplicity, surgical changes, goal-driven",
  "19-fullstack-architecture.md":   "Fullstack modular architecture — separation of concerns, layers, mandatory structure",
};

const BAD_PATTERNS = [
  { regex: /\bany\b/,                              id: "any",            msg: "TypeScript any — infer or define the real type", lang: "ts", severity: "blocker" },
  { regex: /catch\s*\([^)]*\)\s*\{\s*\}/,     id: "empty-catch",    msg: "Empty catch — handle, rethrow, or log with context", severity: "blocker" },
  { regex: /catch\s*\{\s*\}/,                    id: "empty-catch",    msg: "Empty catch — handle, rethrow, or log with context", severity: "blocker" },
  { regex: /console\.log\((?!\s*\{)/,            id: "console-log",    msg: "Blind console.log — prefer structured log or debugger", lang: "js", severity: "warning" },
  { regex: /function\s+\w+[^{]{200,}/,            id: "god-function",   msg: "Large function signature/body hint — split responsibilities", severity: "warning" },
  { regex: /if.*if.*if.*if/,                       id: "arrow-code",     msg: "Deep conditional nesting — use early returns or guard clauses", severity: "warning" },
  { regex: /innerHTML\s*=/,                        id: "innerhtml",      msg: "Unsafe innerHTML — use textContent, template sanitization, or DOM APIs", severity: "blocker" },
  { regex: /dangerouslySetInnerHTML\s*=/,          id: "dangerous-react-html", msg: "dangerouslySetInnerHTML detected — sanitize or avoid raw HTML injection", lang: "js", severity: "blocker" },
  { regex: /\bfetch\s*\([\s\S]{0,240}\)(?![\s\S]{0,80}(signal|timeout))/, id: "fetch-no-timeout", msg: "fetch without timeout/abort signal hint — prefer AbortController or explicit timeout policy", lang: "js", severity: "warning" },
  { regex: /\b(exec|execSync)\s*\(/,             id: "child-process-exec", msg: "child_process exec detected — validate input, prefer execFile/spawn, avoid shell interpolation", lang: "js", severity: "warning" },
  { regex: /\blocalStorage\.(setItem|getItem)\(\s*["'`](token|auth|jwt|session|refresh)/i, id: "sensitive-localstorage", msg: "Sensitive token stored in localStorage — prefer httpOnly cookies or safer storage boundary", lang: "js", severity: "warning" },
  { regex: /\bvar\s+/,                             id: "var",            msg: "var detected — prefer const/let", lang: "js", severity: "advisory" },
  { regex: /[^=!]==[^=]/,                          id: "weak-eq",        msg: "Weak comparison == — use === unless coercion is deliberate", lang: "js", severity: "warning" },
  { regex: /\/\/\s*(TODO|FIXME)/i,                 id: "todo-inline",    msg: "Inline TODO/FIXME — resolve now or track externally", severity: "advisory" },
  { regex: /\beval\s*\(/,                          id: "eval",           msg: "eval prohibited — injection and integrity risk", severity: "blocker" },
  { regex: /except\s*:\s*pass/,                    id: "empty-except",   msg: "Empty except — handle the exception or rethrow", lang: "py", severity: "blocker" },
  { regex: /except\s+Exception\s*:\s*pass/,        id: "broad-except",   msg: "Broad exception swallowed — catch specific error", lang: "py", severity: "blocker" },
  { regex: /\bprint\s*\(/,                         id: "print-debug",    msg: "print() debug left in code — prefer logging or debugger", lang: "py", severity: "advisory" },
  { regex: /#\s*(TODO|FIXME)/i,                    id: "todo-py",         msg: "Inline TODO/FIXME — resolve now or track externally", lang: "py", severity: "advisory" },
  // ─── Security: SQL Injection ────────────────────────────────────────────────
  { regex: /SELECT\s+.*\s+FROM/i,           id: "sql-select-from",       msg: "SQL SELECT FROM pattern — potential SQL injection", severity: "blocker" },
  { regex: /INSERT\s+INTO/i,                 id: "sql-insert-into",       msg: "SQL INSERT INTO pattern — potential SQL injection", severity: "blocker" },
  { regex: /DROP\s+TABLE/i,                 id: "sql-drop-table",        msg: "SQL DROP TABLE — destructive SQL operation detected", severity: "blocker" },
  { regex: /UNION\s+SELECT/i,               id: "sql-union-select",      msg: "SQL UNION SELECT — classic SQL injection vector", severity: "blocker" },
  // ─── Security: XSS ─────────────────────────────────────────────────────────
  { regex: /<script[\s>]/i,                 id: "xss-script-tag",        msg: "HTML <script> tag — potential XSS vector", severity: "blocker" },
  { regex: /javascript\s*:/i,               id: "xss-javascript-uri",    msg: "javascript: URI — potential XSS vector", severity: "blocker" },
  { regex: /onerror\s*=/i,                  id: "xss-onerror",           msg: "onerror attribute — potential XSS event handler", severity: "blocker" },
  { regex: /onload\s*=/i,                   id: "xss-onload",            msg: "onload attribute — potential XSS event handler", severity: "blocker" },
  // ─── Security: Command Injection ───────────────────────────────────────────
  { regex: /\bexec\s*\(/,                   id: "cmd-exec",              msg: "exec() detected — command injection risk", severity: "blocker" },
  { regex: /\bspawn\s*\(/,                  id: "cmd-spawn",             msg: "spawn() detected — validate input before spawning process", severity: "warning" },
  { regex: /\bsystem\s*\(/,                 id: "cmd-system",            msg: "system() detected — command injection risk", severity: "blocker" },
  // ─── Security: Path Traversal ──────────────────────────────────────────────
  { regex: /\.\.\//,                        id: "path-traversal-fwd",    msg: "Path traversal (../) detected", severity: "blocker" },
  { regex: /\.\.\\/,                        id: "path-traversal-back",   msg: "Path traversal (..\\) detected", severity: "blocker" },
  { regex: /\/etc\/passwd/i,                id: "path-etc-passwd",       msg: "Reference to /etc/passwd — sensitive system file access", severity: "blocker" },
  // ─── Security: Hardcoded Secrets ───────────────────────────────────────────
  { regex: /password\s*=\s*['"]/i,          id: "secret-password",       msg: "Hardcoded password detected", severity: "blocker" },
  { regex: /api[_-]?key\s*=\s*['"]/i,      id: "secret-api-key",        msg: "Hardcoded API key detected", severity: "blocker" },
  { regex: /secret\s*=\s*['"]/i,            id: "secret-generic",        msg: "Hardcoded secret detected", severity: "blocker" },
];

const RESPONSE_STYLE_PATTERNS = [
  { regex: /\b(humm+|hmm+|uh+|umm+)\b/i, id: "hesitation", msg: "Hesitation token detected", severity: "blocker" },
  { regex: /\b(let me think|let me see|i'?ll analyze|i will analyze|vou analisar|deixa eu pensar|deixa eu ver)\b/i, id: "process-commentary", msg: "Process commentary detected", severity: "blocker" },
  { regex: /\b(got it|understood|alright|okay then|sure|claro|certo|entendido|perfeito)\b/i, id: "warmup", msg: "Warm-up filler detected", severity: "warning" },
  { regex: /\b(of course|absolutely|happy to help|com certeza|sem problemas)\b/i, id: "courtesy", msg: "Courtesy filler detected", severity: "warning" },
  { regex: /\b(here(?:'s| is) the code|here(?:'s| is) the updated code|aqui está|segue abaixo)\b/i, id: "preamble", msg: "Preamble before answer detected", severity: "warning" },
  { regex: /\b(the next step is|agora vou|vou criar|vou fazer|o próximo passo é)\b/i, id: "narration", msg: "Narration about process detected", severity: "warning" },
];

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers",
  "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
  "worker_threads", "zlib",
  "node:assert", "node:buffer", "node:child_process", "node:crypto",
  "node:dns", "node:events", "node:fs", "node:http", "node:https",
  "node:net", "node:os", "node:path", "node:process", "node:stream",
  "node:test", "node:timers", "node:tls", "node:url", "node:util",
  "node:worker_threads", "node:zlib",
]);

export {
  ROOT_DIR,
  PROJECT_ROOT,
  BUNDLED_RULES_DIR,
  RULES_DIR,
  SRC_DIR,
  SKILLS_DIR,
  COMMANDS_DIR,
  MEMORY_FILE,
  SESSION_STATE_FILE,
  TODO_STATE_FILE,
  PROJECT_STATE_FILE,
  STATE_LIMITS,
  TOPIC_MAP,
  RULE_DESCRIPTIONS,
  BAD_PATTERNS,
  RESPONSE_STYLE_PATTERNS,
  NODE_BUILTINS,
};
