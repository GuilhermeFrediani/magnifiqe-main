# src/dependency-resolution.js

- kind: js
- lines: 712
- bytes: 20608

## Summary
Stack Perfeita MCP — Dependency resolution helpers Monorepo/workspace-aware import and asset validation.

## Imports
- `./config.js`

## Exports
- `detectProjectContext`
- `validateFileDependencies`

## Source
```js
/**
 * Stack Perfeita MCP — Dependency resolution helpers
 * Monorepo/workspace-aware import and asset validation.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
} from "path";
import { NODE_BUILTINS } from "./config.js";

const IMPORT_EXTENSIONS = [
  "",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".node",
];

const LOCAL_ASSET_EXTENSIONS = [
  "",
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".json",
];


function readText(filePath) {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function readJson(filePath) {
  const content = readText(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function isDirectory(pathLike) {
  try {
    return statSync(pathLike).isDirectory();
  } catch {
    return false;
  }
}

function findNearestPackageRoot(startDir) {
  let current = resolve(startDir);
  for (let i = 0; i < 30; i++) {
    if (existsSync(join(current, "package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(startDir);
}

function hasWorkspaceConfig(pkg) {
  return Array.isArray(pkg?.workspaces) || Array.isArray(pkg?.workspaces?.packages);
}

function findWorkspaceRoot(startDir) {
  let current = resolve(startDir);
  let found = null;

  for (let i = 0; i < 30; i++) {
    const pkg = readJson(join(current, "package.json"));
    if (pkg && hasWorkspaceConfig(pkg)) {
      found = current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return found;
}

function normalizeWorkspacePatterns(pkg) {
  if (Array.isArray(pkg?.workspaces)) return pkg.workspaces;
  if (Array.isArray(pkg?.workspaces?.packages)) return pkg.workspaces.packages;
  return [];
}

function expandWorkspacePattern(root, pattern) {
  const normalized = String(pattern || "").replace(/\\/g, "/").replace(/\/$/, "");
  if (!normalized) return [];

  if (!normalized.includes("*")) {
    const direct = resolve(root, normalized);
    return existsSync(join(direct, "package.json")) ? [direct] : [];
  }

  const parts = normalized.split("/");
  const starIndex = parts.indexOf("*");
  if (starIndex === -1) return [];

  const prefix = parts.slice(0, starIndex).join("/");
  const suffix = parts.slice(starIndex + 1).join("/");
  const baseDir = resolve(root, prefix || ".");
  if (!isDirectory(baseDir)) return [];

  const results = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = suffix
      ? resolve(baseDir, entry.name, suffix)
      : resolve(baseDir, entry.name);
    if (existsSync(join(candidate, "package.json"))) {
      results.push(candidate);
    }
  }

  return results;
}

function loadWorkspacePackages(workspaceRoot, packageRoot) {
  const packages = new Map();
  const roots = new Set();

  if (packageRoot && existsSync(join(packageRoot, "package.json"))) {
    roots.add(packageRoot);
  }

  if (workspaceRoot) {
    const workspacePkg = readJson(join(workspaceRoot, "package.json"));
    for (const pattern of normalizeWorkspacePatterns(workspacePkg)) {
      for (const candidate of expandWorkspacePattern(workspaceRoot, pattern)) {
        roots.add(candidate);
      }
    }
  }

  for (const root of roots) {
    const pkg = readJson(join(root, "package.json"));
    if (pkg?.name) {
      packages.set(pkg.name, {
        name: pkg.name,
        root,
        packageJson: pkg,
      });
    }
  }

  return packages;
}

function resolveExtendsPath(configPath, extendsValue) {
  if (!extendsValue) return null;
  if (extendsValue.startsWith(".")) {
    return resolve(dirname(configPath), extendsValue.endsWith(".json") ? extendsValue : `${extendsValue}.json`);
  }
  if (isAbsolute(extendsValue)) {
    return extendsValue;
  }

  const withJson = extendsValue.endsWith(".json") ? extendsValue : `${extendsValue}.json`;
  let current = dirname(configPath);
  for (let i = 0; i < 20; i++) {
    const candidate = resolve(current, "node_modules", withJson);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function mergeCompilerOptions(base = {}, extra = {}) {
  return {
    ...base,
    ...extra,
    paths: {
      ...(base.paths || {}),
      ...(extra.paths || {}),
    },
  };
}

function loadTsLikeConfig(configPath, seen = new Set()) {
  const resolved = resolve(configPath);
  if (!existsSync(resolved) || seen.has(resolved)) return null;
  seen.add(resolved);

  const raw = readJson(resolved);
  if (!raw) return null;

  let compilerOptions = {};
  if (raw.extends) {
    const parentPath = resolveExtendsPath(resolved, raw.extends);
    const parentConfig = parentPath ? loadTsLikeConfig(parentPath, seen) : null;
    if (parentConfig?.compilerOptions) {
      compilerOptions = mergeCompilerOptions(compilerOptions, parentConfig.compilerOptions);
    }
  }

  compilerOptions = mergeCompilerOptions(compilerOptions, raw.compilerOptions || {});

  return {
    path: resolved,
    compilerOptions,
  };
}

function normalizeReplacement(baseDir, replacement) {
  const value = String(replacement || "").trim();
  if (!value) return null;

  const newUrlMatch = value.match(/new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/);
  if (newUrlMatch) {
    return resolve(baseDir, newUrlMatch[1]);
  }

  const fileUrlMatch = value.match(/fileURLToPath\(\s*new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)\s*\)/);
  if (fileUrlMatch) {
    return resolve(baseDir, fileUrlMatch[1]);
  }

  const pathResolveMatch = value.match(/(?:path\.)?resolve\(\s*__dirname\s*,\s*['"]([^'"]+)['"]\s*\)/);
  if (pathResolveMatch) {
    return resolve(baseDir, pathResolveMatch[1]);
  }

  const plainStringMatch = value.match(/^['"]([^'"]+)['"]$/);
  if (plainStringMatch) {
    const candidate = plainStringMatch[1];
    return isAbsolute(candidate) ? candidate : resolve(baseDir, candidate);
  }

  return null;
}

function extractViteAliasesFromContent(content, configPath) {
  const aliases = [];
  const baseDir = dirname(configPath);

  const objectRegex = /['"]([^'"]+)['"]\s*:\s*(fileURLToPath\(\s*new\s+URL\(\s*['"][^'"]+['"]\s*,\s*import\.meta\.url\s*\)\s*\)|new\s+URL\(\s*['"][^'"]+['"]\s*,\s*import\.meta\.url\s*\)|(?:path\.)?resolve\(\s*__dirname\s*,\s*['"][^'"]+['"]\s*\)|['"][^'"]+['"])/g;
  let match;
  while ((match = objectRegex.exec(content)) !== null) {
    const find = match[1];
    const replacement = normalizeReplacement(baseDir, match[2]);
    if (replacement) aliases.push({ find, replacement, source: basename(configPath) });
  }

  const arrayRegex = /find\s*:\s*['"]([^'"]+)['"][\s\S]{0,200}?replacement\s*:\s*(fileURLToPath\(\s*new\s+URL\(\s*['"][^'"]+['"]\s*,\s*import\.meta\.url\s*\)\s*\)|new\s+URL\(\s*['"][^'"]+['"]\s*,\s*import\.meta\.url\s*\)|(?:path\.)?resolve\(\s*__dirname\s*,\s*['"][^'"]+['"]\s*\)|['"][^'"]+['"])/g;
  while ((match = arrayRegex.exec(content)) !== null) {
    const find = match[1];
    const replacement = normalizeReplacement(baseDir, match[2]);
    if (replacement) aliases.push({ find, replacement, source: basename(configPath) });
  }

  const deduped = [];
  const seen = new Set();
  for (const alias of aliases) {
    const key = `${alias.find}:${alias.replacement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alias);
  }

  return deduped;
}

