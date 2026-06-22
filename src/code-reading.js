/**
 * Stack Perfeita MCP — Code Reading tools
 * smart_outline, smart_unfold, smart_read MCP tool registrations.
 * Babel parser first, acorn-loose fallback, regex last.
 */

import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";
import { readFile, validateAbsolutePath } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";
import { parse as parseLoose } from "acorn-loose";
import { parse as parseBabel } from "@babel/parser";

const SYMBOL_PATTERNS = {
  js: [
    { regex: /^(export\s+)?(default\s+)?(async\s+)?function\s+(?<name>\w+)\s*\([^)]*\)/m, kind: "function" },
    { regex: /^(export\s+)?(default\s+)?(async\s+)?function\s*\*\s*(?<name>\w+)\s*\([^)]*\)/m, kind: "generator" },
    { regex: /^(export\s+)?(default\s+)?const\s+(?<name>\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/m, kind: "arrow" },
    { regex: /^(export\s+)?(default\s+)?const\s+(?<name>\w+)\s*=\s*(async\s+)?function/m, kind: "function-expr" },
    { regex: /^(export\s+)?(default\s+)?class\s+(?<name>\w+)/m, kind: "class" },
    { regex: /^(export\s+)?(default\s+)?interface\s+(?<name>\w+)/m, kind: "interface" },
    { regex: /^(export\s+)?type\s+(?<name>\w+)\s*=/m, kind: "type" },
    { regex: /^(export\s+)?enum\s+(?<name>\w+)/m, kind: "enum" },
    { regex: /^\s+(async\s+)?(?<name>\w+)\s*\([^)]*\)\s*\{/m, kind: "method" },
  ],
  py: [
    { regex: /^(export\s+)?@(\w+)/m, kind: "decorator" },
    { regex: /^(async\s+)?def\s+(?<name>\w+)\s*\(/m, kind: "function" },
    { regex: /^class\s+(?<name>\w+)/m, kind: "class" },
    { regex: /^(?<name>\w+)\s*=\s*(lambda|async\s+lambda)/m, kind: "lambda" },
  ],
  rust: [
    { regex: /^(pub\s+)?(async\s+)?fn\s+(?<name>\w+)/m, kind: "function" },
    { regex: /^(pub\s+)?struct\s+(?<name>\w+)/m, kind: "struct" },
    { regex: /^(pub\s+)?enum\s+(?<name>\w+)/m, kind: "enum" },
    { regex: /^(pub\s+)?trait\s+(?<name>\w+)/m, kind: "trait" },
    { regex: /^(pub\s+)?impl\s+(?<name>\w+)/m, kind: "impl" },
    { regex: /^(pub\s+)?type\s+(?<name>\w+)/m, kind: "type" },
    { regex: /^(pub\s+)?const\s+(?<name>\w+)/m, kind: "const" },
    { regex: /^(pub\s+)?static\s+(?<name>\w+)/m, kind: "static" },
    { regex: /^#\[cfg\(/m, kind: "attribute" },
  ],
  go: [
    { regex: /^func\s+(?:\([^)]+\)\s+)?(?<name>\w+)\s*\(/m, kind: "function" },
    { regex: /^func\s+(?<name>\w+)\s*\(/m, kind: "function" },
    { regex: /^type\s+(?<name>\w+)\s+struct/m, kind: "struct" },
    { regex: /^type\s+(?<name>\w+)\s+interface/m, kind: "interface" },
    { regex: /^type\s+(?<name>\w+)\s+/m, kind: "type" },
    { regex: /^(?:var|const)\s+(?<name>\w+)/m, kind: "variable" },
    { regex: /^func\s+\([^)]+\)\s+(?<name>\w+)\s*\(/m, kind: "method" },
  ],
  java: [
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?(?<name>\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/m, kind: "method" },
    { regex: /^(?:public|private|protected)?\s*class\s+(?<name>\w+)/m, kind: "class" },
    { regex: /^(?:public|private|protected)?\s*interface\s+(?<name>\w+)/m, kind: "interface" },
    { regex: /^(?:public|private|protected)?\s*enum\s+(?<name>\w+)/m, kind: "enum" },
    { regex: /^(?:public|private|protected)?\s*record\s+(?<name>\w+)/m, kind: "record" },
    { regex: /^@\w+/m, kind: "annotation" },
  ],
  csharp: [
    { regex: /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:<[^>]+>\s+)?(?<name>\w+)\s*\([^)]*\)/m, kind: "method" },
    { regex: /^(?:public|private|protected|internal)?\s*class\s+(?<name>\w+)/m, kind: "class" },
    { regex: /^(?:public|private|protected|internal)?\s*interface\s+(?<name>\w+)/m, kind: "interface" },
    { regex: /^(?:public|private|protected|internal)?\s*struct\s+(?<name>\w+)/m, kind: "struct" },
    { regex: /^(?:public|private|protected|internal)?\s*enum\s+(?<name>\w+)/m, kind: "enum" },
    { regex: /^(?:public|private|protected|internal)?\s*record\s+(?<name>\w+)/m, kind: "record" },
    { regex: /^\[.+\]/m, kind: "attribute" },
  ],
};

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "else", "return", "throw", "new", "try", "do"]);

