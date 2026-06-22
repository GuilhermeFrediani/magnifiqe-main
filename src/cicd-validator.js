/**
 * CI/CD Configuration Validator
 * Validates GitHub Actions, GitLab CI, and general CI/CD configs for security.
 */

import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { validateAbsolutePath } from "./helpers.js";
import { rateLimiter } from "./rate-limiter.js";

// ─── YAML-like parser (minimal) ──────────────────────────────────────────────
// Simple line-based parser for CI/CD config patterns

function parseYamlLines(content) {
  return content.split('\n').map((line, idx) => ({
    num: idx + 1,
    text: line,
    trimmed: line.trim(),
  }));
}

// ─── Detection helpers ───────────────────────────────────────────────────────

function detectPlatform(content, filePath) {
  if (filePath?.endsWith('.github/workflows/*.yml') || 
      filePath?.includes('.github/workflows/')) {
    return 'github-actions';
  }
  if (filePath?.endsWith('.gitlab-ci.yml') || 
      filePath?.includes('gitlab-ci')) {
    return 'gitlab-ci';
  }
  
  // Content-based detection
  if (/^\s*on\s*:\s*\[?\s*(push|pull_request|schedule|workflow_dispatch)/m.test(content)) {
    return 'github-actions';
  }
  if (/^\s*stages\s*:/m.test(content)) {
    return 'gitlab-ci';
  }
  
  return 'unknown';
}

// ─── Issue collection ────────────────────────────────────────────────────────

function addIssue(issues, line, severity, rule, message, fix) {
  issues.push({ line, severity, rule, message, fix });
}

// ─── GitHub Actions checks ───────────────────────────────────────────────────

function checkGitHubActions(content, lines) {
  const issues = [];
  
  for (const { num, trimmed, text } of lines) {
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // SHA pinning: actions should use SHA, not tags
    if (/uses\s*:\s*[\w-]+\/[\w-]+@/.test(text) && 
        !/uses\s*:\s*[\w-]+\/[\w-]+@[a-f0-9]{40}/.test(text)) {
      addIssue(issues, num, 'warning', 'SHA_PINNING',
        'Action uses tag reference instead of SHA pin',
        'Pin action to full SHA: uses: owner/action@<full-sha>');
    }
    
    // Token minimization: GITHUB_TOKEN permissions
    if (/GITHUB_TOKEN/.test(text) && 
        !/permissions\s*:/i.test(content) &&
        !/permissions\s*:/m.test(content)) {
      addIssue(issues, num, 'warning', 'TOKEN_PERMISSIONS',
        'GITHUB_TOKEN used without explicit permissions',
        'Add permissions block to limit token scope');
    }
    
    // Script injection prevention
    if (/\$\{\{.*github\.(event\.|head_ref|title|body)/.test(text)) {
      addIssue(issues, num, 'critical', 'SCRIPT_INJECTION',
        'Direct use of untrusted context in expression',
        'Use environment variables: env: UNTRUSTED: ${{ github.event... }}');
    }
    
    // Fork PR handling
    if (/pull_request_target/.test(text) && 
        !/if\s*:/.test(content) &&
        !/permissions\s*:/m.test(content)) {
      addIssue(issues, num, 'critical', 'FORK_PR_RISK',
        'pull_request_target without safety checks',
        'Add if conditions to restrict fork PRs or limit permissions');
    }
    
    // Secret protection
    if (/echo\s+.*\$\{\{.*secrets\./.test(text) ||
        /printenv/.test(text)) {
      addIssue(issues, num, 'critical', 'SECRET_EXPOSURE',
        'Potential secret leakage in logs',
        'Use masks or avoid echoing secrets');
    }
  }
  
  return issues;
}

// ─── GitLab CI checks ────────────────────────────────────────────────────────

function checkGitLabCI(content, lines) {
  const issues = [];
  
  for (const { num, trimmed, text } of lines) {
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Image pinning
    if (/^image\s*:\s*[\w-]+(?::[\w.-]+)?(?!.+:)/.test(text) &&
        !/image\s*:.*@sha256:/.test(text)) {
      addIssue(issues, num, 'warning', 'IMAGE_PINNING',
        'Docker image not pinned to digest',
        'Pin to digest: image: name@sha256:...');
    }
    
    // Secret variables in plain text
    if (/variables\s*:/.test(text) ||
        /^\s+\w+_SECRET\s*[:=]/.test(text) ||
        /^\s+PASSWORD\s*[:=]/.test(text) ||
        /^\s+API_KEY\s*[:=]/.test(text)) {
      if (/[A-Za-z0-9+/=]{16,}/.test(text)) {
        addIssue(issues, num, 'critical', 'PLAIN_SECRETS',
          'Secret value appears in plain text',
          'Use $VARIABLE referencing CI/CD secret variables');
      }
    }
    
    // Script injection in before_script/script
    if (/^\s*(before_script|script|after_script)\s*:/.test(text)) {
      const scriptContent = text.replace(/^\s*(before_script|script|after_script)\s*:\s*/, '');
      if (/\$\{.*CI_COMMIT/.test(scriptContent) ||
          /\$\{.*CI_MERGE_REQUEST/.test(scriptContent)) {
        addIssue(issues, num, 'warning', 'GITLAB_INJECTION',
          'Potential injection via GitLab CI variables',
          'Sanitize or validate variable content');
      }
    }
  }
  
  return issues;
}

// ─── General checks (all platforms) ─────────────────────────────────────────

function checkGeneral(content, lines) {
  const issues = [];
  
  for (const { num, trimmed, text } of lines) {
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Hardcoded credentials
    if (/password\s*[:=]\s*['"][^'"]+['"]/i.test(text) ||
        /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i.test(text) ||
        /secret\s*[:=]\s*['"][^'"]+['"]/i.test(text) ||
        /token\s*[:=]\s*['"][^'"]+['"]/i.test(text)) {
      addIssue(issues, num, 'critical', 'HARDCODED_CREDENTIALS',
        'Potential hardcoded credential detected',
        'Use environment variables or secrets');
    }
    
    // curl | bash
    if (/curl\s+.*\|\s*(bash|sh)/i.test(text)) {
      addIssue(issues, num, 'critical', 'CURL_BASH',
        'curl | bash pattern detected (remote code execution risk)',
        'Download, verify checksum, then execute');
    }
    
    // wget | sh
    if (/wget\s+.*\|\s*(sh|bash)/i.test(text)) {
      addIssue(issues, num, 'critical', 'WGET_SH',
        'wget | sh pattern detected (remote code execution risk)',
        'Download, verify checksum, then execute');
    }
    
    // chmod 777
    if (/chmod\s+777/.test(text)) {
      addIssue(issues, num, 'critical', 'CHMOD_777',
        'chmod 777 grants world-writable permissions',
        'Use least-privilege permissions (755 or 700)');
    }
  }
  
  return issues;
}

// ─── Main validation logic ───────────────────────────────────────────────────

export function validateCICDConfig(filePath) {
  const absPath = validateAbsolutePath(filePath);
  
  if (!existsSync(absPath)) {
    return {
      verdict: 'HALT',
      file: filePath,
      platform: 'unknown',
      issues: [{ line: 0, severity: 'critical', rule: 'FILE_NOT_FOUND', 
                 message: 'File does not exist', fix: 'Provide a valid file path' }],
      summary: { critical: 1, warning: 0, info: 0 },
    };
  }
  
  const content = readFileSync(absPath, 'utf-8');
  if (!content.trim()) {
    return {
      verdict: 'WARN',
      file: filePath,
      platform: 'unknown',
      issues: [{ line: 0, severity: 'warning', rule: 'EMPTY_FILE',
                 message: 'Configuration file is empty', fix: 'Add CI/CD configuration' }],
      summary: { critical: 0, warning: 1, info: 0 },
    };
  }
  
  const lines = parseYamlLines(content);
  const platform = detectPlatform(content, filePath);
  
  let allIssues = [];
  
  // Platform-specific checks
  if (platform === 'github-actions') {
    allIssues = checkGitHubActions(content, lines);
  } else if (platform === 'gitlab-ci') {
    allIssues = checkGitLabCI(content, lines);
  }
  
  // Always run general checks
  allIssues = allIssues.concat(checkGeneral(content, lines));
  
  // Calculate summary
  const summary = {
    critical: allIssues.filter(i => i.severity === 'critical').length,
    warning: allIssues.filter(i => i.severity === 'warning').length,
    info: allIssues.filter(i => i.severity === 'info').length,
  };
  
  // Determine verdict
  let verdict = 'PASS';
  if (summary.critical > 0) verdict = 'HALT';
  else if (summary.warning > 0) verdict = 'WARN';
  
  return {
    verdict,
    file: filePath,
    platform,
    issues: allIssues,
    summary,
  };
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerCICDValidator(server) {
  server.tool(
    "validate_cicd_config",
    "Validates CI/CD configuration files for security best practices. Supports GitHub Actions, GitLab CI, and general CI/CD patterns.",
    { path: z.string().describe("Path to CI/CD config file") },
    async ({ path }) => {
      const rateLimitHit = rateLimiter.check("validate_cicd_config");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      const result = validateCICDConfig(path);
      
      const sections = [
        `CI/CD VALIDATOR: ${result.verdict}`,
        `- File: ${result.file}`,
        `- Platform: ${result.platform}`,
        `- Critical: ${result.summary.critical} | Warning: ${result.summary.warning}`,
      ];

      if (result.issues.length > 0) {
        sections.push('', 'Issues:');
        result.issues.forEach(issue => {
          const prefix = issue.severity === 'critical' ? '✗' : '⚠';
          sections.push(`  ${prefix} [Line ${issue.line}] ${issue.rule}: ${issue.message}`);
          sections.push(`    Fix: ${issue.fix}`);
        });
      }

      if (result.verdict === 'HALT') {
        sections.push('', 'Address critical issues before proceeding.');
      } else if (result.verdict === 'WARN') {
        sections.push('', 'Warnings detected. Review recommended.');
      }

      return {
        content: [{ type: "text", text: sections.join("\n") }],
        cicdReport: result,
      };
    }
  );
}
