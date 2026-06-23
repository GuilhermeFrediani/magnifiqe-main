# Stack Perfeita MCP v4.8.0

**MCP server for code discipline with Karpathy anti-slop guidelines and modular architecture enforcement.**

[![Cursor](https://img.shields.io/badge/Cursor-Ready-purple)](https://cursor.com)
[![Windsurf](https://img.shields.io/badge/Windsurf-Ready-blue)](https://windsurf.com)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-orange)](https://claude.ai)
[![VS Code](https://img.shields.io/badge/VS_Code-Ready-blue)](https://code.visualstudio.com)

---

## What This MCP Delivers

- **Karpathy Anti-Slop Guidelines** — 4 pillars to reduce hallucinations and overcomplication
- **Modular Architecture Enforcement** — Mandatory separation of concerns
- **Automatic Activation** — Runs on every session start without manual commands
- **Real MCP Tools** — 100+ validation, compression, and monitoring tools
- **State Management** — Checkpoints, compaction, and session health
- **Security Scanning** — SAST, dependency validation, and prompt injection detection

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
2. **Rule Loading** → Karpathy guidelines + modular architecture rules load
3. **Pre-Tool Validation** → Each tool call validates against guidelines
4. **Compliance Monitoring** → Dashboard tracks adherence in real-time

**You don't need to:**
- Run any commands to start the MCP
- Manually load rules or guidelines
- Remember to call activation tools
- Configure anything after initial setup

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
- No "flexibility" or "configurability" that wasn't requested.
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
- "Refactor X" → "Ensure tests pass before and after"

---

## Modular Architecture Rules

### Frontend
```
styles/
├── global.css     → reset, :root variables, base
├── nav.css        → only navigation styles
├── header.css     → only header styles
├── main.css       → only main content styles
├── footer.css     → only footer styles
└── index.css      → only @import statements
```

### Backend
```
src/
├── routes/        → endpoint definition only
├── controllers/   → request/response handling only
├── services/      → business logic, no DB access
├── repositories/  → all DB queries isolated
├── models/        → entity/schema definitions
├── middlewares/   → auth, validation, error handling
├── config/        → env vars, DB connection
└── utils/         → shared helpers
```

### Database
```
database/
├── migrations/    → schema changes via migration files
├── seeds/         → test data separate from migrations
└── schema.sql     → reference snapshot (optional)
```

---

## Available Tools

### Karpathy Tools
- `evaluate_karpathy_compliance` — Score against 4 pillars (0-100)
- `get_karpathy_dashboard` — Real-time compliance monitoring
- `test_code_simplicity` — Detect overcomplication
- `test_goal_driven` — Verify success criteria

### Validation Tools
- `validate_bad_code` — Check code quality
- `validate_response_style` — Check response verbosity
- `validate_git_commit` — Validate commit messages
- `dependency_validate` — Validate imports and dependencies

### Activation Tools
- `activate_project` — Load project context (automatic)
- `doctor_runtime_setup` — Verify environment
- `get_rules_bundle` — Load all rules

### State Management
- `get_project_state` — Get current state
- `checkpoint_task` — Save state snapshot
- `resume_task` — Restore from checkpoint

### Compression
- `compress_tool_output` — Compress tool outputs
- `decompress_tool_output` — Restore compressed outputs

### Monitoring
- `session_health` — Session diagnostics
- `detect_output_dedup` — Detect repeated outputs

---

## Installation

### From npm (recommended)

```bash
npm install -g stack-perfeita-mcp
```

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

### Windsurf

Add to `.windsurfrules`:

```
Call activate_project() at session start.
```

### Claude Code

```bash
claude mcp add stack-perfeita --command "node magnifiqe-main/src/index.js --project-root ."
```

### GitHub Copilot

Add to `.github/copilot-instructions.md`:

```markdown
Call activate_project() at session start.
Follow Karpathy guidelines.
```

---

## Scripts

```bash
npm test                    # Run all tests
npm run dev                 # Development mode with watch
npm run docs:ai             # Generate AI documentation
npm run validate            # Validate project
npm start                   # Start MCP server
```

---

## Architecture

```text
src/
├── index.js                 # MCP entrypoint
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
└── ai-rules/                # Rule files (20 rules)
```

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

**Automatic activation. No manual commands. Just configure and code.**