export function getFileLang(filePath) {
  if (/\.(js|ts|jsx|tsx|mjs|cjs|mts|cts)$/.test(filePath)) return "js";
  if (/\.py$/.test(filePath)) return "py";
  if (/\.rs$/.test(filePath)) return "rust";
  if (/\.go$/.test(filePath)) return "go";
  if (/\.java$/.test(filePath)) return "java";
  if (/\.(cs|csx)$/.test(filePath)) return "csharp";
  return null;
}

function getBabelPlugins(content) {
  const plugins = [
    "jsx",
    "typescript",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "decorators-legacy",
    "dynamicImport",
    "topLevelAwait",
    "importAttributes",
  ];

  if (/^\s*</m.test(content) || /<\/?[A-Z][A-Za-z0-9]*/.test(content)) {
    plugins.push("jsx");
  }

  return [...new Set(plugins)];
}

function parseJsAst(content) {
  try {
    const ast = parseBabel(content, {
      sourceType: "unambiguous",
      errorRecovery: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      plugins: getBabelPlugins(content),
    });
    annotateParents(ast, null);
    return {
      engine: "babel",
      ast,
    };
  } catch {
    // fall through to acorn-loose
  }

  try {
    const ast = parseLoose(content, { ecmaVersion: 2025, sourceType: "module", locations: true });
    annotateParents(ast, null);
    return {
      engine: "acorn-loose",
      ast,
    };
  } catch {
    return null;
  }
}

function isNode(value) {
  return value && typeof value === "object" && typeof value.type === "string";
}

function walkAst(node, visit, parent = null) {
  if (!isNode(node)) return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (["loc", "range", "start", "end", "extra", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const entry of child) walkAst(entry, visit, node);
    } else if (isNode(child)) {
      walkAst(child, visit, node);
    }
  }
}

function nodeLine(node, content) {
  if (node?.loc?.start?.line) return node.loc.start.line;
  if (typeof node?.start === "number") return content.slice(0, node.start).split("\n").length;
  return 0;
}

function nodeName(node) {
  if (!node) return null;
  if (typeof node.name === "string") return node.name;
  if (typeof node.value === "string") return node.value;
  if (node.type === "PrivateName") return node.id?.name || null;
  return null;
}

function functionName(node, parent) {
  if (!node) return null;
  if (node.id?.name) return node.id.name;
  if (parent?.type === "VariableDeclarator") return nodeName(parent.id);
  if (parent?.type === "ObjectProperty") return nodeName(parent.key);
  if (parent?.type === "ClassProperty") return nodeName(parent.key);
  if (parent?.type === "ClassPrivateProperty") return nodeName(parent.key);
  return null;
}

