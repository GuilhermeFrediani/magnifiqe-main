/**
 * Stack Perfeita MCP — Smart Command Wrapper
 * Runs shell commands with smart filtering to reduce output tokens.
 * Inspired by rtk (Rust Token Killer) CLI proxy.
 * 
 * Strategies applied per command type:
 * - Smart Filtering: Remove noise (comments, whitespace, boilerplate)
 * - Grouping: Aggregate similar items (files by directory, errors by type)
 * - Truncation: Keep relevant context, cut redundancy
 * - Deduplication: Collapse repeated log lines with counts
 * 
 * Supported commands: git, npm, cargo, pytest, go test, docker, ls, cat, grep, etc.
 */

import { z } from "zod";
import { execSync } from "child_process";
// Security: Command allowlist — only these prefixes are permitted
const ALLOWED_COMMAND_PREFIXES = [
  "git ", "npm ", "npx ", "node ", "bun ", "pnpm ",
  "cargo ", "rustc ", "clippy ",
  "python ", "python3 ", "pip ", "uv ", "pytest ",
  "go ", "golangci-lint ",
  "docker ",
  "ls", "dir", "cat", "type", "find", "grep", "head", "tail", "wc",
  "echo", "pwd", "whoami", "date",
  "eslint", "prettier", "ruff check",
  "tsc", "npx tsc"
];

/**
 * Validate command against allowlist. Returns null if safe, error message if blocked.
 */
function validateCommand(cmd) {
  const trimmed = cmd.trim().toLowerCase();
  // Block dangerous patterns
  if (/[;&|`$(){}!]/.test(trimmed) && !trimmed.startsWith("echo ")) {
    return "BLOCKED: Shell metacharacters (;, &, |, `, $, etc.) not allowed";
  }
  if (/(rm\s|del\s|format\s|mkfs|shutdown|reboot|sudo|su\s|chmod\s|chown)/i.test(trimmed)) {
    return "BLOCKED: Destructive or privilege-escalation commands not allowed";
  }
  // Check allowlist
  const allowed = ALLOWED_COMMAND_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  if (!allowed) {
    return `BLOCKED: Command not in allowlist. Allowed: ${ALLOWED_COMMAND_PREFIXES.slice(0, 10).join(", ")}...`;
  }
  return null;
}


// Command-specific filter configurations
const COMMAND_FILTERS = {
  // Git commands
  "git status": { strategy: "compact", maxLines: 20, removePattern: /On branch|Your branch is up to date/i },
  "git log": { strategy: "oneline", maxLines: 15 },
  "git diff": { strategy: "condensed", maxLines: 50, removePattern: /^diff --git|^index |^--- \/\dev\/null/i },
  "git add": { strategy: "ack", response: "ok" },
  "git commit": { strategy: "ack", response: "ok {hash}" },
  "git push": { strategy: "ack", response: "ok {branch}" },
  "git pull": { strategy: "compact", maxLines: 10 },
  
  // NPM/Node
  "npm test": { strategy: "failures_only", maxLines: 30 },
  "npm run build": { strategy: "compact", maxLines: 20 },
  "npm list": { strategy: "tree", maxLines: 30 },
  
  // Cargo/Rust
  "cargo test": { strategy: "failures_only", maxLines: 30 },
  "cargo build": { strategy: "compact", maxLines: 20 },
  "cargo clippy": { strategy: "grouped", maxLines: 30 },
  
  // Python
  "pytest": { strategy: "failures_only", maxLines: 30 },
  "python -m pytest": { strategy: "failures_only", maxLines: 30 },
  
  // Go
  "go test": { strategy: "failures_only", maxLines: 30 },
  "go build": { strategy: "compact", maxLines: 20 },
  
  // Docker
  "docker ps": { strategy: "compact", maxLines: 15 },
  "docker images": { strategy: "compact", maxLines: 15 },
  "docker logs": { strategy: "dedup", maxLines: 30 },
  
  // File operations
  "ls": { strategy: "compact", maxLines: 20 },
  "dir": { strategy: "compact", maxLines: 20 },
  "cat": { strategy: "truncated", maxLines: 50 },
  "type": { strategy: "truncated", maxLines: 50 },
  "grep": { strategy: "grouped", maxLines: 30 },
  "find": { strategy: "compact", maxLines: 30 },
  
  // Linting
  "eslint": { strategy: "grouped", maxLines: 30 },
  "ruff check": { strategy: "grouped", maxLines: 30 },
  "golangci-lint": { strategy: "grouped", maxLines: 30 },
};