function loadViteAliases(packageRoot, workspaceRoot) {
  const candidates = new Set();
  const configNames = [
    "vite.config.js",
    "vite.config.ts",
    "vite.config.mjs",
    "vite.config.cjs",
    "vitest.config.js",
    "vitest.config.ts",
    "vitest.config.mjs",
    "vitest.config.cjs",
  ];

  for (const root of [packageRoot, workspaceRoot]) {
    if (!root) continue;
    for (const name of configNames) {
      const candidate = join(root, name);
      if (existsSync(candidate)) candidates.add(candidate);
    }
  }

  const aliases = [];
  for (const configPath of candidates) {
    const content = readText(configPath);
    if (!content) continue;
    aliases.push(...extractViteAliasesFromContent(content, configPath));
  }
  return aliases;
}

function candidateExists(basePath, extensions = IMPORT_EXTENSIONS) {
  if (!basePath) return false;
  if (existsSync(basePath)) return true;

  for (const ext of extensions) {
    if (ext && existsSync(basePath + ext)) return true;
  }

  const indexCandidates = [
    "index.js",
    "index.jsx",
    "index.ts",
    "index.tsx",
    "index.mjs",
    "index.cjs",
    "index.json",
  ];
  for (const file of indexCandidates) {
    if (existsSync(join(basePath, file))) return true;
  }

  return false;
}