function signatureForLine(lines, line, fallback) {
  return lines[line - 1]?.trim() || fallback;
}

function pushSymbol(symbols, seen, entry) {
  if (!entry?.name || KEYWORDS.has(entry.name)) return;
  const key = `${entry.name}:${entry.kind}:${entry.line}`;
  if (seen.has(key)) return;
  seen.add(key);
  symbols.push(entry);
}

export function extractSymbolsAST(content) {
  const parsed = parseJsAst(content);
  if (!parsed) return [];

  const symbols = [];
  const seen = new Set();
  const lines = content.split("\n");

  walkAst(parsed.ast, (node, _parent) => {
    const line = nodeLine(node, content);

    switch (node.type) {
      case "FunctionDeclaration":
      case "TSDeclareFunction": {
        const name = node.id?.name;
        pushSymbol(symbols, seen, {
          name,
          kind: node.async ? "async-function" : "function",
          line,
          signature: signatureForLine(lines, line, name || "function"),
        });
        break;
      }
      case "ClassDeclaration": {
        const name = node.id?.name;
        pushSymbol(symbols, seen, {
          name,
          kind: "class",
          line,
          signature: signatureForLine(lines, line, name ? `class ${name}` : "class"),
        });
        break;
      }
      case "VariableDeclarator": {
        const name = nodeName(node.id);
        const initType = node.init?.type;
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(initType)) {
          pushSymbol(symbols, seen, {
            name,
            kind: initType === "ArrowFunctionExpression" ? "arrow" : "function-expr",
            line,
            signature: signatureForLine(lines, line, name || "function"),
          });
        }
        break;
      }
      case "ClassMethod":
      case "ClassPrivateMethod":
      case "ObjectMethod": {
        const name = nodeName(node.key);
        pushSymbol(symbols, seen, {
          name,
          kind: "method",
          line,
          signature: signatureForLine(lines, line, name || "method"),
        });
        break;
      }
      case "ClassProperty":
      case "ClassPrivateProperty": {
        const name = nodeName(node.key);
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(node.value?.type)) {
          pushSymbol(symbols, seen, {
            name,
            kind: node.value.type === "ArrowFunctionExpression" ? "arrow" : "function-expr",
            line,
            signature: signatureForLine(lines, line, name || "function"),
          });
        }
        break;
      }
      case "TSInterfaceDeclaration": {
        const name = node.id?.name;
        pushSymbol(symbols, seen, {
          name,
          kind: "interface",
          line,
          signature: signatureForLine(lines, line, name ? `interface ${name}` : "interface"),
        });
        break;
      }
      case "TSTypeAliasDeclaration": {
        const name = node.id?.name;
        pushSymbol(symbols, seen, {
          name,
          kind: "type",
          line,
          signature: signatureForLine(lines, line, name ? `type ${name}` : "type"),
        });
        break;
      }
      case "TSEnumDeclaration": {
        const name = node.id?.name;
        pushSymbol(symbols, seen, {
          name,
          kind: "enum",
          line,
          signature: signatureForLine(lines, line, name ? `enum ${name}` : "enum"),
        });
        break;
      }
      default:
        break;
    }
  });

  return symbols;
}

function extractSymbolsRegex(content, lang) {
  const patterns = SYMBOL_PATTERNS[lang] || [];
  const symbols = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      const match = lines[i].match(p.regex);
      if (!match) continue;
      const name = match.groups?.name;
      if (name && !KEYWORDS.has(name)) {
        symbols.push({ name, kind: p.kind, line: i + 1, signature: lines[i].trim() });
      }
    }
  }

  return symbols;
}

export function extractSymbols(content, lang) {
  if (lang === "js") {
    const astSymbols = extractSymbolsAST(content);
    if (astSymbols.length > 0) return astSymbols;
  }
  return extractSymbolsRegex(content, lang);
}

