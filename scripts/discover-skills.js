#!/usr/bin/env node
/**
 * Stack Perfeita MCP — Discover Skills
 * Discovers all skills in .claude/skills/ directory.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
 * Discover all SKILL.md files in a directory.
 * @param {string} skillsDir - Path to skills directory
 * @returns {Array<{ dir: string, name: string, description: string, version: string, tags: string[] }>}
 */
export function discoverSkills(skillsDir) {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills = [];
  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;

    try {
      const content = readFileSync(skillPath, 'utf-8');
      const fm = parseFrontmatter(content);

      skills.push({
        dir: entry.name,
        name: fm.name || entry.name,
        description: fm.description || 'No description',
        version: fm.version || '0.0.0',
        tags: fm.tags ? fm.tags.split(',').map(t => t.trim()) : [],
        path: skillPath,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse CLI arguments.
 */
function parseArgs(args) {
  const opts = { input: null, verbose: false, output: 'text' };
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '--file') {
      opts.input = args[++i];
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
  const defaultDir = resolve(process.cwd(), '.claude', 'skills');
  const skillsDir = opts.input || defaultDir;

  const skills = discoverSkills(skillsDir);

  if (opts.output === 'json') {
    console.log(JSON.stringify(skills, null, 2));
  } else {
    if (skills.length === 0) {
      console.log(`No skills found in: ${skillsDir}`);
    } else {
      console.log(`Found ${skills.length} skill(s) in: ${skillsDir}\n`);
      for (const skill of skills) {
        console.log(`- ${skill.name} (v${skill.version})`);
        if (opts.verbose) {
          console.log(`  Dir: ${skill.dir}`);
          console.log(`  Desc: ${skill.description}`);
          console.log(`  Tags: ${skill.tags.join(', ')}`);
          console.log('');
        }
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
