/**
 * Stack Perfeita MCP — Compress Memory File
 * Compresses natural language memory files (CLAUDE.md, ai-rules, todos)
 * using caveman-style rules to reduce input tokens.
 * 
 * Based on caveman-compress by Julius Brussee (MIT License).
 * 
 * Compression rules:
 * - Remove articles (a, an, the)
 * - Remove filler words (just, really, basically, actually, simply)
 * - Remove pleasantries (please, kindly, thank you, sure, certainly)
 * - Remove hedging (perhaps, maybe, might, could potentially)
 * - Remove leading phrases (I'll, I will, you can, we will, let me)
 * - Preserve code blocks, URLs, paths, identifiers exactly
 * - Preserve markdown structure (headings, bullets, tables)
 * 
 * Creates backup as FILE.original.md before overwriting.
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, basename, join, isAbsolute } from "path";
import { PROJECT_ROOT } from "./config.js";

// Regex patterns for compression
const FILLERS = /\b(?:just|really|basically|actually|simply|quite|very|essentially|literally)\b/gi;
const PLEASANTRIES = /\b(?:please|kindly|thank you|thanks|sure|certainly|of course|happy to|i'?d be happy)\b[,.]?\s*/gi;
const HEDGES = /\b(?:perhaps|maybe|might|could potentially|would like to|i think|in my opinion|it seems|it appears)\b\s*/gi;
const LEADERS = /^(?:i'?ll|i will|i can|i'?d|you can|we will|we can|let me|let'?s)\s+/gim;
const ARTICLES = /\b(?:a|an|the)\s+(?=[a-z])/gi;

// Protected patterns that must never be compressed
const PROTECTED_PATTERNS = [
  /```[\s\S]*?```/g,                          // fenced code
  /`[^`\n]+`/g,                               // inline code
  /\bhttps?:\/\/\S+/gi,                       // URLs
  /\b[\w.-]*[\/\\][\w.\/\\\-]+/g,             // paths with / or \
  /\b[A-Z][A-Za-z0-9]*(?:_[A-Z][A-Za-z0-9]*)+\b/g, // CONST_CASE
  /\b\w+\.\w+(?:\.\w+)*\(\)?/g,               // dotted.method or pkg.fn()
  /[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/g,      // function calls
  /\b\d+\.\d+\.\d+\b/g,                       // version numbers
];
/**
 * Validate that a path is within the project root. Prevents path traversal.
 */
function validatePath(filePath) {
  const resolved = resolve(filePath);
  const normalizedRoot = resolve(PROJECT_ROOT);
  if (!resolved.startsWith(normalizedRoot)) {
    return `BLOCKED: Path outside project root: ${resolved}`;
  }
  return null;
}


/**
 * Replace protected segments with sentinels, transform the rest, then restore.
 */
function withProtectedSegments(text, transform) {
  const segments = [];
  let working = text;
  for (const re of PROTECTED_PATTERNS) {
    working = working.replace(re, (m) => {
      const i = segments.length;
      segments.push(m);
      return `${i}`;
    });
  }
  let out = transform(working);
  out = out.replace(/(\d+)/g, (_, i) => segments[+i]);
  return out;
}

/**
 * Compress prose text using caveman-style rules.
 */
function compressProse(text) {
  let s = text;
  s = s.replace(LEADERS, '');
  s = s.replace(PLEASANTRIES, '');
  s = s.replace(HEDGES, '');
  s = s.replace(FILLERS, '');
  s = s.replace(ARTICLES, '');
  // Collapse repeated whitespace
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\s+([,.;:!?])/g, '$1');
  s = s.replace(/\n{3,}/g, '\n\n');
  // Capitalize first letter of sentences
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
  return s.trim();
}

/**
 * Compress a text string, preserving protected patterns.
 */
function compress(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { compressed: text, before: 0, after: 0, savingsPercent: 0 };
  }
  const before = text.length;
  const compressed = withProtectedSegments(text, compressProse);
  const after = compressed.length;
  // If compression made it longer, return original (no negative savings)
  if (after >= before) {
    return { compressed: text, before, after: before, savingsPercent: 0 };
  }
  const savingsPercent = Math.round(((before - after) / before) * 100);
  return { compressed, before, after, savingsPercent };
}

/**
 * Detect if a file is compressible (natural language, not code)
 */
function isCompressible(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const compressibleExts = ['md', 'txt', 'typ', 'typst', 'tex'];
  const nonCompressibleExts = ['js', 'ts', 'json', 'yaml', 'yml', 'toml', 'env', 'lock', 'css', 'html', 'xml', 'sql', 'sh', 'py', 'go', 'rs'];
  
  if (nonCompressibleExts.includes(ext)) return false;
  if (compressibleExts.includes(ext)) return true;
  if (!ext || ext.length > 4) return true; // extensionless or long extension
  return false;
}

export function registerCompressMemoryTools(server) {
  server.tool(
    "compress_memory_file",
    "Compresses a natural language file (CLAUDE.md, ai-rules, todos) using caveman-style rules to reduce input tokens. Preserves code blocks, URLs, paths, and identifiers. Creates backup as FILE.original.md before overwriting. Returns compression stats.",
    {
      file_path: z.string().describe("Path to the file to compress (relative to project root or absolute)"),
      dry_run: z.boolean().optional().describe("If true, show what would change without modifying the file (default: true for safety)"),
      backup: z.boolean().optional().describe("If true, create backup even if file is not modified (default: false)")
    },
    async ({ file_path, dry_run, backup }) => {
      // Resolve path
      const resolvedPath = resolve(file_path);
      // Security: Validate path is within project root
      const pathError = validatePath(file_path);
      if (pathError) {
        return { content: [{ type: "text", text: pathError }] };
      }
      
      
      // Check if file exists
      if (!existsSync(resolvedPath)) {
        return { content: [{ type: "text", text: `ERROR: File not found: ${resolvedPath}` }] };
      }
      
      // Check if file is compressible
      if (!isCompressible(resolvedPath)) {
        return { content: [{ type: "text", text: `SKIPPED: File type not compressible: ${basename(resolvedPath)}\nOnly .md, .txt, .typ, .typst, .tex, and extensionless files are supported.` }] };
      }
      
      // Check if it's a backup file
      if (basename(resolvedPath).endsWith('.original.md')) {
        return { content: [{ type: "text", text: `SKIPPED: Backup file, not compressing: ${basename(resolvedPath)}` }] };
      }
      
      // Read file
      const original = readFileSync(resolvedPath, 'utf-8');
      
      // Compress
      const result = compress(original);
      
      // Build report
      const report = [
        "COMPRESS MEMORY FILE",
        "═══════════════════════════════════════",
        `File: ${basename(resolvedPath)}`,
        `Path: ${resolvedPath}`,
        "",
        `Before: ${result.before.toLocaleString()} chars`,
        `After: ${result.after.toLocaleString()} chars`,
        `Savings: ${result.savingsPercent}%`,
        `Estimated tokens saved: ~${Math.round((result.before - result.after) * 0.25)}`,
        ""
      ];
      
      if (dry_run !== false) {
        report.push("## DRY RUN — No changes made");
        report.push("");
        report.push("## Compressed Preview (first 500 chars)");
        report.push(result.compressed.slice(0, 500));
        if (result.compressed.length > 500) report.push("...");
      } else if (result.savingsPercent === 0) {
        report.push("No changes needed — file is already compressed.");
      } else {
        // Create backup
        const backupPath = resolvedPath.replace(/(\.[^.]+)$/, '.original.md');
        if (!existsSync(backupPath)) {
          copyFileSync(resolvedPath, backupPath);
          report.push(`Backup created: ${basename(backupPath)}`);
        }
        
        // Write compressed version
        writeFileSync(resolvedPath, result.compressed, 'utf-8');
        report.push(`Compressed file written: ${basename(resolvedPath)}`);
      }
      
      return { content: [{ type: "text", text: report.join("\n") }] };
    }
  );

  server.tool(
    "compress_memory_batch",
    "Compresses multiple memory files in batch. Scans a directory for compressible files and compresses them all. Returns a summary of all files processed.",
    {
      directory: z.string().describe("Directory to scan for compressible files (relative to project root or absolute)"),
      dry_run: z.boolean().optional().describe("If true, show what would change without modifying files (default: true for safety)")
    },
    async ({ directory, dry_run }) => {
      const { readdirSync, statSync } = await import("fs");
      const dirPath = resolve(directory);
      // Security: Validate path is within project root
      const pathError = validatePath(directory);
      if (pathError) {
        return { content: [{ type: "text", text: pathError }] };
      }
      
      
      if (!existsSync(dirPath)) {
        return { content: [{ type: "text", text: `ERROR: Directory not found: ${dirPath}` }] };
      }
      
      // Scan for compressible files
      const files = [];
      function scanDir(dir) {
        for (const entry of readdirSync(dir)) {
          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              scanDir(fullPath);
            } else if (isCompressible(fullPath) && !basename(fullPath).endsWith('.original.md')) {
              files.push(fullPath);
            }
          } catch {}
        }
      }
      scanDir(dirPath);
      
      if (files.length === 0) {
        return { content: [{ type: "text", text: `No compressible files found in: ${dirPath}` }] };
      }
      
      // Process each file
      const results = [];
      let totalBefore = 0;
      let totalAfter = 0;
      let filesCompressed = 0;
      
      for (const filePath of files) {
        const original = readFileSync(filePath, 'utf-8');
        const result = compress(original);
        totalBefore += result.before;
        totalAfter += result.after;
        
        if (result.savingsPercent > 0 && dry_run === false) {
          const backupPath = filePath.replace(/(\.[^.]+)$/, '.original.md');
          if (!existsSync(backupPath)) {
            copyFileSync(filePath, backupPath);
          }
          writeFileSync(filePath, result.compressed, 'utf-8');
          filesCompressed++;
        }
        
        results.push({
          file: basename(filePath),
          savings: result.savingsPercent,
          before: result.before,
          after: result.after
        });
      }
      
      const totalSavings = totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
      
      const report = [
        "COMPRESS MEMORY BATCH",
        "═══════════════════════════════════════",
        `Directory: ${dirPath}`,
        `Files scanned: ${files.length}`,
        `Files compressed: ${filesCompressed}`,
        `Total before: ${totalBefore.toLocaleString()} chars`,
        `Total after: ${totalAfter.toLocaleString()} chars`,
        `Total savings: ${totalSavings}%`,
        `Estimated tokens saved: ~${Math.round((totalBefore - totalAfter) * 0.25)}`,
        "",
        "## File Details",
        ...results.map(r => `  ${r.file}: ${r.before}→${r.after} chars (-${r.savings}%)`)
      ].join("\n");
      
      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "compress_memory_preview",
    "Shows a preview of what a memory file would look like compressed, without modifying it. Useful for checking compression quality before applying.",
    {
      file_path: z.string().describe("Path to the file to preview (relative to project root or absolute)")
    },
    async ({ file_path }) => {
      const resolvedPath = resolve(file_path);
      // Security: Validate path is within project root
      const pathError = validatePath(file_path);
      if (pathError) {
        return { content: [{ type: "text", text: pathError }] };
      }
      
      
      if (!existsSync(resolvedPath)) {
        return { content: [{ type: "text", text: `ERROR: File not found: ${resolvedPath}` }] };
      }
      
      if (!isCompressible(resolvedPath)) {
        return { content: [{ type: "text", text: `SKIPPED: File type not compressible: ${basename(resolvedPath)}` }] };
      }
      
      const original = readFileSync(resolvedPath, 'utf-8');
      const result = compress(original);
      
      const report = [
        "COMPRESS MEMORY PREVIEW",
        "═══════════════════════════════════════",
        `File: ${basename(resolvedPath)}`,
        `Before: ${result.before.toLocaleString()} chars`,
        `After: ${result.after.toLocaleString()} chars`,
        `Savings: ${result.savingsPercent}%`,
        "",
        "## Compressed Content",
        result.compressed
      ].join("\n");
      
      return { content: [{ type: "text", text: report }] };
    }
  );
}