function nodeBodyRange(node, content) {
  const startLine = nodeLine(node, content);
  const endLine = node?.loc?.end?.line || (typeof node?.end === "number" ? content.slice(0, node.end).split("\n").length : startLine);
  return { startLine, endLine };
}

export function extractSymbolBody(content, symbolName, lang) {
  const lines = content.split("\n");
  const patterns = SYMBOL_PATTERNS[lang] || [];

  if (lang === "js") {
    const parsed = parseJsAst(content);
    if (parsed) {
      let found = null;

      walkAst(parsed.ast, (node, parent) => {
        if (found) return;

        if (["FunctionDeclaration", "TSDeclareFunction", "ClassDeclaration", "ClassMethod", "ClassPrivateMethod", "ObjectMethod", "ClassProperty", "ClassPrivateProperty", "VariableDeclarator"].includes(node.type)) {
          let name;
          let targetNode = node;

          if (node.type === "VariableDeclarator") {
            if (!["ArrowFunctionExpression", "FunctionExpression"].includes(node.init?.type)) return;
            name = nodeName(node.id);
            targetNode = parent?.type === "VariableDeclaration" ? parent : node;
          } else if (["ClassProperty", "ClassPrivateProperty"].includes(node.type)) {
            if (!["ArrowFunctionExpression", "FunctionExpression"].includes(node.value?.type)) return;
            name = nodeName(node.key);
          } else if (["ClassMethod", "ClassPrivateMethod", "ObjectMethod"].includes(node.type)) {
            name = nodeName(node.key);
          } else {
            name = functionName(node, parent) || node.id?.name || null;
          }

          if (name === symbolName) {
            found = targetNode;
          }
        }
      });

      if (found && (found.loc || (typeof found.start === "number" && typeof found.end === "number"))) {
        const { startLine, endLine } = nodeBodyRange(found, content);
        return {
          startLine,
          endLine,
          signature: lines[startLine - 1]?.trim() || symbolName,
          body: lines.slice(startLine - 1, endLine).join("\n"),
        };
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      const match = lines[i].match(p.regex);
      if (match && match.groups?.name === symbolName) {
        const startLine = i;
        let endLine = i;

        if (lang === "py") {
          const baseIndent = lines[i].search(/\S/);
          for (let j = i + 1; j < lines.length; j++) {
            const lineIndent = lines[j].search(/\S/);
            if (lineIndent <= baseIndent && lines[j].trim() !== "") break;
            endLine = j;
          }
        } else {
          let depth = 0;
          let foundOpen = false;
          for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
              if (ch === "{") { depth++; foundOpen = true; }
              if (ch === "}") depth--;
            }
            endLine = j;
            if (foundOpen && depth === 0) break;
          }
        }

        return {
          startLine: startLine + 1,
          endLine: endLine + 1,
          signature: lines[i].trim(),
          body: lines.slice(startLine, endLine + 1).join("\n"),
        };
      }
    }
  }

  return null;
}

function hasExplicitReturnType(node) {
  return Boolean(
    node?.returnType ||
    node?.typeAnnotation ||
    node?.id?.typeAnnotation ||
    node?.value?.returnType ||
    node?.value?.typeAnnotation
  );
}

function complexityIncrement(node) {
  if (!node) return 0;
  if (["IfStatement", "ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement", "CatchClause", "ConditionalExpression"].includes(node.type)) {
    return 1;
  }
  if (node.type === "SwitchCase" && node.test) return 1;
  if (node.type === "LogicalExpression" && ["&&", "||", "??"].includes(node.operator)) return 1;
  return 0;
}

function isBlockLike(node) {
  return ["BlockStatement", "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement", "SwitchStatement", "TryStatement", "CatchClause"].includes(node?.type);
}

