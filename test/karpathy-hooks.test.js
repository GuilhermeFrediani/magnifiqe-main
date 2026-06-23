/**
 * Stack Perfeita MCP — Karpathy Hooks Tests
 * Tests for the Karpathy Anti-Slop validation system.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetKarpathyState,
  getKarpathyState,
  validateAssumptions,
  validateSimplicity,
  verifySurgicalChanges,
  validateGoalDriven,
  withKarpathyValidation,
  validateSessionKarpathy,
} from "../src/karpathy-hooks.js";

describe("Karpathy Hooks", () => {
  beforeEach(() => {
    resetKarpathyState();
  });

  describe("Pillar 1: Think Before Coding", () => {
    it("passes when assumptions are stated", () => {
      const result = validateAssumptions("I assume the user wants JSON format");
      assert.ok(result.passed);
      assert.equal(result.message, null);
    });

    it("passes when asking for clarification", () => {
      const result = validateAssumptions("Please clarify the expected output format");
      assert.ok(result.passed);
    });

    it("fails when no assumptions are stated", () => {
      const result = validateAssumptions("const x = 5;");
      assert.ok(!result.passed);
      assert.ok(result.message.includes("Karpathy Pillar 1"));
    });
  });

  describe("Pillar 2: Simplicity First", () => {
    it("passes for simple code", () => {
      const code = `
        function add(a, b) {
          return a + b;
        }
      `;
      const result = validateSimplicity(code);
      assert.ok(result.passed);
      assert.equal(result.issues.length, 0);
    });

    it("fails for overcomplicated code", () => {
      const code = `
        class DiscountStrategy(Strategy) {
          calculate(amount) { return amount * 0.1; }
        }
      `;
      const result = validateSimplicity(code);
      assert.ok(!result.passed);
      assert.ok(result.issues.some(i => i.includes("Strategy pattern")));
    });

    it("detects long functions", () => {
      const longFunction = `
        function processData() {
          ${Array(60).fill("  console.log('step');").join("\n")}
        }
      `;
      const result = validateSimplicity(longFunction);
      assert.ok(!result.passed);
      assert.ok(result.issues.some(i => i.includes("50 lines")));
    });
  });

  describe("Pillar 3: Surgical Changes", () => {
    it("passes for minimal changes", () => {
      const original = "function add(a, b) { return a + b; }";
      const newCode = "function add(a, b) { return a + b + 0; }";
      const result = verifySurgicalChanges(original, newCode, "add zero");
      assert.ok(result.passed);
      assert.equal(result.unrelatedChanges.length, 0);
    });

    it("fails for expanded code", () => {
      const original = "function add(a, b) { return a + b; }";
      const newCode = `
        function add(a, b) {
          const result = a + b;
          console.log('Result:', result);
          return result;
        }
        function subtract(a, b) { return a - b; }
      `;
      const result = verifySurgicalChanges(original, newCode, "add zero");
      assert.ok(!result.passed);
      assert.ok(result.unrelatedChanges.length > 0);
    });
  });

  describe("Pillar 4: Goal-Driven Execution", () => {
    it("passes when goals are defined", () => {
      const result = validateGoalDriven("Fix the bug and verify with test");
      assert.ok(result.passed);
      assert.equal(result.message, null);
    });

    it("fails when goals are vague", () => {
      const result = validateGoalDriven("Make it better");
      assert.ok(!result.passed);
      assert.ok(result.message.includes("Karpathy Pillar 4"));
    });
  });

  describe("Tool Validation Wrapper", () => {
    it("wraps handler with validation", async () => {
      const originalHandler = async (params) => ({
        content: [{ type: "text", text: "success" }],
      });

      const wrappedHandler = withKarpathyValidation(
        "test_tool",
        originalHandler,
        { validateAssumptions: false, validateGoals: false }
      );

      const result = await wrappedHandler({ input: "test" });
      assert.equal(result.content[0].text, "success");
    });
  });

  describe("Session Validation", () => {
    it("validates session state", () => {
      const result = validateSessionKarpathy();
      // Initially not valid until assumptions/goals are validated
      assert.ok(!result.valid);
      assert.ok(result.missing.includes("assumptions"));
      assert.ok(result.missing.includes("goals"));
    });
  });
});
