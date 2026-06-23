/**
 * Stack Perfeita MCP — Karpathy Impact Metrics Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerKarpathyImpactTools } from "../src/karpathy-impact.js";

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

describe("Karpathy Impact Tools", () => {
  it("registers all impact tools", () => {
    const server = createMockServer();
    registerKarpathyImpactTools(server);

    assert.ok(server.tools.get_karpathy_impact);
    assert.ok(server.tools.record_code_quality_check);
    assert.ok(server.tools.reset_karpathy_impact);
  });

  it("get_karpathy_impact returns valid data", async () => {
    const server = createMockServer();
    registerKarpathyImpactTools(server);

    const result = await server.tools.get_karpathy_impact.handler({});

    const data = JSON.parse(result.content[0].text);
    assert.ok(typeof data.session_duration_minutes === "number");
    assert.ok(data.before_karpathy);
    assert.ok(data.after_karpathy);
    assert.ok(data.improvements);
    assert.ok(typeof data.overall_improvement === "number");
    assert.ok(Array.isArray(data.summary));
  });

  it("record_code_quality_check records metric", async () => {
    const server = createMockServer();
    registerKarpathyImpactTools(server);

    const result = await server.tools.record_code_quality_check.handler({
      metric: "overcomplicationPatterns",
      count: 3,
    });

    const data = JSON.parse(result.content[0].text);
    assert.ok(data.success);
    assert.ok(data.message.includes("3"));
  });

  it("reset_karpathy_impact clears data", async () => {
    const server = createMockServer();
    registerKarpathyImpactTools(server);

    const result = await server.tools.reset_karpathy_impact.handler({});

    const data = JSON.parse(result.content[0].text);
    assert.ok(data.success);
    assert.ok(data.message.includes("reset"));
  });
});
