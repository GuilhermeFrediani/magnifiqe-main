/**
 * Stack Perfeita MCP — Error Handling Patterns
 * Provides typed error templates, Result patterns, and error handling
 * best practices for TypeScript, Python, and Go.
 */

import { z } from "zod";

// Error pattern templates by language
const PATTERNS = {
  typescript: {
    name: "TypeScript / JavaScript",
    patterns: [
      {
        name: "Typed Error Classes",
        description: "Define error hierarchy with code and statusCode",
        template: `class AppError extends Error {
  constructor(message, code, statusCode = 500, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super(\`\${resource} not found: \${id}\`, 'NOT_FOUND', 404);
  }
}`,
        when: "API endpoints, backend services"
      },
      {
        name: "Result Pattern (no-throw)",
        description: "Return ok/err instead of throwing",
        template: `type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok(value) { return { ok: true, value }; }
function err(error) { return { ok: false, error }; }

// Usage
async function fetchUser(id) {
  try {
    const user = await db.users.findUnique({ where: { id } });
    if (!user) return err(new NotFoundError('User', id));
    return ok(user);
  } catch (e) {
    return err(new AppError('Database error', 'DB_ERROR'));
  }
}`,
        when: "Operations where failure is expected (parsing, external calls)"
      },
      {
        name: "API Error Handler",
        description: "Centralized error handling for Express/Next.js",
        template: `function handleApiError(error) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }
  console.error('Unexpected error:', error);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 }
  );
}`,
        when: "API route error handling"
      }
    ]
  },
  python: {
    name: "Python",
    patterns: [
      {
        name: "Custom Exception Hierarchy",
        description: "Base exception with code and status",
        template: `class AppError(Exception):
    def __init__(self, message, code, status_code=500):
        super().__init__(message)
        self.code = code
        self.status_code = status_code

class NotFoundError(AppError):
    def __init__(self, resource, id):
        super().__init__(f"{resource} not found: {id}", "NOT_FOUND", 404)`,
        when: "FastAPI, Flask, Django backends"
      },
      {
        name: "FastAPI Exception Handler",
        description: "Global exception handler for FastAPI",
        template: `@app.exception_handler(AppError)
async def app_error_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": str(exc)}},
    )`,
        when: "FastAPI applications"
      }
    ]
  },
  go: {
    name: "Go",
    patterns: [
      {
        name: "Sentinel Errors",
        description: "Package-level error variables",
        template: `var (
    ErrNotFound    = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrConflict    = errors.New("conflict")
)`,
        when: "All Go services"
      },
      {
        name: "Error Wrapping",
        description: "Wrap errors with context using %w",
        template: `func FindByID(ctx context.Context, id string) (*User, error) {
    user, err := db.QueryRow(ctx, "SELECT * FROM users WHERE id = $1", id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, fmt.Errorf("user %s: %w", id, ErrNotFound)
    }
    if err != nil {
        return nil, fmt.Errorf("querying user %s: %w", id, err)
    }
    return user, nil
}`,
        when: "Repository/data access layer"
      }
    ]
  }
};

// Common mistakes
const ANTI_PATTERNS = [
  { pattern: "Empty catch block", bad: "catch (e) { }", fix: "At minimum, log the error: catch (e) { logger.error(e); }" },
  { pattern: "Swallowing errors", bad: "try { ... } catch { return null; }", fix: "Either re-throw, return Result type, or log before returning" },
  { pattern: "String error messages", bad: "throw \"Something went wrong\"", fix: "Use typed Error classes with codes" },
  { pattern: "Missing error context", bad: "catch (e) { throw new Error(\"Failed\") }", fix: "Include original error: throw new Error(\"Failed\", { cause: e })" },
  { pattern: "Generic error response", bad: "return { error: \"error\" }", fix: "Return structured error with code, message, and details" }
];

