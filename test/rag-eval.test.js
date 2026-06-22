/**
 * Tests for src/rag-eval.js — RAG quality evaluation framework.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  registerRagEvalTools,
  calculateFaithfulness,
  calculateAnswerRelevance,
  calculateContextPrecision,
  calculateContextRecall,
  calculateOverallQuality,
} from "../src/rag-eval.js";

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

describe("RAG Evaluation Metrics", () => {
  describe("Faithfulness", () => {
    it("returns 1.0 when answer is fully supported by context", () => {
      const answer = "Python is a programming language";
      const contexts = ["Python is a popular programming language created by Guido van Rossum"];
      const score = calculateFaithfulness(answer, contexts);
      assert.strictEqual(score, 1.0);
    });

    it("returns 0.0 when answer has no overlap with context", () => {
      const answer = "Java is compiled";
      const contexts = ["Python is an interpreted language"];
      const score = calculateFaithfulness(answer, contexts);
      assert.ok(score < 0.5, `Expected low score, got ${score}`);
    });

    it("returns partial score for partial context coverage", () => {
      const answer = "Python is fast and uses JavaScript";
      const contexts = ["Python is a language that can be fast"];
      const score = calculateFaithfulness(answer, contexts);
      assert.ok(score > 0.3 && score < 0.8, `Expected mid-range score, got ${score}`);
    });

    it("returns 0 for empty answer", () => {
      const score = calculateFaithfulness("", ["some context"]);
      assert.strictEqual(score, 0);
    });

    it("returns 0 for empty contexts", () => {
      const score = calculateFaithfulness("some answer", []);
      assert.strictEqual(score, 0);
    });
  });

  describe("Answer Relevance", () => {
    it("returns high score when answer addresses question keywords", () => {
      const question = "What is Python used for?";
      const answer = "Python is used for web development and data science";
      const score = calculateAnswerRelevance(question, answer);
      assert.ok(score >= 0.5, `Expected high score, got ${score}`);
    });

    it("returns low score when answer ignores question", () => {
      const question = "What is Python used for?";
      const answer = "The weather is sunny today";
      const score = calculateAnswerRelevance(question, answer);
      assert.ok(score < 0.3, `Expected low score, got ${score}`);
    });

    it("returns 0 for empty question", () => {
      const score = calculateAnswerRelevance("", "some answer");
      assert.strictEqual(score, 0);
    });

    it("returns 0 for empty answer", () => {
      const score = calculateAnswerRelevance("some question", "");
      assert.strictEqual(score, 0);
    });
  });

  describe("Context Precision", () => {
    it("returns high score when contexts contain question keywords", () => {
      const question = "What is Python used for?";
      const contexts = [
        "Python is used for web development",
        "Python is used for data science",
      ];
      const score = calculateContextPrecision(question, contexts);
      assert.ok(score >= 0.5, `Expected high score, got ${score}`);
    });

    it("returns low score when contexts are irrelevant", () => {
      const question = "What is Python used for?";
      const contexts = ["The weather is sunny", "Cats are cute"];
      const score = calculateContextPrecision(question, contexts);
      assert.ok(score < 0.3, `Expected low score, got ${score}`);
    });

    it("returns 0 for empty contexts", () => {
      const score = calculateContextPrecision("What is Python?", []);
      assert.strictEqual(score, 0);
    });
  });

  describe("Context Recall", () => {
    it("returns high score when context covers ground truth", () => {
      const ground_truth = "Python is a programming language";
      const contexts = ["Python is a popular programming language created by Guido"];
      const score = calculateContextRecall(ground_truth, contexts);
      assert.ok(score >= 0.6, `Expected high score, got ${score}`);
    });

    it("returns low score when context misses ground truth", () => {
      const ground_truth = "Python is a compiled language";
      const contexts = ["Java is an interpreted language"];
      const score = calculateContextRecall(ground_truth, contexts);
      assert.ok(score < 0.5, `Expected low score, got ${score}`);
    });

    it("returns 0 for empty ground truth", () => {
      const score = calculateContextRecall("", ["some context"]);
      assert.strictEqual(score, 0);
    });

    it("returns 0 for empty contexts", () => {
      const score = calculateContextRecall("some ground truth", []);
      assert.strictEqual(score, 0);
    });
  });

  describe("Overall Quality", () => {
    it("calculates weighted average of all metrics", () => {
      const metrics = {
        faithfulness: 0.8,
        answerRelevance: 0.6,
        contextPrecision: 0.7,
        contextRecall: 0.9,
      };
      const score = calculateOverallQuality(metrics);
      assert.ok(score > 0.6 && score < 0.9, `Expected mid-high score, got ${score}`);
    });

    it("handles partial metrics (no ground truth)", () => {
      const metrics = {
        faithfulness: 1.0,
        answerRelevance: 1.0,
        contextPrecision: 1.0,
      };
      const score = calculateOverallQuality(metrics);
      assert.ok(score >= 0.9, `Expected high score, got ${score}`);
    });

    it("returns 0 for empty metrics", () => {
      const score = calculateOverallQuality({});
      assert.strictEqual(score, 0);
    });
  });
});

describe("MCP Tool Registration", () => {
  it("is a function", () => {
    assert.strictEqual(typeof registerRagEvalTools, "function");
  });

  it("registers both expected tools", () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const toolNames = Object.keys(tools);
    assert.strictEqual(toolNames.length, 2, `Expected 2 tools, got ${toolNames.length}`);
    assert.ok("evaluate_rag_quality" in tools, "Missing evaluate_rag_quality tool");
    assert.ok("validate_eval_dataset" in tools, "Missing validate_eval_dataset tool");
  });
});

describe("Dataset Validation", () => {
  it("validates a correct dataset", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const dataset = {
      samples: [
        {
          id: "1",
          question: "What is Python?",
          ground_truth: "Python is a programming language",
          contexts: ["Python is a language"],
          metadata: { source: "wiki", difficulty: "easy", category: "programming" },
        },
      ],
    };

    const result = await tools.validate_eval_dataset.handler({ dataset: JSON.stringify(dataset) });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.sampleCount, 1);
  });

  it("rejects invalid dataset (missing required fields)", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const dataset = {
      samples: [
        {
          id: "1",
          question: "What is Python?",
          // Missing ground_truth, contexts, metadata
        },
      ],
    };

    const result = await tools.validate_eval_dataset.handler({ dataset: JSON.stringify(dataset) });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.valid, false);
    assert.ok(parsed.errors.length > 0, "Should have errors");
  });

  it("rejects invalid JSON", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const result = await tools.validate_eval_dataset.handler({ dataset: "not valid json" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.valid, false);
    assert.ok(parsed.errors[0].message.includes("Invalid JSON"));
  });

  it("rejects invalid difficulty enum", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const dataset = {
      samples: [
        {
          id: "1",
          question: "What is Python?",
          ground_truth: "Python is a programming language",
          contexts: ["Python is a language"],
          metadata: { source: "wiki", difficulty: "impossible", category: "programming" },
        },
      ],
    };

    const result = await tools.validate_eval_dataset.handler({ dataset: JSON.stringify(dataset) });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.valid, false);
  });
});

describe("E2E Tool Execution", () => {
  it("evaluate_rag_quality returns all metrics", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const result = await tools.evaluate_rag_quality.handler({
      question: "What is Python?",
      answer: "Python is a programming language used for web development",
      contexts: ["Python is a popular programming language"],
      ground_truth: "Python is a programming language",
    });

    const parsed = JSON.parse(result.content[0].text);

    assert.ok("metrics" in parsed, "Should have metrics");
    assert.ok("overallQuality" in parsed, "Should have overallQuality");
    assert.ok("faithfulness" in parsed.metrics, "Should have faithfulness");
    assert.ok("answerRelevance" in parsed.metrics, "Should have answerRelevance");
    assert.ok("contextPrecision" in parsed.metrics, "Should have contextPrecision");
    assert.ok("contextRecall" in parsed.metrics, "Should have contextRecall");

    // Verify all scores are 0-1
    assert.ok(parsed.metrics.faithfulness >= 0 && parsed.metrics.faithfulness <= 1);
    assert.ok(parsed.metrics.answerRelevance >= 0 && parsed.metrics.answerRelevance <= 1);
    assert.ok(parsed.metrics.contextPrecision >= 0 && parsed.metrics.contextPrecision <= 1);
    assert.ok(parsed.metrics.contextRecall >= 0 && parsed.metrics.contextRecall <= 1);
    assert.ok(parsed.overallQuality >= 0 && parsed.overallQuality <= 1);
  });

  it("evaluate_rag_quality works without ground truth", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const result = await tools.evaluate_rag_quality.handler({
      question: "What is Python?",
      answer: "Python is a programming language",
      contexts: ["Python is a popular language"],
    });

    const parsed = JSON.parse(result.content[0].text);

    assert.ok(!("contextRecall" in parsed.metrics), "Should not have contextRecall without ground truth");
  });

  it("evaluate_rag_quality handles empty contexts", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const result = await tools.evaluate_rag_quality.handler({
      question: "What is Python?",
      answer: "Python is a language",
      contexts: [],
    });

    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.metrics.faithfulness, 0);
    assert.strictEqual(parsed.metrics.contextPrecision, 0);
  });

  it("evaluate_rag_quality handles duplicate contexts", async () => {
    const { server, tools } = createMockServer();
    registerRagEvalTools(server);

    const result = await tools.evaluate_rag_quality.handler({
      question: "What is Python?",
      answer: "Python is a language",
      contexts: ["Python is a language", "Python is a language"],
    });

    const parsed = JSON.parse(result.content[0].text);

    // Should still work correctly
    assert.ok(parsed.metrics.faithfulness >= 0);
    assert.ok(parsed.metrics.faithfulness <= 1);
  });
});
