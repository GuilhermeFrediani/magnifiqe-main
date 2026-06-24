# Stack Perfeita MCP v5.0.0

**MCP server for code discipline with Karpathy anti-slop guidelines, token economy, and modular architecture enforcement.**

[![Cursor](https://img.shields.io/badge/Cursor-Ready-purple)](https://cursor.com)
[![Windsurf](https://img.shields.io/badge/Windsurf-Ready-blue)](https://windsurf.com)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-orange)](https://claude.ai)
[![VS Code](https://img.shields.io/badge/VS_Code-Ready-blue)](https://code.visualstudio.com)

---

## What This MCP Delivers

- **Karpathy Anti-Slop Guidelines** — 4 pillars to reduce hallucinations and overcomplication
- **Token Economy** — 11 tools for 50-70% token reduction (shrink, profiles, smart_cmd, compress)
- **Modular Architecture Enforcement** — Mandatory separation of concerns
- **Automatic Activation** — Runs on every session start without manual commands
- **174 MCP Tools** — Validation, compression, monitoring, and token economy
- **State Management** — Checkpoints, compaction, and session health
- **Security Scanning** — SAST, dependency validation, and prompt injection detection
- **Adversarial Verification** — Santa Method dual-review for hallucination detection

---

## Quick Start (Automatic Activation)

### Step 1: Add to your project

```bash
# Clone or copy magnifiqe-main to your project
cp -r /path/to/magnifiqe-main /path/to/your-project/
```

### Step 2: Configure MCP

Create `.cursor/mcp.json` (Cursor) or use the configuration below:

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "node",
      "args": ["magnifiqe-main/src/index.js", "--project-root", "."],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Step 3: Done

The MCP activates automatically on session start. No manual commands needed.

---

## Automatic Activation

**Once configured, the MCP runs automatically:**

1. **Session Start** → `activate_project()` loads project context
2. **Token Economy** → `shrink_stats()` + `profile_status()` show savings potential
3. **Rule Loading** → Karpathy guidelines + modular architecture rules load
4. **Pre-Tool Validation** → Each tool call validates against guidelines
5. **Compliance Monitoring** → Dashboard tracks adherence in real-time

**You don't need to:**
- Run any commands to start the MCP
- Manually load rules or guidelines
- Remember to call activation tools
- Configure anything after initial setup

---

## Token Economy (NEW in v5.0.0)

### 11 Tools for 50-70% Token Reduction

| Tool | Description | Savings |
|------|-------------|---------|
| `shrink_text` | Compress prose (caveman-style) | ~35% |
| `shrink_tool_descriptions` | Bulk compress MCP tool descriptions | ~35% |
| `shrink_stats` | Show token savings potential | — |
| `profile_select` | Select tool profile (full/core/lean/ultra/tiny) | up to 88% |
| `profile_status` | Show current profile and tool count | — |
| `profile_filter_tools` | List tools for current profile | — |
| `smart_cmd` | Run shell commands with smart filtering | 16-47% |
| `smart_cmd_batch` | Run multiple commands with filtering | variable |
| `compress_memory_file` | Compress CLAUDE.md and ai-rules | ~46% |
| `compress_memory_batch` | Batch compress memory files | ~46% |
| `compress_memory_preview` | Preview compression without modifying | — |

### Token Profiles

| Profile | Tools | Estimated Tokens | Use Case |
|---------|-------|-----------------|----------|
| `full` | 174 | ~8,800 | Full feature set |
| `core` | 78 | ~5,800 | Daily coding |
| `lean` | 58 | ~3,100 | Essential tools |
| `ultra` | 40 | ~2,100 | Hot tools only |
| `tiny` | 20 | ~1,070 | Quick questions |

### Usage

```bash
# Check token savings
shrink_stats()

# Select profile for daily work
profile_select(profile: "core")

# Compress a shell command output
smart_cmd(command: "git status")

# Preview compression before applying
compress_memory_preview(file_path: "CLAUDE.md")
```

---

## Karpathy Anti-Slop Guidelines

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ASK.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

---

## Available Tools (174 Total)

### Token Economy (11 tools)
- `shrink_text`, `shrink_tool_descriptions`, `shrink_stats`
- `profile_select`, `profile_status`, `profile_filter_tools`
- `smart_cmd`, `smart_cmd_batch`
- `compress_memory_file`, `compress_memory_batch`, `compress_memory_preview`

### Karpathy Tools (6 tools)
- `evaluate_karpathy_compliance`, `get_karpathy_dashboard`
- `test_code_simplicity`, `test_goal_driven`
- `get_karpathy_stats`, `get_karpathy_impact`

### Validation Tools (4 tools)
- `validate_bad_code`, `validate_response_style`
- `validate_git_commit`, `dependency_validate`

### Anti-Hallucination (5 tools)
- `detect_hallucination`, `groundedness_score`
- `detect_output_dedup`, `session_health`, `session_watchdog`

### Compression/CCR (5 tools)
- `compress_tool_output`, `decompress_tool_output`
- `semantic_compress`, `compress_markdown`, `compress_memory_file`

### Santa Method (3 tools)
- `santa_review`, `santa_rubric`, `santa_history`

### Continuous Learning (3 tools)
- `instinct_observe`, `instinct_status`, `instinct_evolve`

### Prompt Optimization (2 tools)
- `prompt_optimize`, `prompt_diagnose`

### Intent-Driven Dev (2 tools)
- `acceptance_criteria`, `risk_assessment`

### Error Handling (2 tools)
- `error_patterns`, `error_audit`

### Verification Pipeline (1 tool)
- `verification_pipeline` (6-phase: Build, TypeCheck, Lint, Test, Security, Diff)

### Eval Harness (3 tools)
- `eval_define`, `eval_run`, `eval_list`

### Token Budget (2 tools)
- `token_budget`, `context_audit`

### Activation Tools (3 tools)
- `activate_project`, `doctor_runtime_setup`, `get_rules_bundle`

### State Management (4 tools)
- `get_project_state`, `save_project_state`, `checkpoint_task`, `resume_task`

### Session Analytics (3 tools)
- `track_session_event`, `get_session_summary`, `analyze_session_patterns`

### Error Recovery (3 tools)
- `classify_error`, `create_recovery_plan`, `execute_recovery`

### Task Management (4 tools)
- `todo`, `start_task_contract`, `assert_step_evidence`, `get_task_checklist`

### CI/CD (4 tools)
- `validate_cicd_config`, `triage_issue`, `review_pr`, `fix_issue`

### Prompt Engineering (5 tools)
- `adapt_prompt`, `scaffold_reasoning`, `inject_few_shot`
- `save_prompt_version`, `ab_test_prompts`

### Performance (4 tools)
- `run_benchmark`, `compare_models`, `estimate_tokens`, `check_context_budget`

### SAST/Security (3 tools)
- `scan_sast_rules`, `detect_prompt_injection`, `generate_policy`

### IDE Integration (3 tools)
- `get_ide_config`, `adapt_for_ide`, `get_ide_workflow`

### Code Reading (3 tools)
- `smart_outline`, `smart_unfold`, `smart_read`

### Caveman (2 tools)
- `caveman_budget`, `validate_caveman_output`

---

## Installation

### From source

```bash
git clone https://github.com/GuilhermeFrediani/magnifiqe.git
cd magnifiqe
npm install
```

---

## IDE Configuration

### Cursor / VS Code

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "node",
      "args": ["magnifiqe-main/src/index.js", "--project-root", "."]
    }
  }
}
```

### Claude Code

```bash
claude mcp add stack-perfeita --command "node magnifiqe-main/src/index.js --project-root ."
```

---

## Scripts

```bash
npm test                              # Run all tests (1113 tests)
npm run dev                           # Development mode with watch
npm run docs:ai                       # Generate AI documentation
npm run validate                      # Validate project
npm start                             # Start MCP server
```

---

## Architecture

```text
src/
├── index.js                 # MCP entrypoint (v5.0.0)
├── config.js                # Configuration and rules
├── activation.js            # Project activation
├── karpathy-hooks.js        # Karpathy validation hooks
├── karpathy-testing.js      # Karpathy compliance testing
├── karpathy-dashboard.js    # Real-time dashboard
├── karpathy-impact.js       # Impact metrics
├── validators.js            # Code validation
├── project-state.js         # State management
├── compression-orchestrator.js # Output compression
├── safety-guards.js         # Rate limiting and security
├── mcp-shrink.js            # Token economy: MCP description compression
├── token-profiles.js        # Token economy: profile-based tool filtering
├── smart-cmd.js             # Token economy: smart shell command wrapper
├── compress-memory.js       # Token economy: memory file compression
├── verification-loop.js     # 6-phase verification pipeline
├── eval-harness.js          # Eval-driven development framework
├── token-budget.js          # Token budget advisor
├── continuous-learning.js   # Instinct-based learning system
├── prompt-optimizer.js      # Prompt optimization
├── intent-driven-dev.js     # Acceptance criteria generation
├── error-handling-patterns.js # Error handling templates
├── santa-method.js          # Adversarial dual-review verification
└── ai-rules/                # Rule files (18 rules)
```

---

## Security

- **Command Injection Protection** — Allowlist of permitted shell commands
- **Path Traversal Protection** — Validates paths within project root
- **Safe Defaults** — `dry_run=true` for file modifications
- **Rate Limiting** — Built-in request throttling

---

## Rules

| Rule | Description |
|------|-------------|
| 00 | Project overview |
| 01 | AI workflow strict |
| 02 | Coding standards |
| 03 | Token economy |
| 04 | Security secrets |
| 05 | Debugging mastery |
| 06 | CI/CD testing |
| 07 | Frontend semantic |
| 08 | Backend architecture |
| 09 | Bad patterns halt |
| 10 | LLM behavioral rules |
| 11 | Systematic debugging |
| 14 | Modular frontend |
| 15 | Modular backend |
| 16 | Debug discipline |
| 17 | Anti-complexity |
| 18 | Karpathy guidelines |
| 19 | Fullstack architecture |

---

## License

MIT

---

**Automatic activation. Token economy. No manual commands. Just configure and code.**
