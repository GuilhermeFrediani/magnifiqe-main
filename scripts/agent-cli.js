#!/usr/bin/env node
/**
 * Stack Perfeita MCP — Agent CLI
 * Unified CLI interface for running skill-related scripts.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSkill } from './validate-skill.js';
import { discoverSkills } from './discover-skills.js';
import { renderSkillCard } from './render-skill-card.js';

/**
 * Parse CLI arguments.
 */
function parseArgs(args) {
  const opts = {
    input: null,
    file: null,
    mode: 'fast',
    output: 'text',
    verbose: false,
    command: null,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--input' || arg === '--file') {
      opts[arg === '--input' ? 'input' : 'file'] = args[++i];
    } else if (arg === '--mode') {
      opts.mode = args[++i];
    } else if (arg === '--output') {
      opts.output = args[++i];
    } else if (arg === '--verbose') {
      opts.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      if (!opts.command) {
        opts.command = arg;
      } else if (!opts.input && !opts.file) {
        opts.input = arg;
      }
    }
  }

  return opts;
}

/**
 * Print help message.
 */
function printHelp() {
  console.log(`
Stack Perfeita MCP — Agent CLI

Usage: node agent-cli.js <command> [options]

Commands:
  validate     Validate a SKILL.md file against the standard format
  discover     Discover all skills in .claude/skills/ directory
  render-card  Render a governance card from a skill

Options:
  --input <path>   Input file or directory path
  --file <path>    Alternative input path
  --mode <mode>    Execution mode: fast (default) | comprehensive
  --output <fmt>   Output format: text (default) | json
  --verbose        Enable verbose output
  --help, -h       Show this help message

Examples:
  node agent-cli.js validate .claude/skills/my-skill/SKILL.md
  node agent-cli.js discover --output json
  node agent-cli.js render-card .claude/skills/my-skill/SKILL.md --verbose
  `);
}

/**
 * Run validate command.
 */
function runValidate(opts) {
  const filePath = opts.input || opts.file;
  if (!filePath) {
    console.error('Error: validate requires a file path');
    console.error('Usage: node agent-cli.js validate <path-to-SKILL.md>');
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

  return result;
}

/**
 * Run discover command.
 */
function runDiscover(opts) {
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

  return skills;
}

/**
 * Run render-card command.
 */
function runRenderCard(opts) {
  const filePath = opts.input || opts.file;
  if (!filePath) {
    console.error('Error: render-card requires a file path');
    console.error('Usage: node agent-cli.js render-card <path-to-SKILL.md>');
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
    }
  }

  return result;
}

/**
 * Main CLI entry point.
 */
function main() {
  const opts = parseArgs(process.argv);

  if (!opts.command) {
    printHelp();
    process.exit(1);
  }

  switch (opts.command) {
    case 'validate':
      runValidate(opts);
      break;
    case 'discover':
      runDiscover(opts);
      break;
    case 'render-card':
      runRenderCard(opts);
      break;
    default:
      console.error(`Unknown command: ${opts.command}`);
      console.error('Run with --help to see available commands');
      process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