/**
 * Detect which command filter to use
 */
function detectCommand(cmd) {
  const lower = cmd.toLowerCase().trim();
  for (const [pattern, filter] of Object.entries(COMMAND_FILTERS)) {
    if (lower.startsWith(pattern) || lower.includes(pattern)) {
      return { pattern, filter };
    }
  }
  return { pattern: null, filter: { strategy: "passthrough", maxLines: 50 } };
}

/**
 * Apply filtering strategy to command output
 */
function filterOutput(output, strategy, maxLines, removePattern) {
  if (!output) return "";
  
  let lines = output.split("\n");
  
  switch (strategy) {
    case "ack":
      // Return minimal acknowledgment
      return "ok";
    
    case "compact":
      // Remove empty lines, collapse whitespace, limit lines
      lines = lines.filter(l => l.trim());
      lines = lines.map(l => l.replace(/\s+/g, " ").trim());
      if (removePattern) lines = lines.filter(l => !removePattern.test(l));
      break;
    
    case "oneline":
      // Git log style: one line per commit
      lines = lines.filter(l => l.trim()).slice(0, maxLines);
      break;
    
    case "condensed":
      // Remove diff boilerplate, keep meaningful changes
      if (removePattern) lines = lines.filter(l => !removePattern.test(l));
      lines = lines.filter(l => l.trim());
      break;
    
    case "failures_only":
      // Keep only FAIL/error lines and summary
      const failureLines = lines.filter(l => 
        /FAIL|ERROR|failed|panic|assertion/i.test(l)
      );
      const summaryLine = lines.find(l => /passed|failed|error/i.test(l));
      lines = [...failureLines];
      if (summaryLine) lines.push("", summaryLine);
      break;
    
    case "grouped":
      // Group by file or type
      lines = lines.filter(l => l.trim());
      break;
    
    case "dedup":
      // Deduplicate repeated lines
      const seen = new Map();
      for (const line of lines) {
        const key = line.replace(/\d+/g, "N").trim();
        if (key) {
          seen.set(key, (seen.get(key) || 0) + 1);
        }
      }
      lines = Array.from(seen.entries()).map(([key, count]) => 
        count > 1 ? `${key} (x${count})` : key
      );
      break;
    
    case "tree":
      // Keep tree structure but limit depth
      lines = lines.filter(l => l.trim());
      break;
    
    case "truncated":
      // Keep first N lines with indicator
      break;
    
    case "passthrough":
    default:
      break;
  }
  
  // Apply line limit
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept.push(`... (${lines.length - maxLines} more lines)`);
    return kept.join("\n");
  }
  
  return lines.join("\n");
}

/**
 * Calculate token savings
 */
function estimateTokens(text) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

