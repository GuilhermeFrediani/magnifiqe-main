#!/usr/bin/env node
/**
 * Stack Perfeita MCP — Render Skill Card
 * Renders a governance card from a skill's SKILL.md frontmatter.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Parse YAML-like frontmatter from markdown content.
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
 * Check for prohibited VERIFY/SELECT markers.
 */
function checkMarkers(content) {
  const issues = [];
  if (/\bVERIFY\b/.test(content)) {
    issues.push('Contains VERIFY marker (not allowed in skill cards)');
  }
  if (/\bSELECT\b/.test(content)) {
    issues.push('Contains SELECT marker (not allowed in skill cards)');
  }
  return issues;
}

/**
 * Render a markdown governance card from frontmatter.
 * @param {object} fm - Parsed frontmatter
 * @param {string} dirName - Directory name
 * @returns {string} Markdown card
 */
export function renderCard(fm, dirName) {
  const lines = [];
  lines.push(`## ${fm.name || dirName}`);
  lines.push('');

  if (fm.version) {
    lines.push(`**Version:** ${fm.version}`);
  }
  if (fm.description) {
    lines.push('');
    lines.push(fm.description);
  }
  if (fm.tags) {
    lines.push('');
    lines.push(`**Tags:** ${fm.tags}`);
  }
  if (fm.compatibility) {
    lines.push('');
    lines.push(`**Compatibility:** ${fm.compatibility}`);
  }

  return lines.join('\n');
}

/**
 * Render a skill card from a SKILL.md file.
 * @param {string} filePath - Path to SKILL.md
 * @returns {{ card: string, valid: boolean, issues: string[] }}
 */
export function renderSkillCard(filePath) {
  const issues = [];

  if (!existsSync(filePath)) {
    return { card: '', valid: false, issues: ['File not found'] };
  }

  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  const dirName = basename(dirname(filePath));

  // Check for prohibited markers
  const markerIssues = checkMarkers(content);
  issues.push(...markerIssues);

  const card = renderCard(fm, dirName);

  return {
    card,
    valid: issues.length === 0,
    issues,
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
    console.error('Usage: node render-skill-card.js <path-to-SKILL.md> [--verbose] [--output json|text]');
    process.exit(1);
  }

  const result = renderSkillCard(resolve(filePath));

  if (opts.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.valid) {
      console.log(result.card);
      if (opts.verbose) {
        console.log('\n--- Card rendered successfully ---');
      }
    } else {
      console.error('Card rendering failed:');
      for (const issue of result.issues) {
        console.error(`  - ${issue}`);
      }
      process.exit(1);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
