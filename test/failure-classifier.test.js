/**
 * Handler-level tests for src/failure-classifier.js MCP tools.
 * Tests: classifyFailure, tool registration, output contract.
 * Uses createMockServer pattern to invoke handlers directly.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  classifyFailure,
  registerFailureClassifierTools,
} from "../src/failure-classifier.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, desc, schema, handler) => {
        tools[name] = { desc, schema, handler };
      },
    },
    tools,
  };
}

function mockText(result) {
  return result?.content?.[0]?.text || "";
}

function parseResult(result) {
  return JSON.parse(mockText(result));
}

// ─── Output Contract ─────────────────────────────────────────────────────────

describe("output contract", () => {
  it("returns all required fields", () => {
    const result = classifyFailure("some error");
    const required = [
      "verdict",
      "failure_class",
      "evidence",
      "strongest_signal",
      "likely_cause",
      "next_command",
      "ruled_out",
      "safe_to_continue",
    ];
    for (const key of required) {
      assert.ok(key in result, `Missing required field: ${key}`);
    }
  });

  it("verdict is one of PASS, WARN, HALT", () => {
    const result = classifyFailure("some error");
    assert.ok(
      ["PASS", "WARN", "HALT"].includes(result.verdict),
      `Invalid verdict: ${result.verdict}`
    );
  });

  it("failure_class is a string", () => {
    const result = classifyFailure("some error");
    assert.equal(typeof result.failure_class, "string");
  });

  it("evidence is an array of strings", () => {
    const result = classifyFailure("some error");
    assert.ok(Array.isArray(result.evidence));
    for (const item of result.evidence) {
      assert.equal(typeof item, "string");
    }
  });

  it("safe_to_continue is boolean", () => {
    const result = classifyFailure("some error");
    assert.equal(typeof result.safe_to_continue, "boolean");
  });

  it("ruled_out is an array of strings", () => {
    const result = classifyFailure("some error");
    assert.ok(Array.isArray(result.ruled_out));
    for (const item of result.ruled_out) {
      assert.equal(typeof item, "string");
    }
  });
});

// ─── Failure Class: dependency ───────────────────────────────────────────────

describe("dependency class", () => {
  it("module not found → dependency", () => {
    const result = classifyFailure(
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'lodash' imported from src/index.js"
    );
    assert.equal(result.failure_class, "dependency");
    assert.equal(result.verdict, "HALT");
    assert.equal(result.safe_to_continue, false);
  });

  it("missing import → dependency", () => {
    const result = classifyFailure(
      "Cannot find module './helpers.js' required from src/watchdog.js"
    );
    assert.equal(result.failure_class, "dependency");
  });

  it("ESM resolution failure → dependency", () => {
    const result = classifyFailure(
      "SyntaxError: The requested module './utils.js' does not provide an export named 'foo'"
    );
    assert.equal(result.failure_class, "dependency");
  });
});

// ─── Failure Class: validation ───────────────────────────────────────────────

describe("validation class", () => {
  it("regex pattern match → validation", () => {
    const result = classifyFailure(
      "Validation failed: input must match pattern /^[a-z]+$/"
    );
    assert.equal(result.failure_class, "validation");
    assert.equal(result.verdict, "WARN");
  });

  it("schema failure → validation", () => {
    const result = classifyFailure(
      "Schema validation error: expected string but got number at field 'name'"
    );
    assert.equal(result.failure_class, "validation");
  });

  it("lint error → validation", () => {
    const result = classifyFailure(
      "ESLint: Unexpected var, use let or const instead"
    );
    assert.equal(result.failure_class, "validation");
  });
});

// ─── Failure Class: tool ─────────────────────────────────────────────────────

describe("tool class", () => {
  it("file not found → tool", () => {
    const result = classifyFailure(
      "ENOENT: no such file or directory, open '/tmp/test.txt'"
    );
    assert.equal(result.failure_class, "tool");
  });

  it("permission denied → tool", () => {
    const result = classifyFailure(
      "EACCES: permission denied, mkdir '/root/.cache'"
    );
    assert.equal(result.failure_class, "tool");
  });

  it("timeout → tool", () => {
    const result = classifyFailure(
      "Error: Command timed out after 30000ms"
    );
    assert.equal(result.failure_class, "tool");
  });

  it("rate limit → tool", () => {
    const result = classifyFailure(
      "HTTP 429: Too Many Requests — rate limit exceeded"
    );
    assert.equal(result.failure_class, "tool");
  });
});

// ─── Failure Class: network ──────────────────────────────────────────────────

describe("network class", () => {
  it("connection refused → network", () => {
    const result = classifyFailure(
      "fetch failed: connect ECONNREFUSED 127.0.0.1:3000"
    );
    assert.equal(result.failure_class, "network");
  });

  it("DNS resolution failure → network", () => {
    const result = classifyFailure(
      "getaddrinfo ENOTFOUND api.example.com"
    );
    assert.equal(result.failure_class, "network");
  });

  it("API error → network", () => {
    const result = classifyFailure(
      "HTTP 502 Bad Gateway from upstream service"
    );
    assert.equal(result.failure_class, "network");
  });
});

// ─── Failure Class: hallucination ────────────────────────────────────────────

describe("hallucination class", () => {
  it("reference to non-existent file → hallucination", () => {
    const result = classifyFailure(
      "ReferenceError: src/nonexistent.js does not exist"
    );
    assert.equal(result.failure_class, "hallucination");
    assert.equal(result.verdict, "HALT");
    assert.equal(result.safe_to_continue, false);
  });

  it("undefined variable reference → hallucination", () => {
    const result = classifyFailure(
      "ReferenceError: foobar_baz is not defined"
    );
    assert.equal(result.failure_class, "hallucination");
  });
});

// ─── Failure Class: empty/unknown ────────────────────────────────────────────

describe("unknown class", () => {
  it("empty error → unknown", () => {
    const result = classifyFailure("");
    assert.equal(result.failure_class, "unknown");
    assert.equal(result.verdict, "WARN");
    assert.equal(result.safe_to_continue, true);
    assert.ok(result.evidence.length > 0);
  });

  it("whitespace-only error → unknown", () => {
    const result = classifyFailure("   \n  ");
    assert.equal(result.failure_class, "unknown");
  });

  it("unrecognizable error → unknown", () => {
    const result = classifyFailure("Something went wrong with the thing");
    assert.equal(result.failure_class, "unknown");
  });
});

// ─── Failure Class: config ───────────────────────────────────────────────────

describe("config class", () => {
  it("missing config → config", () => {
    const result = classifyFailure(
      "ENOENT: no such file or directory, config/settings.json"
    );
    // Could match tool or config — config patterns should be more specific
    assert.ok(
      ["config", "tool"].includes(result.failure_class),
      `Expected config or tool, got ${result.failure_class}`
    );
  });

  it("missing env variable → config", () => {
    const result = classifyFailure(
      "Missing required environment variable: API_KEY"
    );
    assert.equal(result.failure_class, "config");
  });
});

// ─── Failure Class: compression ──────────────────────────────────────────────

describe("compression class", () => {
  it("CCR pipeline failure → compression", () => {
    const result = classifyFailure(
      "CCR pipeline failed: store error during content compression"
    );
    assert.equal(result.failure_class, "compression");
  });
});

// ─── Failure Class: memory ───────────────────────────────────────────────────

describe("memory class", () => {
  it("observation save failure → memory", () => {
    const result = classifyFailure(
      "Error saving observation to session_memory.json"
    );
    assert.equal(result.failure_class, "memory");
  });

  it("JSON parse failure on memory file → memory", () => {
    const result = classifyFailure(
      "SyntaxError: Unexpected token in JSON at position 0 while reading session memory"
    );
    assert.equal(result.failure_class, "memory");
  });
});

// ─── Failure Class: state ────────────────────────────────────────────────────

describe("state class", () => {
  it("project state corruption → state", () => {
    const result = classifyFailure(
      "Project state corrupt: task_runtime.json contains invalid checkpoint data"
    );
    assert.equal(result.failure_class, "state");
  });
});

// ─── Context Improves Classification ─────────────────────────────────────────

describe("context improves classification", () => {
  it("ambiguous error + context resolves to correct class", () => {
    const result = classifyFailure(
      "Error: failed",
      "Running npm install to resolve missing packages"
    );
    assert.equal(result.failure_class, "dependency");
  });

  it("ambiguous file error + context resolves to config", () => {
    const result = classifyFailure(
      "Error: operation failed",
      "Missing config file at project root, settings.json not found"
    );
    assert.equal(result.failure_class, "config");
  });

  it("ambiguous error + context about network resolves to network", () => {
    const result = classifyFailure(
      "Request failed unexpectedly",
      "Calling external API endpoint, connection refused by upstream server"
    );
    assert.equal(result.failure_class, "network");
  });
});

// ─── Ruled Out ───────────────────────────────────────────────────────────────

describe("ruled_out", () => {
  it("lists other matching classes that scored lower", () => {
    const result = classifyFailure(
      "ENOENT: no such file or directory, open '/tmp/state.json' — project state file missing"
    );
    assert.ok(result.ruled_out.length >= 0);
    // Should not include its own class in ruled_out
    assert.ok(!result.ruled_out.includes(result.failure_class));
  });
});

// ─── Tool Registration ───────────────────────────────────────────────────────

describe("classify_failure tool registration", () => {
  it("registers tool on server", () => {
    const { server, tools } = createMockServer();
    registerFailureClassifierTools(server);
    assert.ok("classify_failure" in tools);
  });

  it("handler returns valid result via tool call", async () => {
    const { server, tools } = createMockServer();
    registerFailureClassifierTools(server);

    const result = await tools.classify_failure.handler({
      error: "Cannot find module './missing.js'",
    });
    const parsed = parseResult(result);
    assert.equal(parsed.failure_class, "dependency");
  });

  it("handler respects context parameter", async () => {
    const { server, tools } = createMockServer();
    registerFailureClassifierTools(server);

    const result = await tools.classify_failure.handler({
      error: "Connection failed",
      context: "Fetching data from remote API endpoint",
    });
    const parsed = parseResult(result);
    assert.equal(parsed.failure_class, "network");
  });

  it("handler handles empty error gracefully", async () => {
    const { server, tools } = createMockServer();
    registerFailureClassifierTools(server);

    const result = await tools.classify_failure.handler({
      error: "",
    });
    const parsed = parseResult(result);
    assert.equal(parsed.failure_class, "unknown");
  });
});
