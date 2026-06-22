import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { validateFileDependencies, detectProjectContext } from '../src/dependency-resolution.js';

const ROOT = resolve(process.cwd(), '.tmp-dependency-resolution');

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function cleanup() {
  rmSync(ROOT, { recursive: true, force: true });
}

describe('dependency resolution phase 2', () => {
  afterEach(() => cleanup());

  it('should resolve monorepo workspace package imports through package exports', () => {
    write(resolve(ROOT, 'package.json'), JSON.stringify({
      name: 'root',
      private: true,
      workspaces: ['packages/*', 'apps/*'],
    }, null, 2));

    write(resolve(ROOT, 'packages/utils/package.json'), JSON.stringify({
      name: '@repo/utils',
      exports: {
        '.': './src/index.ts',
        './math': './src/math.ts'
      }
    }, null, 2));
    write(resolve(ROOT, 'packages/utils/src/index.ts'), 'export const ok = true;');
    write(resolve(ROOT, 'packages/utils/src/math.ts'), 'export const sum = (a:number,b:number)=>a+b;');

    const appFile = resolve(ROOT, 'apps/web/src/main.ts');
    write(appFile, "import { sum } from '@repo/utils/math';\nexport const result = sum(1, 2);\n");

    const report = validateFileDependencies(appFile);
    assert.strictEqual(report.ok, true);
    assert.ok(report.stats.workspaces >= 1);
  });

  it('should resolve tsconfig paths and vite aliases', () => {
    write(resolve(ROOT, 'package.json'), JSON.stringify({ name: 'alias-app' }, null, 2));
    write(resolve(ROOT, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@core/*': ['src/core/*']
        }
      }
    }, null, 2));
    write(resolve(ROOT, 'vite.config.ts'), "import { defineConfig } from 'vite';\nimport path from 'node:path';\nexport default defineConfig({ resolve: { alias: { '@ui': path.resolve(__dirname, './src/ui') } } });\n");
    write(resolve(ROOT, 'src/core/api.ts'), 'export const api = 1;');
    write(resolve(ROOT, 'src/ui/button.ts'), 'export const button = 1;');

    const filePath = resolve(ROOT, 'src/app.ts');
    write(filePath, "import { api } from '@core/api';\nimport { button } from '@ui/button';\nexport { api, button };\n");

    const report = validateFileDependencies(filePath);
    assert.strictEqual(report.ok, true);
    assert.ok(report.stats.aliases >= 2);
  });

  it('should fail when a package subpath is outside declared exports', () => {
    write(resolve(ROOT, 'package.json'), JSON.stringify({ name: 'consumer' }, null, 2));
    write(resolve(ROOT, 'node_modules/pkg/package.json'), JSON.stringify({
      name: 'pkg',
      exports: {
        '.': './dist/index.js'
      }
    }, null, 2));
    write(resolve(ROOT, 'node_modules/pkg/dist/index.js'), 'module.exports = {};');

    const filePath = resolve(ROOT, 'src/app.js');
    write(filePath, "import hidden from 'pkg/internal';\nexport default hidden;\n");

    const report = validateFileDependencies(filePath);
    assert.strictEqual(report.ok, false);
    assert.ok(report.missing.some((item) => item.label.includes('pkg/internal')));
  });

  it('should detect workspace root and alias metadata', () => {
    write(resolve(ROOT, 'package.json'), JSON.stringify({
      name: 'root',
      private: true,
      workspaces: ['packages/*']
    }, null, 2));
    write(resolve(ROOT, 'packages/app/package.json'), JSON.stringify({ name: '@repo/app' }, null, 2));
    write(resolve(ROOT, 'packages/app/jsconfig.json'), JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '#lib/*': ['src/lib/*']
        }
      }
    }, null, 2));
    write(resolve(ROOT, 'packages/app/src/lib/x.js'), 'export const x = 1;');
    const filePath = resolve(ROOT, 'packages/app/src/index.js');
    write(filePath, "import { x } from '#lib/x';\nexport { x };\n");

    const context = detectProjectContext(filePath);
    assert.strictEqual(context.workspaceRoot, ROOT);
    assert.ok(context.aliases.some((alias) => alias.find === '#lib'));
  });
});
