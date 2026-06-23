/**
 * Stack Perfeita MCP — Karpathy Dashboard Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerKarpathyDashboardTools } from "../src/karpathy-dashboard.js";

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

describe("Karpathy Dashboard Tools", () => {
  it("registers all dashboard tools", () => {
    const server = createMockServer();
    registerKarpathyDashboardTools(server);

    assert.ok(server.tools.get_karpathy_dashboard);
    assert.ok(server.tools.reset_karpathy_dashboard);
  });

  it("get_karpathy_dashboard returns valid data", async () => {
    const server = createMockServer();
    registerKarpathyDashboardTools(server);

    const result = await server.tools.get_karpathy_dashboard.handler({});

    const data = JSON.parse(result.content[0].text);
    assert.ok(typeof data.session_duration_minutes === "number");
    assert.ok(typeof data.total_checks === "number");
    assert.ok(typeof data.compliance_rate === "number");
    assert.ok(data.pillar_breakdown);
    assert.ok(Array.isArray(data.recommendations));
  });

  it("reset_karpathy_dashboard clears data", async () => {
    const server = createMockServer();
    registerKarpathyDashboardTools(server);

    const result = await server.tools.reset_karpathy_dashboard.handler({});

    const data = JSON.parse(result.content[0].text);
    assert.ok(data.success);
    assert.ok(data.message.includes("reset"));
  });
});