export function registerSmartCmdTools(server) {
  server.tool(
    "smart_cmd",
    "Runs a shell command with smart output filtering to reduce token consumption. Automatically detects command type and applies appropriate filtering (compact, failures-only, dedup, etc.). Returns filtered output with token savings stats.",
    {
      command: z.string().describe("Shell command to execute"),
      max_lines: z.number().optional().describe("Maximum lines in output (default: auto-detect per command)"),
      strategy: z.enum(["auto", "compact", "failures_only", "dedup", "oneline", "condensed", "passthrough"]).optional().describe("Filter strategy (default: auto-detect)")
    },
    async ({ command, max_lines, strategy }) => {
      // Security: Validate command against allowlist
      const blockReason = validateCommand(command);
      if (blockReason) {
        return { content: [{ type: "text", text: `SECURITY: ${blockReason}` }] };
      }
      const startTime = Date.now();
      
      
      // Detect command and get filter config
      const { pattern, filter } = detectCommand(command);
      const effectiveStrategy = strategy || filter.strategy;
      const effectiveMaxLines = max_lines || filter.maxLines || 50;
      
      // Execute command
      let rawOutput = "";
      let exitCode = 0;
      try {
        rawOutput = execSync(command, {
          encoding: "utf-8",
          timeout: 30000,
          stdio: ["pipe", "pipe", "pipe"],
          shell: true
        });
      } catch (e) {
        rawOutput = (e.stderr || e.stdout || e.message || "").trim();
        exitCode = e.status || 1;
      }
      
      // Apply filtering
      const filtered = filterOutput(rawOutput, effectiveStrategy, effectiveMaxLines, filter.removePattern);
      
      // Calculate stats
      const rawTokens = estimateTokens(rawOutput);
      const filteredTokens = estimateTokens(filtered);
      const savingsPercent = rawTokens > 0 ? Math.round(((rawTokens - filteredTokens) / rawTokens) * 100) : 0;
      const duration = Date.now() - startTime;
      
      const report = [
        `SMART CMD: ${command}`,
        "═══════════════════════════════════════",
        `Strategy: ${effectiveStrategy} | Exit: ${exitCode} | Time: ${duration}ms`,
        `Raw: ~${rawTokens.toLocaleString()} tokens (${rawOutput.split("\\n").length} lines)`,
        `Filtered: ~${filteredTokens.toLocaleString()} tokens (${filtered.split("\\n").length} lines)`,
        `Savings: ${savingsPercent}%`,
        "",
        "## Output",
        filtered
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  server.tool(
    "smart_cmd_batch",
    "Runs multiple shell commands with smart filtering and returns a consolidated report. Useful for running git status, test, and lint in one call.",
    {
      commands: z.array(z.string()).describe("Array of shell commands to execute"),
      max_lines_per: z.number().optional().describe("Max lines per command output (default: 20)")
    },
    async ({ commands, max_lines_per }) => {
      // Security: Validate all commands against allowlist
      const blocked = commands.map(cmd => ({ cmd, reason: validateCommand(cmd) })).filter(x => x.reason);
      if (blocked.length > 0) {
        return { content: [{ type: "text", text: `SECURITY: ${blocked.length} command(s) blocked:\n${blocked.map(b => `  ${b.cmd}: ${b.reason}`).join("\n")}` }] };
      }
      const startTime = Date.now();
      
      const results = [];
      let totalRawTokens = 0;
      let totalFilteredTokens = 0;
      
      for (const cmd of commands) {
        const { filter } = detectCommand(cmd);
        const effectiveMaxLines = max_lines_per || filter.maxLines || 20;
        
        let rawOutput = "";
        let exitCode = 0;
        try {
          rawOutput = execSync(cmd, {
            encoding: "utf-8",
            timeout: 15000,
            stdio: ["pipe", "pipe", "pipe"],
            shell: true
          });
        } catch (e) {
          rawOutput = (e.stderr || e.stdout || e.message || "").trim();
          exitCode = e.status || 1;
        }
        
        const filtered = filterOutput(rawOutput, filter.strategy, effectiveMaxLines, filter.removePattern);
        const rawTokens = estimateTokens(rawOutput);
        const filteredTokens = estimateTokens(filtered);
        
        totalRawTokens += rawTokens;
        totalFilteredTokens += filteredTokens;
        
        results.push({
          command: cmd,
          exitCode,
          rawTokens,
          filteredTokens,
          savings: rawTokens > 0 ? Math.round(((rawTokens - filteredTokens) / rawTokens) * 100) : 0,
          output: filtered
        });
      }
      
      const totalSavings = totalRawTokens > 0 ? Math.round(((totalRawTokens - totalFilteredTokens) / totalRawTokens) * 100) : 0;
      const duration = Date.now() - startTime;
      
      const report = [
        "SMART CMD BATCH",
        "═══════════════════════════════════════",
        `Commands: ${commands.length} | Time: ${duration}ms`,
        `Total raw: ~${totalRawTokens.toLocaleString()} tokens`,
        `Total filtered: ~${totalFilteredTokens.toLocaleString()} tokens`,
        `Total savings: ${totalSavings}%`,
        "",
        ...results.map(r => [
          `## ${r.command} [exit:${r.exitCode}] (-${r.savings}%)`,
          r.output,
          ""
        ].join("\n"))
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );
}