export function registerErrorHandlingPatternsTools(server) {
  server.tool(
    "error_patterns",
    "Returns error handling patterns and templates for a specified language. Includes typed error classes, Result pattern, API error handlers, and common anti-patterns to avoid.",
    {
      language: z.enum(["typescript", "python", "go"]).describe("Target language"),
      pattern: z.string().optional().describe("Specific pattern name (e.g., 'Result Pattern'). Omit for all patterns.")
    },
    async ({ language, pattern }) => {
      const langPatterns = PATTERNS[language];
      if (!langPatterns) return { content: [{ type: "text", text: `Unknown language: ${language}. Supported: typescript, python, go` }] };

      const patterns = pattern
        ? langPatterns.patterns.filter(p => p.name.toLowerCase().includes(pattern.toLowerCase()))
        : langPatterns.patterns;

      if (patterns.length === 0) return { content: [{ type: "text", text: `No pattern found matching "${pattern}" in ${langPatterns.name}` }] };

      const report = [
        `ERROR HANDLING PATTERNS — ${langPatterns.name}`,
        "═══════════════════════════════════════",
        "",
        ...patterns.map(p => [
          `### ${p.name}`,
          `When: ${p.when}`,
          `Description: ${p.description}`,
          "```",
          p.template,
          "```"
        ].join("\n")),
        "",
        "═══════════════════════════════════════",
        `Anti-patterns to avoid:`
      ];

      for (const anti of ANTI_PATTERNS) {
        report.push(`\n❌ ${anti.pattern}\n  Bad:  ${anti.bad}\n  Good: ${anti.fix}`);
      }

      return { content: [{ type: "text", text: report.join("\n") }] };
    }
  );

  server.tool(
    "error_audit",
    "Audits code for common error handling anti-patterns. Checks for empty catch blocks, swallowed errors, string throws, missing error context, and generic responses.",
    {
      code: z.string().describe("Code to audit for error handling issues"),
      language: z.enum(["typescript", "python", "go"]).optional().describe("Language (auto-detected if omitted)")
    },
    async ({ code, language }) => {
      const issues = [];

      // Detect language if not provided
      if (!language) {
        if (code.includes("function ") || code.includes("const ") || code.includes("=> ")) language = "typescript";
        else if (code.includes("def ") || code.includes("class ") && code.includes("__init__")) language = "python";
        else if (code.includes("func ") && code.includes("error")) language = "go";
        else language = "typescript";
      }

      // Check for anti-patterns
      if (/catch\s*\([^)]*\)\s*\{\s*\}/g.test(code)) {
        issues.push({ severity: "HIGH", issue: "Empty catch block", line: "detected", fix: "At minimum, log the error" });
      }
      if (/catch\s*\([^)]*\)\s*\{\s*return\s+null\s*;?\s*\}/g.test(code)) {
        issues.push({ severity: "MEDIUM", issue: "Swallowed error (return null)", line: "detected", fix: "Use Result type or re-throw" });
      }
      if (/throw\s+["']/.test(code)) {
        issues.push({ severity: "HIGH", issue: "String throw", line: "detected", fix: "Use typed Error classes" });
      }
      if (language === "typescript" && /catch\s*\([^)]*\)\s*\{\s*throw\s+new\s+Error\s*\(\s*["'][^"']+["']\s*\)/g.test(code)) {
        issues.push({ severity: "MEDIUM", issue: "Missing error context in re-throw", line: "detected", fix: "Include original error: { cause: e }" });
      }
      if (/return\s*\{\s*error\s*:\s*["']error["']\s*\}/g.test(code)) {
        issues.push({ severity: "MEDIUM", issue: "Generic error response", line: "detected", fix: "Return structured error with code and message" });
      }

      const report = [
        "ERROR HANDLING AUDIT",
        "═══════════════════════════════════════",
        `Language: ${language}`,
        `Issues found: ${issues.length}`,
        "",
        issues.length === 0 ? "✅ No error handling issues detected." : "",
        ...issues.map(i => `[${i.severity}] ${i.issue}\n  Fix: ${i.fix}`),
        "",
        "═══════════════════════════════════════",
        issues.length === 0 ? "PASS" : `FAIL — ${issues.length} issue(s) found`
      ].filter(Boolean).join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
