/**
 * Integration test for checkpoint/rewind functionality
 * Tests tool registration and handler structure
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  registerProjectStateTools,
} from '../src/project-state.js';

describe('Integration: Checkpoint/Rewind Tool Registration', () => {
  it('should register all checkpoint/rewind tools', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, desc, schema, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const toolNames = calls.map(c => c.name);
    
    // Verify all expected tools are registered
    assert.ok(toolNames.includes('get_project_state'), 'get_project_state should be registered');
    assert.ok(toolNames.includes('save_project_state'), 'save_project_state should be registered');
    assert.ok(toolNames.includes('checkpoint_task'), 'checkpoint_task should be registered');
    assert.ok(toolNames.includes('list_checkpoints'), 'list_checkpoints should be registered');
    assert.ok(toolNames.includes('resume_task'), 'resume_task should be registered');
    assert.ok(toolNames.includes('rewind_to_checkpoint'), 'rewind_to_checkpoint should be registered');
    assert.ok(toolNames.includes('compress_checkpoint_results'), 'compress_checkpoint_results should be registered');
  });
  
  it('should have correct schema for rewind_to_checkpoint', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, desc, schema, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const rewindTool = calls.find(c => c.name === 'rewind_to_checkpoint');
    
    assert.ok(rewindTool, 'rewind_to_checkpoint should be registered');
    assert.ok(rewindTool.schema.label, 'should have label parameter');
    assert.ok(rewindTool.schema.tier, 'should have tier parameter');
    assert.ok(rewindTool.desc.includes('compress'), 'description should mention compression');
  });
  
  it('should have correct schema for compress_checkpoint_results', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, desc, schema, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const compressTool = calls.find(c => c.name === 'compress_checkpoint_results');
    
    assert.ok(compressTool, 'compress_checkpoint_results should be registered');
    assert.ok(compressTool.schema.label, 'should have label parameter');
    assert.ok(compressTool.schema.tier, 'should have tier parameter');
    assert.ok(compressTool.desc.includes('semantic compression'), 'description should mention semantic compression');
  });
  
  it('should have async handlers for all checkpoint tools', () => {
    const calls = [];
    const mockServer = {
      tool: (name, desc, schema, handler) => {
        calls.push({ name, handler });
      },
    };
    
    registerProjectStateTools(mockServer);
    
    const checkpointTools = ['checkpoint_task', 'list_checkpoints', 'resume_task', 'rewind_to_checkpoint', 'compress_checkpoint_results'];
    
    for (const toolName of checkpointTools) {
      const tool = calls.find(c => c.name === toolName);
      assert.ok(tool, `${toolName} should be registered`);
      assert.strictEqual(typeof tool.handler, 'function', `${toolName} handler should be a function`);
    }
  });
});