function resolveExportTarget(packageRoot, target) {
  if (!target) return null;
  if (typeof target === "string") {
    if (target.startsWith("./")) return resolve(packageRoot, target);
    return resolve(packageRoot, target);
  }
  if (Array.isArray(target)) {
    for (const entry of target) {
      const resolved = resolveExportTarget(packageRoot, entry);
      if (resolved) return resolved;
    }
    return null;
  }
  if (typeof target === "object") {
    const priority = ["import", "default", "module", "node", "require", "types"];
    for (const key of priority) {
      if (key in target) {
        const resolved = resolveExportTarget(packageRoot, target[key]);
        if (resolved) return resolved;
      }
    }
    for (const value of Object.values(target)) {
      const resolved = resolveExportTarget(packageRoot, value);
      if (resolved) return resolved;
    }
  }
  return null;
}

function resolvePackageExports(packageRoot, packageJson, subpath) {
  const exportsField = packageJson?.exports;
  if (!exportsField) return null;

  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    if (!subpath) return resolveExportTarget(packageRoot, exportsField);
    return null;
  }

  const exportKey = subpath ? `./${subpath}` : ".";
  if (exportKey in exportsField) {
    return resolveExportTarget(packageRoot, exportsField[exportKey]);
  }

  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.includes("*")) continue;
    const regex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\*", "(.+)")}$`);
    const match = exportKey.match(regex);
    if (!match) continue;
    const target = resolveExportTarget(packageRoot, value);
    if (!target) continue;
    const replaced = target.replace("*", match[1]);
    return replaced;
  }

  return null;
}

function resolvePackageEntry(packageRoot, packageJson, subpath = "") {
  const exportMatch = resolvePackageExports(packageRoot, packageJson, subpath);
  if (exportMatch && candidateExists(exportMatch)) return exportMatch;

  if (!subpath) {
    const roots = [
      packageJson?.source,
      packageJson?.module,
      packageJson?.main,
      packageJson?.types,
      "index.js",
      "index.ts",
      "src/index.ts",
      "src/index.tsx",
      "src/index.js",
      "src/index.jsx",
    ].filter(Boolean);

    for (const entry of roots) {
      const candidate = resolve(packageRoot, entry);
      if (candidateExists(candidate)) return candidate;
    }
    return null;
  }

  const directCandidates = [
    resolve(packageRoot, subpath),
    resolve(packageRoot, `${subpath}.js`),
    resolve(packageRoot, `${subpath}.ts`),
    resolve(packageRoot, `${subpath}.tsx`),
    resolve(packageRoot, "src", subpath),
    resolve(packageRoot, "src", `${subpath}.ts`),
    resolve(packageRoot, "src", `${subpath}.tsx`),
    resolve(packageRoot, "src", `${subpath}.js`),
  ];

  for (const candidate of directCandidates) {
    if (candidateExists(candidate)) return candidate;
  }

  return null;
}