export function analyzeCodeMetrics(content) {
  const lines = content.split("\n");
  const metrics = {
    lineCount: lines.length,
    functions: [],
    maxNesting: 0,
  };

  const parsed = parseJsAst(content);
  if (!parsed) return metrics;

  walkAst(parsed.ast, (node, parent) => {
    if (!["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod", "ClassPrivateMethod"].includes(node.type)) return;

    const name = functionName(node, parent) || (node.type === "ArrowFunctionExpression" ? "<arrow>" : "<anonymous>");
    const startLine = nodeLine(node, content);
    const endLine = node?.loc?.end?.line || startLine;
    const funcLines = endLine - startLine + 1;

    let complexity = 1;
    let localMaxDepth = 0;

    walkAst(node.body || node, (inner, innerParent) => {
      complexity += complexityIncrement(inner);

      let depth = 0;
      let cursor = innerParent;
      while (cursor) {
        if (isBlockLike(cursor)) depth++;
        cursor = cursor.__parent || null;
      }
      localMaxDepth = Math.max(localMaxDepth, depth);
    });

    metrics.maxNesting = Math.max(metrics.maxNesting, localMaxDepth);
    metrics.functions.push({
      name,
      startLine,
      endLine,
      lines: funcLines,
      complexity,
      hasReturnType: hasExplicitReturnType(node),
    });
  });

  return metrics;
}

function annotateParents(node, parent = null) {
  if (!isNode(node)) return;
  Object.defineProperty(node, "__parent", {
    value: parent,
    enumerable: false,
    configurable: true,
  });
  for (const key of Object.keys(node)) {
    if (["loc", "range", "start", "end", "extra", "leadingComments", "trailingComments", "innerComments", "__parent"].includes(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const entry of child) annotateParents(entry, node);
    } else if (isNode(child)) {
      annotateParents(child, node);
    }
  }
}

