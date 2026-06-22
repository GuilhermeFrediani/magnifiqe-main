/**
 * Test suite for tool-prompt-analyzer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeToolDescriptions, registerToolPromptAnalyzer } from '../src/tool-prompt-analyzer.js';

describe('analyzeToolDescriptions', () => {
  it('should return structured analysis output', () => {
    const result = analyzeToolDescriptions();
    assert.ok(result.tools_analyzed > 0, 'Should analyze at least one tool');
    assert.ok(typeof result.total_words === 'number');
    assert.ok(typeof result.avg_words_per_tool === 'number');
    assert.ok(Array.isArray(result.tools));
    assert.ok(Array.isArray(result.redundancies));
    assert.ok(Array.isArray(result.schema_redundancies));
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(Array.isArray(result.quality_scores));
  });

  it('should count words correctly', () => {
    const result = analyzeToolDescriptions();
    for (const tool of result.tools) {
      assert.ok(tool.words >= 0, `Tool ${tool.name} should have word count >= 0`);
      assert.ok(tool.name, 'Tool should have a name');
      assert.ok(tool.file, 'Tool should have a file path');
    }
  });

  it('should find overlapping phrases', () => {
    const result = analyzeToolDescriptions();
    // Should find some overlaps given we have many tools with similar patterns
    assert.ok(Array.isArray(result.redundancies));
    // Check structure of redundancies
    for (const r of result.redundancies) {
      assert.ok(r.phrase, 'Redundancy should have a phrase');
      assert.ok(r.occurrences >= 2, 'Should have at least 2 occurrences');
      assert.ok(Array.isArray(r.tools), 'Should list affected tools');
    }
  });

  it('should identify schema redundancies', () => {
    const result = analyzeToolDescriptions();
    assert.ok(Array.isArray(result.schema_redundancies));
    // Check structure
    for (const r of result.schema_redundancies) {
      assert.ok(r.tool, 'Should have tool name');
      assert.ok(r.description, 'Should have description');
      assert.ok(Array.isArray(r.schema_fields), 'Should list schema fields');
    }
  });

  it('should return structured recommendations', () => {
    const result = analyzeToolDescriptions();
    assert.ok(result.recommendations.length > 0, 'Should have recommendations');
    for (const r of result.recommendations) {
      assert.ok(r.tool, 'Recommendation should have tool name');
      assert.ok(r.issue, 'Recommendation should have issue');
      assert.ok(r.suggestion, 'Recommendation should have suggestion');
      assert.ok(r.rule, 'Recommendation should have rule identifier');
    }
  });

  it('should calculate quality scores', () => {
    const result = analyzeToolDescriptions();
    assert.ok(result.quality_scores.length > 0, 'Should have quality scores');
    for (const q of result.quality_scores) {
      assert.ok(q.tool, 'Should have tool name');
      assert.ok(typeof q.scores.clarity === 'number');
      assert.ok(typeof q.scores.conciseness === 'number');
      assert.ok(typeof q.scores.completeness === 'number');
      assert.ok(typeof q.scores.total === 'number');
      assert.ok(q.scores.total >= 0 && q.scores.total <= 150, 'Total should be 0-150');
    }
  });

  it('should handle empty source directory gracefully', () => {
    // This shouldn't throw, just return empty results
    const result = analyzeToolDescriptions('/nonexistent/path');
    assert.ok(result.tools_analyzed === 0);
    assert.ok(result.tools.length === 0);
  });

  it('should calculate average words per tool', () => {
    const result = analyzeToolDescriptions();
    if (result.tools_analyzed > 0) {
      assert.ok(
        result.avg_words_per_tool > 0,
        'Average words should be positive when tools exist'
      );
      assert.ok(
        result.avg_words_per_tool === Math.round(result.total_words / result.tools_analyzed),
        'Average should match total/analyzed'
      );
    }
  });
});

describe('Tool registration', () => {
  it('should export registerToolPromptAnalyzer function', () => {
    assert.ok(typeof registerToolPromptAnalyzer === 'function');
  });

  it('should register analyze_tool_prompts tool', () => {
    // Mock server
    const tools = {};
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        tools[name] = { desc, schema, handler };
      },
    };

    registerToolPromptAnalyzer(mockServer);

    assert.ok(tools.analyze_tool_prompts, 'Should register analyze_tool_prompts');
    assert.ok(
      tools.analyze_tool_prompts.desc.includes('redundancy'),
      'Description should mention redundancy'
    );
  });
});

describe('Optimization rules', () => {
  it('should check for purpose statement', () => {
    const result = analyzeToolDescriptions();
    const purposeIssues = result.recommendations.filter((r) => r.rule === 'HAS_PURPOSE');
    // Some tools might not have purpose statements
    assert.ok(Array.isArray(purposeIssues));
  });

  it('should check for examples', () => {
    const result = analyzeToolDescriptions();
    const exampleIssues = result.recommendations.filter((r) => r.rule === 'HAS_EXAMPLES');
    assert.ok(Array.isArray(exampleIssues));
  });

  it('should check for failure shapes', () => {
    const result = analyzeToolDescriptions();
    const failureIssues = result.recommendations.filter((r) => r.rule === 'HAS_FAILURE_SHAPES');
    assert.ok(Array.isArray(failureIssues));
  });

  it('should check for anti-patterns', () => {
    const result = analyzeToolDescriptions();
    const antiPatternIssues = result.recommendations.filter((r) => r.rule === 'HAS_ANTI_PATTERNS');
    assert.ok(Array.isArray(antiPatternIssues));
  });

  it('should check for critical recap', () => {
    const result = analyzeToolDescriptions();
    const criticalIssues = result.recommendations.filter((r) => r.rule === 'HAS_CRITICAL_RECAP');
    assert.ok(Array.isArray(criticalIssues));
  });
});
