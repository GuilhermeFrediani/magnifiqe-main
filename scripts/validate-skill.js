#!/usr/bin/env node
/**
 * Stack Perfeita MCP — Validate Skill
 * Validates SKILL.md files against the standard format.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Parse YAML-like frontmatter from markdown content.
 * Extracts key: value pairs from between --- delimiters.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    fm[key] = val;
  }
  return fm;
}

/**
 * Validate name field: kebab-case, 1-64 chars.
 */
function validateName(name) {
  if (!name) return 'name is required';
  if (typeof name !== 'string') return 'name must be a string';
  if (name.length > 64) return `name must be 64 chars or less (got ${name.length})`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return 'name must be kebab-case (lowercase alphanumeric with hyphens)';
  return null;
}

/**
 * Validate description field: minimum 50 chars.
 */
function validateDescription(desc) {
  if (!desc) return 'description is required';
  if (typeof desc !== 'string') return 'description must be a string';
  if (desc.length < 50) return `description must be at least 50 chars (got ${desc.length})`;
  return null;
}

/**
 * Validate tags field: array with 2+ items.
 * Handles both arrays and comma-separated strings from frontmatter parser.
 */
function validateTags(tags) {
  if (!tags) return 'tags are required';
  // Normalize: frontmatter parser returns comma-separated strings
  const tagArray = Array.isArray(tags)
    ? tags
    : String(tags).split(',').map(t => t.trim()).filter(Boolean);
  if (tagArray.length < 2) return `tags must have at least 2 items (got ${tagArray.length})`;
  return null;
}

/**
 * Validate a SKILL.md file.
 * @param {string} filePath - Path to SKILL.md file
 * @returns {{ valid: boolean, errors: string[], frontmatter: object }}
 */
export function validateSkill(filePath) {
  const errors = [];
  let frontmatter = {};

  if (!existsSync(filePath)) {
    return { valid: false, errors: ['File not found'], frontmatter };
  }

  const content = readFileSync(filePath, 'utf-8');
  frontmatter = parseFrontmatter(content);

  // Check if frontmatter exists
  if (Object.keys(frontmatter).length === 0) {
    errors.push('No YAML frontmatter found (must be between --- delimiters)');
    return { valid: false, errors, frontmatter };
  }

  // Validate name
  const nameErr = validateName(frontmatter.name);
  if (nameErr) errors.push(nameErr);

  // Validate description
  const descErr = validateDescription(frontmatter.description);
  if (descErr) errors.push(descErr);

  // Validate version
  if (!frontmatter.version) {
    errors.push('version is required');
  }

  // Validate tags
  const tagsErr = validateTags(frontmatter.tags);
  if (tagsErr) errors.push(tagsErr);

  return {
    valid: errors.length === 0,
    errors,
    frontmatter,
  };
}

/**
 * Parse CLI arguments.
 */
function parseArgs(args) {
  const opts = { input: null, file: null, verbose: false, output: 'text' };
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '--file') {
      opts[arg === '--input' ? 'input' : 'file'] = args[++i];
    } else if (arg === '--verbose') {
      opts.verbose = true;
    } else if (arg === '--output') {
      opts.output = args[++i];
    } else if (!arg.startsWith('-')) {
      opts.input = arg;
    }
  }
  return opts;
}

/**
 * Main CLI entry point.
 */
function main() {
  const opts = parseArgs(process.argv);
  const filePath = opts.input || opts.file;

  if (!filePath) {
    console.error('Usage: node validate-skill.js <path-to-SKILL.md> [--verbose] [--output json|text]');
    process.exit(1);
  }

  const result = validateSkill(resolve(filePath));

  if (opts.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.valid) {
      console.log(`✓ Valid: ${filePath}`);
      if (opts.verbose) {
        console.log('Frontmatter:', JSON.stringify(result.frontmatter, null, 2));
      }
    } else {
      console.error(`✗ Invalid: ${filePath}`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
  }

  process.exit(result.valid ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
