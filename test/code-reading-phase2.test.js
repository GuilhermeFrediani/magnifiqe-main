import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractSymbols, extractSymbolBody, analyzeCodeMetrics } from '../src/code-reading.js';

describe('code reading phase 2 parser', () => {
  it('should parse decorators, typed methods, and class field arrows', () => {
    const code = `
@sealed
export class UserService<T> {
  private client: T;
  constructor(client: T) {
    this.client = client;
  }

  load = async (): Promise<T> => {
    return this.client;
  };

  async getById(id: string): Promise<T> {
    return this.client;
  }
}
`;
    const symbols = extractSymbols(code, 'js');
    assert.ok(symbols.some((s) => s.name === 'UserService' && s.kind === 'class'));
    assert.ok(symbols.some((s) => s.name === 'load'));
    assert.ok(symbols.some((s) => s.name === 'getById' && s.kind === 'method'));
  });

  it('should unfold class methods and variable-backed arrows', () => {
    const code = `
class Example {
  async run(task) {
    return task();
  }
}
export const build = async () => {
  return new Example();
};
`;
    const method = extractSymbolBody(code, 'run', 'js');
    const arrow = extractSymbolBody(code, 'build', 'js');
    assert.ok(method.body.includes('return task()'));
    assert.ok(arrow.body.includes('new Example'));
  });

  it('should detect explicit TypeScript return types from AST', () => {
    const code = `
export function sum(a: number, b: number): number {
  return a + b;
}
const render = (): string => 'ok';
`;
    const metrics = analyzeCodeMetrics(code);
    const sum = metrics.functions.find((fn) => fn.name === 'sum');
    assert.ok(sum);
    assert.strictEqual(sum.hasReturnType, true);
  });
});
