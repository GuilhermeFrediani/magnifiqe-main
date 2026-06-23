/**
 * Stack Perfeita MCP — Karpathy Testing Tools Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerKarpathyTestingTools } from "../src/karpathy-testing.js";

// Mock MCP server
function createMockServer() {
  const tools = {};
  return {
    tool: (name, description, schema, handler) => {
      tools[name] = { description, schema, handler };
    },
    tools,
  };
}

describe("Karpathy Testing Tools", () => {
  it("registers all 4 tools", () => {
    const server = createMockServer();
    registerKarpathyTestingTools(server);

    assert.ok(server.tools.evaluate_karpathy_compliance);
    assert.ok(server.tools.get_karpathy_stats);
    assert.ok(server.tools.test_code_simplicity);
    assert.ok(server.tools.test_goal_driven);
  });

  it("evaluate_karpathy_compliance returns score", async () => {
    const server = createMockServer();
    registerKarpathyTestingTools(server);

    const result = await server.tools.evaluate_karpathy_compliance.handler({
      prompt: "I assume the user wants JSON format. Before implementing, I need to clarify the output structure.",
      include_suggestions: true,
    });

    const data = JSON.parse(result.content[0].text);
    assert.ok(typeof data.overall_score === "number");
    assert.ok(data.overall_score >= 0 && data.overall_score <= 100);
    assert.ok(["A", "B", "C", "D"].includes(data.grade));
    assert.ok(data.karpathy_pillars);
  });

  it("test_code_simplicity detects overcomplicated code", async () => {
    const server = createMockServer();
    registerKarpathyTestingTools(server);

    const result = await server.tools.test_code_simplicity.handler({
      code: `
        class DiscountStrategy(Strategy) {
          calculate(amount) { return amount * 0.1; }
        }
      `,
    });

    const data = JSON.parse(result.content[0].text);
    assert.ok(!data.passed);
    assert.ok(data.issues.length > 0);
  });

  it("test_goal_driven detects vague goals", async () => {
    const server = createMockServer();
    registerKarpathyTestingTools(server);

    const result = await server.tools.test_goal_driven.handler({
      task_description: "Make it better",
    });

    const data = JSON.parse(result.content[0].text);
    assert.ok(!data.passed);
    assert.ok(data.message.includes("success criteria"));
  });

  it("test_goal_driven passes clear goals", async () => {
    const server = createMockServer();
    registerKarpathyTestingTools(server);

    const result = await server.tools.test_goal_driven.handler({
      task_description: "Fix the bug and verify with test that it passes",
    });

    const data = JSON.parse(result.content[0].text);
    assert.ok(data.passed);
  });
});