function splitPackageSpecifier(specifier) {
  const normalized = String(specifier || "");
  if (normalized.startsWith("@")) {
    const [scope, name, ...rest] = normalized.split("/");
    return {
      packageName: [scope, name].filter(Boolean).join("/"),
      subpath: rest.join("/"),
    };
  }

  const [name, ...rest] = normalized.split("/");
  return {
    packageName: name,
    subpath: rest.join("/"),
  };
}

function resolveAliasSpecifier(specifier, aliases, baseDirs) {
  for (const alias of aliases) {
    if (specifier === alias.find || specifier.startsWith(`${alias.find}/`)) {
      const rest = specifier === alias.find ? "" : specifier.slice(alias.find.length + 1);
      const candidate = rest ? resolve(alias.replacement, rest) : alias.replacement;
      if (candidateExists(candidate)) {
        return { found: true, via: `alias:${alias.find}`, resolved: candidate };
      }
    }
  }

  for (const baseDir of baseDirs) {
    const candidate = resolve(baseDir, specifier);
    if (candidateExists(candidate)) {
      return { found: true, via: "baseUrl", resolved: candidate };
    }
  }

  return { found: false };
}

function findNodeModulesPackage(packageName, startDir) {
  let current = resolve(startDir);
  for (let i = 0; i < 25; i++) {
    const candidate = join(current, "node_modules", packageName);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function detectProjectContext(filePath) {
  const fileDir = dirname(resolve(filePath));
  const packageRoot = findNearestPackageRoot(fileDir);
  const workspaceRoot = findWorkspaceRoot(fileDir) || packageRoot;
  const packageJson = readJson(join(packageRoot, "package.json"));
  const workspacePackages = loadWorkspacePackages(workspaceRoot, packageRoot);

  const aliasEntries = [];
  const baseDirs = [];
  const configCandidates = [
    join(workspaceRoot, "tsconfig.json"),
    join(workspaceRoot, "jsconfig.json"),
    join(packageRoot, "tsconfig.json"),
    join(packageRoot, "jsconfig.json"),
  ];

  for (const configPath of configCandidates) {
    const cfg = loadTsLikeConfig(configPath);
    if (!cfg) continue;
    const cfgDir = dirname(cfg.path);
    const compilerOptions = cfg.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl
      ? resolve(cfgDir, compilerOptions.baseUrl)
      : cfgDir;
    if (baseUrl && !baseDirs.includes(baseUrl)) baseDirs.push(baseUrl);

    for (const [aliasPattern, targets] of Object.entries(compilerOptions.paths || {})) {
      const find = aliasPattern.replace(/\/\*$/, "");
      const values = Array.isArray(targets) ? targets : [targets];
      for (const value of values) {
        const target = String(value).replace(/\/\*$/, "");
        aliasEntries.push({
          find,
          replacement: resolve(baseUrl, target),
          source: basename(cfg.path),
        });
      }
    }
  }

  aliasEntries.push(...loadViteAliases(packageRoot, workspaceRoot));

  const dedupedAliases = [];
  const seen = new Set();
  for (const alias of aliasEntries) {
    const key = `${alias.find}:${alias.replacement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedAliases.push(alias);
  }

  return {
    filePath: resolve(filePath),
    fileDir,
    packageRoot,
    workspaceRoot,
    packageJson,
    workspacePackages,
    aliases: dedupedAliases,
    baseDirs,
  };
}

function resolveSpecifier(specifier, context) {
  if (!specifier) return { found: false, via: "empty" };
  if (specifier.startsWith("http://") || specifier.startsWith("https://") || specifier.startsWith("//")) {
    return { found: true, via: "remote-url" };
  }

  if (specifier.startsWith("data:") || specifier.startsWith("#")) {
    return { found: true, via: "inline" };
  }

  if (specifier.startsWith(".")) {
    const candidate = resolve(context.fileDir, specifier);
    return candidateExists(candidate)
      ? { found: true, via: "relative", resolved: candidate }
      : { found: false, via: "relative" };
  }

  if (specifier.startsWith("~/")) {
    const candidate = resolve(context.packageRoot, specifier.slice(2));
    return candidateExists(candidate)
      ? { found: true, via: "tilde-root", resolved: candidate }
      : { found: false, via: "tilde-root" };
  }

  if (NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(splitPackageSpecifier(specifier).packageName)) {
    return { found: true, via: "builtin" };
  }

  const aliasResult = resolveAliasSpecifier(specifier, context.aliases, context.baseDirs);
  if (aliasResult.found) return aliasResult;

  const { packageName, subpath } = splitPackageSpecifier(specifier);

  const workspacePackage = context.workspacePackages.get(packageName);
  if (workspacePackage) {
    const resolvedWorkspace = resolvePackageEntry(workspacePackage.root, workspacePackage.packageJson, subpath);
    if (resolvedWorkspace) {
      return { found: true, via: "workspace-package", resolved: resolvedWorkspace };
    }
    return { found: false, via: "workspace-package" };
  }

  if (context.packageJson?.name === packageName) {
    const selfResolved = resolvePackageEntry(context.packageRoot, context.packageJson, subpath);
    if (selfResolved) {
      return { found: true, via: "self-package", resolved: selfResolved };
    }
    return { found: false, via: "self-package" };
  }

  const installedPackageRoot = findNodeModulesPackage(packageName, context.fileDir);
  if (!installedPackageRoot) {
    return { found: false, via: "node_modules" };
  }

  const installedPkg = readJson(join(installedPackageRoot, "package.json")) || {};
  const installedResolved = resolvePackageEntry(installedPackageRoot, installedPkg, subpath);
  if (installedResolved) {
    return { found: true, via: "node_modules", resolved: installedResolved };
  }

  return { found: false, via: "node_modules" };
}

function extractReferences(content) {
  const refs = [];
  const patterns = [
    { regex: /import\s+(?:[\w{},*\s]+\s+from\s+)?['"]([^'"]+)['"]/g, label: "import" },
    { regex: /export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g, label: "export-from" },
    { regex: /require\(\s*['"]([^'"]+)['"]\s*\)/g, label: "require" },
    { regex: /import\(\s*['"]([^'"]+)['"]\s*\)/g, label: "dynamic-import" },
  ];

  for (const { regex, label } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      refs.push({ kind: label, value: match[1] });
    }
  }

  let match;
  const scriptRegex = /<script\s+[^>]*src=['"]([^'"]+)['"]/g;
  while ((match = scriptRegex.exec(content)) !== null) {
    refs.push({ kind: "html-script", value: match[1], asset: true });
  }

  const linkRegex = /<link\s+[^>]*href=['"]([^'"]+)['"]/g;
  while ((match = linkRegex.exec(content)) !== null) {
    refs.push({ kind: "html-link", value: match[1], asset: true });
  }

  const imgRegex = /<(?:img|source)\s+[^>]*(?:src|srcset)=['"]([^'"]+)['"]/g;
  while ((match = imgRegex.exec(content)) !== null) {
    refs.push({ kind: "html-asset", value: match[1].split(",")[0].trim().split(/\s+/)[0], asset: true });
  }

  return refs;
}

function resolveAssetReference(value, context) {
  if (!value || value.startsWith("http") || value.startsWith("//") || value.startsWith("data:") || value.startsWith("#")) {
    return { found: true, via: "asset-inline" };
  }

  const candidate = value.startsWith("/")
    ? resolve(context.packageRoot, `.${value}`)
    : resolve(context.fileDir, value);

  return candidateExists(candidate, LOCAL_ASSET_EXTENSIONS)
    ? { found: true, via: "asset", resolved: candidate }
    : { found: false, via: "asset" };
}

export function validateFileDependencies(filePath, content) {
  const context = detectProjectContext(filePath);
  const source = content ?? readText(resolve(filePath)) ?? "";
  const references = extractReferences(source);
  const missing = [];

  for (const ref of references) {
    const resolution = ref.asset
      ? resolveAssetReference(ref.value, context)
      : resolveSpecifier(ref.value, context);

    if (!resolution.found) {
      missing.push({
        label: `${ref.kind} "${ref.value}"`,
        via: resolution.via,
      });
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    stats: {
      aliases: context.aliases.length,
      workspaces: context.workspacePackages.size,
      baseDirs: context.baseDirs.length,
      references: references.length,
    },
    context,
  };
}

```
