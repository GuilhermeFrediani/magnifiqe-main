# test/council-live-handlers.test.js

- kind: js
- lines: 224
- bytes: 7751

## Summary
No inline summary detected

## Imports
- `node:test`
- `node:assert/strict`
- `../src/council-orchestrator.js`
- `../src/rate-limiter.js`

## Exports
- none

## Source
```js
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerCouncilLiveTools } from "../src/council-orchestrator.js";
import { rateLimiter } from "../src/rate-limiter.js";

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool: (name, _desc, _schema, handler) => {
        tools[name] = { handler };
      },
    },
    tools,
  };
}

function resetRateLimiter() {
  rateLimiter.counters = {};
}

describe("registerCouncilLiveTools", () => {
  it("registers all 5 tools on the server", () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);
    assert.deepEqual(Object.keys(tools).sort(), [
      "get_council_execution_prompt",
      "normalize_council_json",
      "run_council_auto",
      "run_council_deep",
      "run_council_simple",
    ]);
  });
});

describe("run_council_simple", () => {
  beforeEach(() => resetRateLimiter());

  it("returns a plan with resolved_mode simple and objective echoed", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.run_council_simple.handler({
      objective: "Fix the auth timeout bug",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("## Council Live Plan"), "contains plan header");
    assert.ok(text.includes("resolved_mode: simple"), "resolved mode is simple");
    assert.ok(text.includes("Fix the auth timeout bug"), "objective is echoed");
    assert.ok(text.includes("### Gate"), "contains gate section");
  });

  it("includes constraints and desired_output when provided", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.run_council_simple.handler({
      objective: "Refactor the DB layer",
      desired_output: "A migration plan",
      constraints: ["No downtime", "Keep backward compat"],
    });

    const text = result.content[0].text;
    assert.ok(text.includes("A migration plan"), "desired_output appears");
    assert.ok(text.includes("No downtime"), "constraint 1 appears");
    assert.ok(text.includes("Keep backward compat"), "constraint 2 appears");
  });
});

describe("run_council_deep", () => {
  beforeEach(() => resetRateLimiter());

  it("returns a deep plan with session_id, bot order, and peer review queue", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.run_council_deep.handler({
      objective: "Redesign the auth architecture",
      blast_radius: "system",
      ambiguity: 5,
      tradeoff_intensity: 5,
      touches_multiple_modules: true,
      safety_critical: true,
      failure_cost: "high",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("## Council Live Plan"), "contains plan header");
    assert.ok(text.includes("resolved_mode: deep"), "resolved mode is deep");
    assert.ok(text.includes("### Session"), "contains session section");
    assert.ok(text.includes("session_id:"), "session_id is present");
    assert.ok(text.includes("### Bot order"), "contains bot order");
    assert.ok(text.includes("1."), "bot order is numbered");
    assert.ok(text.includes("### Peer review queue"), "contains peer review queue");
  });
});

describe("run_council_auto", () => {
  beforeEach(() => resetRateLimiter());

  it("resolves to simple mode for low-complexity tasks", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.run_council_auto.handler({
      objective: "Add a comment to the README",
      blast_radius: "local",
      ambiguity: 1,
      tradeoff_intensity: 1,
      touches_multiple_modules: false,
      safety_critical: false,
      failure_cost: "low",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("resolved_mode: simple"), "auto resolved to simple");
    assert.ok(!text.includes("### Session"), "no session section in simple mode");
  });

  it("resolves to deep mode for high-complexity tasks", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.run_council_auto.handler({
      objective: "Migrate the authentication architecture across all services",
      blast_radius: "system",
      ambiguity: 5,
      tradeoff_intensity: 5,
      touches_multiple_modules: true,
      safety_critical: true,
      failure_cost: "high",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("resolved_mode: deep"), "auto resolved to deep");
    assert.ok(text.includes("### Session"), "session section present in deep mode");
  });
});

describe("get_council_execution_prompt", () => {
  beforeEach(() => resetRateLimiter());

  it("returns a bot_position prompt for a given bot", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.get_council_execution_prompt.handler({
      stage: "bot_position",
      bot: "contrarian",
      objective: "Evaluate the caching strategy",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("## Council Execution Prompt"), "contains header");
    assert.ok(text.includes("stage: bot_position"), "stage is recorded");
    assert.ok(text.includes("bot: contrarian"), "bot is recorded");
    assert.ok(text.includes("```text"), "prompt is wrapped in code block");
    assert.ok(text.includes("The Contrarian"), "prompt contains bot label");
  });

  it("returns a chairman prompt", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.get_council_execution_prompt.handler({
      stage: "chairman",
      objective: "Resolve the caching architecture debate",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("stage: chairman"), "stage is recorded");
    assert.ok(text.includes("The Chairman"), "prompt contains chairman label");
    assert.ok(text.includes("```text"), "prompt is in code block");
  });
});

describe("normalize_council_json", () => {
  beforeEach(() => resetRateLimiter());

  it("normalizes a valid bot_position JSON payload", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const rawJson = JSON.stringify({
      bot: "contrarian",
      problem_frame: "The caching layer has no TTL",
      thesis: "Introduce TTL-based eviction",
      assumptions: ["Redis is available"],
      opportunities: ["Add cache warming"],
      risks: ["Stampede on cold start"],
      next_steps: ["Prototype TTL logic"],
      evidence: "No TTL in config",
      confidence: 80,
      tags: ["cache"],
    });

    const result = await tools.normalize_council_json.handler({
      stage: "bot_position",
      raw_text: rawJson,
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.bot, "contrarian");
    assert.equal(parsed.problem_frame, "The caching layer has no TTL");
    assert.equal(parsed.confidence, 80);
    assert.deepEqual(parsed.assumptions, ["Redis is available"]);
  });

  it("returns HALT error for unparseable JSON", async () => {
    const { server, tools } = createMockServer();
    registerCouncilLiveTools(server);

    const result = await tools.normalize_council_json.handler({
      stage: "bot_position",
      raw_text: "this is not json at all {{{",
    });

    const text = result.content[0].text;
    assert.ok(text.startsWith("HALT"), "starts with HALT error");
  });
});

```
