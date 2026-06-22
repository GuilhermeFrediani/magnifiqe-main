#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'ai-docs');
const MIRROR_DIR = path.join(OUT_DIR, 'mirror');
const BUNDLES_DIR = path.join(OUT_DIR, 'bundles');

const INCLUDE = [
  'src',
  'ai-rules',
  'bin',
  'test',
  '.claude/skills',
  'examples',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  'README.md',
  'PROMPTS.md',
  'package.json',
  'opencode.json',
  'test-smoke-council.mjs',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'ai-docs', 'dist', 'build']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml']);
const BUNDLES = [
  {
    name: 'runtime-core',
    title: 'Runtime Core',
    description: 'Entrypoint, ativação, estado e compactação do runtime MCP.',
    matchers: ['src/index.js', 'src/activation.js', 'src/project-state.js', 'src/compaction.js', 'src/task-runtime.js', 'README.md'],
  },
  {
    name: 'council-runtime',
    title: 'Council Runtime',
    description: 'Council estruturado, Council Live, contratos de prompt e regras de deliberação.',
    matchers: ['src/council.js', 'src/council-live.js', 'ai-rules/12-council-deliberation.md', 'ai-rules/13-live-council-runtime.md', 'test/council.test.js', 'test/council-live.test.js', 'test-smoke-council.mjs'],
  },
  {
    name: 'integration',
    title: 'Integration',
    description: 'Setup por IDE, manifesto de instruções, leitura AI-first e integração operacional.',
    matchers: ['README.md', 'opencode.json', 'PROMPTS.md', 'examples', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md', 'bin/setup-ide.js', 'src/resources.js', 'src/rules.js', 'src/skills.js'],
  },
  {
    name: 'ide-quickstart',
    title: 'IDE Quickstart',
    description: 'Preset enxuto para IDEs com prompt lean, config MCP portátil e instruções mínimas.',
    matchers: ['README.md', 'PROMPTS.md', 'examples', 'bin/setup-ide.js', 'opencode.json'],
  },
  {
    name: 'testing-validation',
    title: 'Testing + Validation',
    description: 'Validação, smoke tests, stdio e comportamento de prova antes de declarar sucesso.',
    matchers: ['src/validators.js', 'test/e2e-stdio.test.js', 'test/validators.test.js', 'test/activation.test.js', 'test/task-runtime.test.js', 'test/dependency-resolution.test.js'],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function walk(target) {
  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];

  const found = [];
  const stack = [full];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
        continue;
      }
      if (!TEXT_EXT.has(path.extname(entry.name))) continue;
      found.push(next);
    }
  }
  return found.sort();
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function extractImports(code) {
  return [...code.matchAll(/^\s*import\s+.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

function extractExports(code) {
  const direct = [...code.matchAll(/^\s*export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);
  const named = [...code.matchAll(/^\s*export\s*\{([^}]+)\}/gm)]
    .flatMap((m) => m[1].split(','))
    .map((s) => s.trim().split(/\s+as\s+/)[1] || s.trim().split(/\s+as\s+/)[0])
    .filter(Boolean);
  return [...new Set([...direct, ...named])];
}

function extractHead(text, ext) {
  if (ext === '.md') {
    const line = text.split(/\r?\n/).find((entry) => entry.trim().startsWith('# '));
    return line ? line.replace(/^#\s+/, '').trim() : 'Markdown document';
  }
  const block = text.match(/\/\*\*?([\s\S]*?)\*\//);
  if (block) {
    const normalized = block[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (normalized) return normalized;
  }
  const single = text.split(/\r?\n/).find((line) => /^\s*\/\/\s+/.test(line));
  if (single) return single.replace(/^\s*\/\/\s+/, '').trim();
  return 'No inline summary detected';
}

function fencedLang(ext) {
  return {
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.json': 'json',
    '.md': 'md',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.txt': 'text',
  }[ext] || 'text';
}

function topFiles(files) {
  return files
    .slice()
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
    .slice(0, 10);
}

function groupByTop(files) {
  const map = new Map();
  for (const file of files) {
    const top = file.path.includes('/') ? file.path.split('/')[0] : '(root)';
    const record = map.get(top) || [];
    record.push(file);
    map.set(top, record);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function toMirrorPath(relativePath) {
  return path.join(MIRROR_DIR, `${relativePath}.md`);
}

function renderMirror(entry) {
  const imports = entry.imports.length ? entry.imports.map((item) => `- \`${item}\``).join('\n') : '- none';
  const exports = entry.exports.length ? entry.exports.map((item) => `- \`${item}\``).join('\n') : '- none';
  return [
    `# ${entry.path}`,
    '',
    `- kind: ${entry.kind}`,
    `- lines: ${entry.lines}`,
    `- bytes: ${entry.bytes}`,
    '',
    '## Summary',
    entry.summary,
    '',
    '## Imports',
    imports,
    '',
    '## Exports',
    exports,
    '',
    '## Source',
    `\`\`\`${entry.lang}`,
    entry.content.replace(/\u0000/g, ''),
    '\`\`\`',
    '',
  ].join('\n');
}

function renderCompactIndex(files) {
  return [
    '# AI Docs Compact Index',
    '',
    '> Start here first. Low-token map of the repository.',
    '',
    ...files.map((file) => `- \`${file.path}\` — ${file.kind}; ${file.lines} lines; ${file.summary}`),
    '',
  ].join('\n');
}

function renderIndex(files) {
  const groups = groupByTop(files);
  const largest = topFiles(files);
  return [
    '# AI Docs Index',
    '',
    '## Recommended reading order',
    '1. `README.md`',
    '2. `ai-docs/compact-index.md`',
    '3. `ai-docs/bundle-index.md`',
    '4. `ai-rules/12-council-deliberation.md`',
    '5. `ai-rules/13-live-council-runtime.md`',
    '6. open only the needed files in `ai-docs/bundles/` or `ai-docs/mirror/...`',
    '',
    '## Largest files to treat carefully',
    ...largest.map((file) => `- \`${file.path}\` — ${file.lines} lines`),
    '',
    '## Repository groups',
    ...groups.flatMap(([group, entries]) => [
      `### ${group}`,
      ...entries.map((file) => `- \`${file.path}\` — ${file.summary}`),
      '',
    ]),
  ].join('\n');
}

function findBundleFiles(files, bundle) {
  const set = new Set();
  for (const matcher of bundle.matchers) {
    for (const file of files) {
      if (file.path === matcher || file.path.startsWith(`${matcher}/`)) {
        set.add(file.path);
      }
    }
  }
  return files.filter((file) => set.has(file.path));
}

function renderBundle(bundle, files) {
  return [
    `# ${bundle.title}`,
    '',
    bundle.description,
    '',
    '## Included files',
    ...files.map((file) => `- \`${file.path}\` — ${file.summary}`),
    '',
    ...files.flatMap((file) => [
      `## ${file.path}`,
      '',
      `- kind: ${file.kind}`,
      `- lines: ${file.lines}`,
      `- summary: ${file.summary}`,
      '',
      `\`\`\`${file.lang}`,
      file.content.replace(/\u0000/g, ''),
      '\`\`\`',
      '',
    ]),
  ].join('\n');
}

function renderBundleIndex(bundleRecords) {
  return [
    '# AI Docs Bundle Index',
    '',
    '> Task-oriented entrypoints. Read one bundle instead of many raw files when possible.',
    '',
    ...bundleRecords.map((bundle) => `- \`${bundle.fileName}\` — ${bundle.description}; ${bundle.fileCount} files`),
    '',
  ].join('\n');
}

function main() {
  cleanDir(OUT_DIR);
  ensureDir(MIRROR_DIR);
  ensureDir(BUNDLES_DIR);

  const files = INCLUDE.flatMap((target) => walk(target)).map((file) => {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = rel(file);
    const ext = path.extname(file);
    return {
      path: relativePath,
      kind: ext ? ext.slice(1) : 'text',
      lang: fencedLang(ext),
      lines: countLines(content),
      bytes: Buffer.byteLength(content, 'utf8'),
      imports: ['.js', '.mjs', '.cjs'].includes(ext) ? extractImports(content) : [],
      exports: ['.js', '.mjs', '.cjs'].includes(ext) ? extractExports(content) : [],
      summary: extractHead(content, ext),
      content,
    };
  });

  const manifest = {
    generated_at: new Date().toISOString(),
    file_count: files.length,
    bundles: [],
    files: files.map((file) => ({
      path: file.path,
      kind: file.kind,
      lines: file.lines,
      bytes: file.bytes,
      imports: file.imports,
      exports: file.exports,
      summary: file.summary,
    })),
  };

  for (const file of files) {
    const out = toMirrorPath(file.path);
    ensureDir(path.dirname(out));
    fs.writeFileSync(out, renderMirror(file), 'utf8');
  }

  const bundleRecords = [];
  for (const bundle of BUNDLES) {
    const bundleFiles = findBundleFiles(files, bundle);
    const bundleFileName = `${bundle.name}.md`;
    fs.writeFileSync(path.join(BUNDLES_DIR, bundleFileName), renderBundle(bundle, bundleFiles), 'utf8');
    bundleRecords.push({
      fileName: `ai-docs/bundles/${bundleFileName}`,
      description: bundle.description,
      fileCount: bundleFiles.length,
    });
  }

  manifest.bundles = bundleRecords;

  fs.writeFileSync(path.join(OUT_DIR, 'compact-index.md'), renderCompactIndex(files), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'index.md'), renderIndex(files), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'bundle-index.md'), renderBundleIndex(bundleRecords), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`AI docs generated: ${files.length} files; bundles: ${bundleRecords.length}`);
}

main();