export function registerCodeReadingTools(server) {
  server.tool(
    "smart_outline",
    "Get structural outline of a file — shows all symbols (functions, classes, methods, types) with signatures. Uses Babel parsing for JS/TS/JSX first, acorn-loose fallback, then regex. Supports JS/TS/Python.",
    { file_path: z.string().describe("Absolute path to the source file to outline.") },
    async ({ file_path }) => {
      const rateLimitHit = rateLimiter.check("smart_outline");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const absPath = validateAbsolutePath(file_path);
        if (!existsSync(absPath)) {
          return { content: [{ type: "text", text: `HALT — File does not exist: ${absPath}` }] };
        }

        const content = readFile(absPath);
        if (!content) {
          return { content: [{ type: "text", text: `HALT — Cannot read file: ${absPath}` }] };
        }

        const lang = getFileLang(absPath);
        if (!lang) {
          return { content: [{ type: "text", text: `Unsupported language for: ${absPath}\nSupported: .js, .ts, .jsx, .tsx, .mjs, .cjs, .mts, .cts, .py` }] };
        }

        const symbols = extractSymbols(content, lang);
        if (symbols.length === 0) {
          return { content: [{ type: "text", text: `No symbols found in: ${absPath}` }] };
        }

        const lines = symbols.map((s) => `L${s.line}: [${s.kind}] ${s.signature}`);
        return {
          content: [{
            type: "text",
            text: `## Outline: ${absPath}\n\n${lines.join("\n")}\n\n${symbols.length} symbol(s). Use smart_unfold(path, symbol_name) to read a specific symbol's body.`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in smart_outline: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "smart_unfold",
    "Expand a specific symbol (function, class, method) from a file. Returns the full source code of just that symbol. Uses AST-first extraction. Supports JS/TS/Python.",
    {
      file_path: z.string().describe("Absolute path to the source file."),
      symbol_name: z.string().describe("Name of the symbol to unfold (function, class, method, etc.)"),
    },
    async ({ file_path, symbol_name }) => {
      const rateLimitHit = rateLimiter.check("smart_unfold");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const absPath = validateAbsolutePath(file_path);
        if (!existsSync(absPath)) {
          return { content: [{ type: "text", text: `HALT — File does not exist: ${absPath}` }] };
        }

        const content = readFile(absPath);
        if (!content) {
          return { content: [{ type: "text", text: `HALT — Cannot read file: ${absPath}` }] };
        }

        const lang = getFileLang(absPath);
        if (!lang) {
          return { content: [{ type: "text", text: `Unsupported language for: ${absPath}` }] };
        }

        const result = extractSymbolBody(content, symbol_name, lang);
        if (!result) {
          const symbols = extractSymbols(content, lang);
          const available = symbols.map((s) => `  - ${s.name} (${s.kind})`).join("\n");
          return {
            content: [{
              type: "text",
              text: `Symbol "${symbol_name}" not found in ${absPath}.\n\nAvailable symbols:\n${available}`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `## ${symbol_name} (${result.startLine}-${result.endLine})\n\n\`\`\`\n${result.body}\n\`\`\``,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in smart_unfold: ${e.message}` }] };
      }
    }
  );

  server.tool(
    "smart_read",
    "Intelligent file reader: returns full content for small files (<50 lines), structural outline for larger files. Use mode='full' to force full read or mode='symbol' with symbol_name to read a specific function. Supports JS/TS/Python.",
    {
      file_path: z.string().describe("Absolute path to the source file."),
      mode: z.enum(["auto", "outline", "full", "symbol"]).default("auto").describe("Read mode: auto (smart), outline (symbols only), full (entire file), symbol (specific function)."),
      symbol_name: z.string().optional().describe("Symbol name to unfold (required when mode='symbol')."),
    },
    async ({ file_path, mode, symbol_name }) => {
      const rateLimitHit = rateLimiter.check("smart_read");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }
      try {
        const absPath = validateAbsolutePath(file_path);
        if (!existsSync(absPath)) {
          return { content: [{ type: "text", text: `HALT — File does not exist: ${absPath}` }] };
        }

        const content = readFile(absPath);
        if (!content) {
          return { content: [{ type: "text", text: `HALT — Cannot read file: ${absPath}` }] };
        }

        const lineCount = content.split("\n").length;
        const lang = getFileLang(absPath);

        if (mode === "full") {
          return { content: [{ type: "text", text: content }] };
        }

        if (mode === "symbol") {
          if (!symbol_name) {
            return { content: [{ type: "text", text: "mode='symbol' requires symbol_name parameter." }] };
          }
          if (!lang) {
            return { content: [{ type: "text", text: `Unsupported language for: ${absPath}` }] };
          }
          const result = extractSymbolBody(content, symbol_name, lang);
          if (!result) {
            const symbols = extractSymbols(content, lang);
            return {
              content: [{
                type: "text",
                text: `Symbol "${symbol_name}" not found.\n\nAvailable:\n${symbols.map((s) => `  - ${s.name} (${s.kind})`).join("\n")}`,
              }],
            };
          }
          return {
            content: [{
              type: "text",
              text: `## ${symbol_name} (${result.startLine}-${result.endLine})\n\n\`\`\`\n${result.body}\n\`\`\``,
            }],
          };
        }

        if (lineCount < 50 && mode === "auto") {
          return { content: [{ type: "text", text: content }] };
        }

        if (lang) {
          const symbols = extractSymbols(content, lang);
          if (symbols.length > 0) {
            const outline = symbols.map((s) => `L${s.line}: [${s.kind}] ${s.signature}`).join("\n");
            return {
              content: [{
                type: "text",
                text: `## ${absPath} (${lineCount} lines)\n\n${outline}\n\nUse smart_read(path, mode='full') for complete content or mode='symbol' with symbol_name for a specific function.`,
              }],
            };
          }
        }

        return { content: [{ type: "text", text: content }] };
      } catch (e) {
        return { content: [{ type: "text", text: `HALT — Error in smart_read: ${e.message}` }] };
      }
    }
  );
}
