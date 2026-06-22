/**
 * Stack Perfeita MCP — IDE Rules (GAP-7)
 * IDE-specific configurations, workflows, output adaptation, and issue diagnosis.
 * Covers: Cursor, Windsurf, Copilot, Claude Code, VS Code, Generic.
 */

import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

// ─── IDE Configurations ─────────────────────────────────────────────────────
const IDE_CONFIGS = {
  cursor: {
    name: "Cursor",
    mcp_config: {
      command: "node",
      args: ["src/index.js"],
      env: { NODE_ENV: "production" },
      note: "Cursor uses MCP natively via Settings > AI > MCP. Add server in .cursor/mcp.json or global settings.",
    },
    extensions: [
      "cursor.cursor-reasoning",
      "bradlc.vscode-tailwindcss",
      "esbenp.prettier-vscode",
      "dbaeumer.vscode-eslint",
      "ms-vscode.vscode-typescript-next",
    ],
    settings: {
      "cursor.mcpServers": { description: "MCP servers defined in settings or .cursor/mcp.json" },
      "cursor.ai.enableCodeActions": true,
      "cursor.tab.enableAutoEdit": true,
      "editor.inlineSuggest.enabled": true,
      "terminal.integrated.enablePersistentSessions": true,
    },
    workflow_tips: [
      "Use Cmd+K for inline edits — pair with MCP context for better suggestions",
      "Cmd+L opens chat with file context; MCP tools run automatically",
      "Use @-mentions to pull specific files into context",
      "Enable 'Yolo Mode' only for trusted MCP servers",
      "Cursor respects .cursorignore for files to exclude from AI indexing",
      "Use diff view to review AI changes before accepting",
    ],
    capabilities: [
      "inline_edit",
      "chat_with_context",
      "composer_multi_file",
      "mcp_native",
      "tab_completion",
      "codebase_indexing",
      "multi_model_support",
      "diff_review",
    ],
  },

  windsurf: {
    name: "Windsurf",
    mcp_config: {
      command: "node",
      args: ["src/index.js"],
      env: { NODE_ENV: "production" },
      note: "Windsurf (Codeium) uses Flow AI. MCP configured via .windsurfrules or settings. Cascade mode recommended.",
    },
    extensions: [
      "codeium.codeium",
      "bradlc.vscode-tailwindcss",
      "esbenp.prettier-vscode",
      "dbaeumer.vscode-eslint",
    ],
    settings: {
      "windsurf.enableCascade": true,
      "windsurf.enableTabAutocomplete": true,
      "windsurf.contextEngine.enabled": true,
      "editor.inlineSuggest.enabled": true,
      "windsurf.flow.mcpServers": { description: "MCP servers for Cascade flow mode" },
    },
    workflow_tips: [
      "Use Cascade (Cmd+I) for multi-step task execution with MCP tools",
      "Windsurf's context engine auto-indexes your project",
      "Use @web to search online docs during coding sessions",
      "Cascade can execute terminal commands — verify before accepting",
      "Windsurf supports .windsurfrules for project-specific AI behavior",
      "Use memories feature to persist preferences across sessions",
    ],
    capabilities: [
      "cascade_mode",
      "flow_execution",
      "tab_autocomplete",
      "context_engine",
      "mcp_native",
      "web_search_inline",
      "memories",
      "terminal_integration",
    ],
  },

  copilot: {
    name: "GitHub Copilot",
    mcp_config: {
      command: "node",
      args: ["src/index.js"],
      env: { NODE_ENV: "production" },
      note: "Copilot Chat supports MCP via .github/copilot-instructions.json or VS Code settings. Agent mode (preview) required for full MCP.",
    },
    extensions: [
      "github.copilot",
      "github.copilot-chat",
      "github.vscode-pull-request-github",
      "bradlc.vscode-tailwindcss",
      "esbenp.prettier-vscode",
    ],
    settings: {
      "github.copilot.enable": { "*": true },
      "github.copilot.chat.localeOverride": "en",
      "github.copilot.chat.codeGeneration.useSelection": true,
      "chat.mcp.enabled": true,
      "github.copilot.chat.agent.enabled": true,
    },
    workflow_tips: [
      "Use Copilot Chat (Cmd+I) for conversational assistance with MCP tools",
      "Agent mode (preview) enables MCP tool execution from chat",
      "Use #file and #selection to reference code in chat",
      "Copilot works best with clear, descriptive function names",
      "Use /explain, /fix, /tests slash commands in chat",
      "Configure custom instructions in .github/copilot-instructions.json",
    ],
    capabilities: [
      "inline_completion",
      "chat_with_context",
      "agent_mode",
      "mcp_support",
      "slash_commands",
      "pr_description",
      "code_review",
      "terminal_commands",
    ],
  },

  "claude-code": {
    name: "Claude Code",
    mcp_config: {
      command: "node",
      args: ["src/index.js"],
      env: { NODE_ENV: "production" },
      note: "Claude Code connects to MCP servers via .mcp.json in project root or ~/.claude/settings.json.",
    },
    extensions: [],
    settings: {
      ".mcp.json": {
        description: "Project-level MCP server configuration for Claude Code",
        example: {
          mcpServers: {
            "stack-perfeita": { command: "node", args: ["src/index.js"] },
          },
        },
      },
      ".claude/settings.json": {
        description: "Global Claude Code settings including MCP servers and permissions",
      },
    },
    workflow_tips: [
      "Place .mcp.json in project root for automatic MCP server connection",
      "Use /mcp to list connected MCP servers and their tools",
      "Claude Code runs in terminal — all MCP tools available via natural language",
      "Use CLAUDE.md for project-specific instructions and conventions",
      "Subagents inherit MCP connections for parallel task execution",
      "Use headroom CLI for token optimization on long sessions",
    ],
    capabilities: [
      "terminal_native",
      "mcp_native",
      "subagents",
      "file_editing",
      "git_integration",
      "test_running",
      "codebase_indexing",
      "session_persistence",
    ],
  },

  vscode: {
    name: "Visual Studio Code",
    mcp_config: {
      command: "node",
      args: ["src/index.js"],
      env: { NODE_ENV: "production" },
      note: "VS Code supports MCP via settings (mcp.servers) or .vscode/mcp.json. Requires VS Code 1.99+ or Insiders.",
    },
    extensions: [
      "ms-vscode.vscode-typescript-next",
      "bradlc.vscode-tailwindcss",
      "esbenp.prettier-vscode",
      "dbaeumer.vscode-eslint",
      "ms-vscode.vscode-json",
      "redhat.vscode-yaml",
    ],
    settings: {
      "mcp.servers": { description: "MCP server definitions in settings.json" },
      "mcp.discovery.enabled": true,
      "editor.inlineSuggest.enabled": true,
      "editor.suggestOnTriggerCharacters": true,
      "typescript.tsserver.experimental.enableProjectDiagnostics": true,
    },
    workflow_tips: [
      "Configure MCP in .vscode/mcp.json for workspace-level servers",
      "Use Ctrl+Shift+P > 'MCP: List Servers' to manage connections",
      "VS Code Copilot Chat can invoke MCP tools via #mcp mentions",
      "Use tasks.json to automate build/test workflows alongside AI",
      "Enable Dev Containers for isolated MCP server environments",
      "Use settings sync to share MCP config across machines",
    ],
    capabilities: [
      "mcp_support",
      "copilot_integration",
      "debugger",
      "terminal",
      "extensions_marketplace",
      "remote_containers",
      "tasks_automation",
      "settings_sync",
    ],
  },

  generic: {
    name: "Generic (Any Editor)",
    mcp_config: {
      command: "node",
      args: ["src/index.js"],
      env: { NODE_ENV: "production" },
      note: "Generic MCP configuration works with any editor that supports the Model Context Protocol via stdio transport.",
    },
    extensions: [],
    settings: {
      mcp_transport: "stdio",
      mcp_protocol_version: "2024-11-05",
    },
    workflow_tips: [
      "Any editor supporting MCP via stdio can use this server",
      "Configure your AI client to launch: node src/index.js",
      "Ensure Node.js 18+ is available in PATH",
      "Check MCP server logs in stderr for debugging",
      "Use the rate limiter to prevent tool call loops",
    ],
    capabilities: [
      "mcp_stdio_transport",
      "tool_discovery",
      "resource_access",
      "bidirectional_communication",
    ],
  },
};

// ─── IDE Workflows ───────────────────────────────────────────────────────────
const IDE_WORKFLOWS = {
  cursor: {
    "code_review": [
      { step: 1, action: "Open file to review", ide_feature: "File explorer", tips: ["Use Cmd+P for quick file navigation"] },
      { step: 2, action: "Select code range for review", ide_feature: "Selection highlight", tips: ["Triple-click to select entire function"] },
      { step: 3, action: "Open Composer with selection", ide_feature: "Cmd+L chat", tips: ["Include relevant test files via @-mention"] },
      { step: 4, action: "Request code review analysis", ide_feature: "AI Chat", tips: ["Ask for security, performance, and readability review"] },
      { step: 5, action: "Apply suggested fixes via diff view", ide_feature: "Inline diff", tips: ["Review each change before accepting"] },
    ],
    "refactoring": [
      { step: 1, action: "Identify code to refactor", ide_feature: "Find references", tips: ["Right-click > Find All References"] },
      { step: 2, action: "Open Composer for multi-file edit", ide_feature: "Composer mode", tips: ["Include all affected files"] },
      { step: 3, action: "Describe refactoring goal", ide_feature: "AI Composer", tips: ["Be specific about desired outcome"] },
      { step: 4, action: "Review and apply changes across files", ide_feature: "Diff review", tips: ["Check imports and type consistency"] },
      { step: 5, action: "Run tests to verify refactoring", ide_feature: "Integrated terminal", tips: ["Use npm test or project test command"] },
    ],
    "debugging": [
      { step: 1, action: "Set breakpoints at issue location", ide_feature: "Debug toolbar", tips: ["Use conditional breakpoints for loops"] },
      { step: 2, action: "Start debugging session", ide_feature: "F5 launch", tips: ["Configure launch.json for MCP server"] },
      { step: 3, action: "Ask AI to explain error context", ide_feature: "Chat", tips: ["Paste stack trace into chat"] },
      { step: 4, action: "Apply suggested fix", ide_feature: "Inline edit", tips: ["Use Cmd+K for quick fix"] },
      { step: 5, action: "Verify fix with tests", ide_feature: "Test explorer", tips: ["Run failing tests first"] },
    ],
    "documentation": [
      { step: 1, action: "Select function or module", ide_feature: "Selection", tips: ["Include JSDoc/docstring context"] },
      { step: 2, action: "Request documentation generation", ide_feature: "AI Chat", tips: ["Specify doc style (JSDoc, TSDoc, etc.)"] },
      { step: 3, action: "Review generated docs", ide_feature: "Diff view", tips: ["Check parameter descriptions"] },
      { step: 4, action: "Apply documentation changes", ide_feature: "Inline edit", tips: ["Keep docs concise and accurate"] },
    ],
  },

  windsurf: {
    "code_review": [
      { step: 1, action: "Open Cascade panel", ide_feature: "Cascade (Cmd+I)", tips: ["Ensure Cascade mode is enabled"] },
      { step: 2, action: "Select files for review", ide_feature: "Context engine", tips: ["Let auto-indexing find related files"] },
      { step: 3, action: "Request code review with MCP tools", ide_feature: "Cascade execution", tips: ["Specify review criteria (security, performance)"] },
      { step: 4, action: "Review Cascade suggestions", ide_feature: "Diff view", tips: ["Cascade may suggest multi-file changes"] },
      { step: 5, action: "Apply and verify changes", ide_feature: "Terminal integration", tips: ["Run tests before committing"] },
    ],
    "refactoring": [
      { step: 1, action: "Describe refactoring in Cascade", ide_feature: "Cascade chat", tips: ["Use @-mentions for specific files"] },
      { step: 2, action: "Let Cascade plan multi-step refactoring", ide_feature: "Flow execution", tips: ["Cascade can chain multiple operations"] },
      { step: 3, action: "Review execution plan", ide_feature: "Cascade preview", tips: ["Check each step before proceeding"] },
      { step: 4, action: "Execute refactoring steps", ide_feature: "Cascade actions", tips: ["Monitor terminal output for errors"] },
      { step: 5, action: "Run tests and verify", ide_feature: "Integrated terminal", tips: ["Use @web to check documentation if needed"] },
    ],
    "debugging": [
      { step: 1, action: "Describe issue to Cascade", ide_feature: "Cascade chat", tips: ["Include error messages and stack traces"] },
      { step: 2, action: "Let Cascade analyze codebase", ide_feature: "Context engine", tips: ["Auto-indexing finds related files"] },
      { step: 3, action: "Apply Cascade's suggested fix", ide_feature: "Cascade execution", tips: ["Review changes before accepting"] },
      { step: 4, action: "Verify fix with tests", ide_feature: "Terminal", tips: ["Check both unit and integration tests"] },
    ],
    "documentation": [
      { step: 1, action: "Open Cascade for documentation", ide_feature: "Cascade chat", tips: ["Specify documentation format"] },
      { step: 2, action: "Select code to document", ide_feature: "Context engine", tips: ["Include related types and interfaces"] },
      { step: 3, action: "Generate documentation", ide_feature: "Cascade execution", tips: ["Request inline comments and docstrings"] },
      { step: 4, action: "Review and apply docs", ide_feature: "Diff view", tips: ["Verify accuracy of generated content"] },
    ],
  },

  copilot: {
    "code_review": [
      { step: 1, action: "Open Copilot Chat panel", ide_feature: "Cmd+I chat", tips: ["Ensure Agent mode is enabled for MCP"] },
      { step: 2, action: "Select code for review", ide_feature: "#selection reference", tips: ["Include function signature and context"] },
      { step: 3, action: "Request review with /explain", ide_feature: "Slash commands", tips: ["Use /fix for specific issues"] },
      { step: 4, action: "Apply suggested fixes", ide_feature: "Inline suggestions", tips: ["Tab to accept, Esc to dismiss"] },
      { step: 5, action: "Verify with tests", ide_feature: "Terminal", tips: ["Run relevant test suite"] },
    ],
    "refactoring": [
      { step: 1, action: "Select code to refactor", ide_feature: "Editor selection", tips: ["Include imports and dependencies"] },
      { step: 2, action: "Request refactoring in chat", ide_feature: "Copilot Chat", tips: ["Describe desired refactoring pattern"] },
      { step: 3, action: "Review agent execution plan", ide_feature: "Agent mode", tips: ["Verify plan covers all changes"] },
      { step: 4, action: "Apply changes", ide_feature: "Inline edit", tips: ["Review each file change"] },
      { step: 5, action: "Run tests", ide_feature: "Test explorer", tips: ["Check for regressions"] },
    ],
    "debugging": [
      { step: 1, action: "Paste error in chat", ide_feature: "Copilot Chat", tips: ["Include full stack trace"] },
      { step: 2, action: "Ask for explanation with /explain", ide_feature: "Slash command", tips: ["Ask about root cause, not just fix"] },
      { step: 3, action: "Apply suggested fix", ide_feature: "Inline edit", tips: ["Use Cmd+. for quick actions"] },
      { step: 4, action: "Verify fix", ide_feature: "Terminal", tips: ["Test edge cases"] },
    ],
    "documentation": [
      { step: 1, action: "Position cursor above function", ide_feature: "Editor", tips: ["Ensure existing docs are removed"] },
      { step: 2, action: "Trigger doc generation with /doc", ide_feature: "Slash command", tips: ["Specify doc format in instructions"] },
      { step: 3, action: "Review generated documentation", ide_feature: "Inline suggestion", tips: ["Check parameter descriptions"] },
      { step: 4, action: "Accept or modify", ide_feature: "Tab accept", tips: ["Edit for accuracy if needed"] },
    ],
  },

  "claude-code": {
    "code_review": [
      { step: 1, action: "Navigate to target files", ide_feature: "Terminal navigation", tips: ["Use pwd and ls to orient"] },
      { step: 2, action: "Request code review via natural language", ide_feature: "Claude Code chat", tips: ["Reference specific files by path"] },
      { step: 3, action: "Claude invokes MCP review tools", ide_feature: "MCP tool execution", tips: ["Watch tool calls in terminal output"] },
      { step: 4, action: "Review suggestions and apply fixes", ide_feature: "File editing", tips: ["Claude can edit files directly"] },
      { step: 5, action: "Run tests to verify", ide_feature: "Bash execution", tips: ["Ask Claude to run specific test suites"] },
    ],
    "refactoring": [
      { step: 1, action: "Describe refactoring goal", ide_feature: "Natural language", tips: ["Include expected outcome"] },
      { step: 2, action: "Claude reads affected files", ide_feature: "File reading", tips: ["Claude auto-discovers dependencies"] },
      { step: 3, action: "Claude creates refactoring plan", ide_feature: "Planning", tips: ["Review plan before execution"] },
      { step: 4, action: "Execute refactoring", ide_feature: "File editing", tips: ["Claude edits multiple files"] },
      { step: 5, action: "Run tests and verify", ide_feature: "Bash execution", tips: ["Check for regressions"] },
    ],
    "debugging": [
      { step: 1, action: "Describe the issue", ide_feature: "Natural language", tips: ["Include error messages"] },
      { step: 2, action: "Claude investigates codebase", ide_feature: "File reading + search", tips: ["Claude uses grep and read tools"] },
      { step: 3, action: "Claude identifies root cause", ide_feature: "Analysis", tips: ["Ask for explanation of cause"] },
      { step: 4, action: "Claude applies fix", ide_feature: "File editing", tips: ["Review changes before testing"] },
      { step: 5, action: "Verify fix with tests", ide_feature: "Bash execution", tips: ["Run full test suite"] },
    ],
    "documentation": [
      { step: 1, action: "Specify documentation target", ide_feature: "Natural language", tips: ["Reference files and doc style"] },
      { step: 2, action: "Claude reads code to document", ide_feature: "File reading", tips: ["Claude understands context"] },
      { step: 3, action: "Claude generates documentation", ide_feature: "File writing", tips: ["Supports JSDoc, TSDoc, etc."] },
      { step: 4, action: "Review generated docs", ide_feature: "Diff view", tips: ["Check for accuracy"] },
    ],
  },

  vscode: {
    "code_review": [
      { step: 1, action: "Open file for review", ide_feature: "Explorer", tips: ["Use Ctrl+P for quick open"] },
      { step: 2, action: "Open Copilot Chat panel", ide_feature: "Chat view", tips: ["Ensure MCP server is configured"] },
      { step: 3, action: "Select code and request review", ide_feature: "#selection", tips: ["Use @workspace for broader context"] },
      { step: 4, action: "Review suggestions", ide_feature: "Inline suggestions", tips: ["Use diff view for multi-line changes"] },
      { step: 5, action: "Apply and test", ide_feature: "Terminal", tips: ["Run integrated tests"] },
    ],
    "refactoring": [
      { step: 1, action: "Select code to refactor", ide_feature: "Editor", tips: ["Include type definitions"] },
      { step: 2, action: "Request refactoring in chat", ide_feature: "Copilot Chat", tips: ["Specify refactoring pattern"] },
      { step: 3, action: "Review changes", ide_feature: "Diff view", tips: ["Check all modified files"] },
      { step: 4, action: "Apply changes", ide_feature: "Inline edit", tips: ["Accept line by line"] },
      { step: 5, action: "Run tasks and tests", ide_feature: "Tasks (Ctrl+Shift+B)", tips: ["Configure build tasks in tasks.json"] },
    ],
    "debugging": [
      { step: 1, action: "Set breakpoints", ide_feature: "Debug toolbar", tips: ["Use function breakpoints for complex flows"] },
      { step: 2, action: "Start debugging (F5)", ide_feature: "Launch configuration", tips: ["Configure launch.json properly"] },
      { step: 3, action: "Ask Copilot about error", ide_feature: "Chat", tips: ["Reference stack trace"] },
      { step: 4, action: "Apply fix", ide_feature: "Quick fix (Ctrl+.)", tips: ["Verify fix doesn't break other code"] },
      { step: 5, action: "Verify with tests", ide_feature: "Test explorer", tips: ["Use CodeLens to run individual tests"] },
    ],
    "documentation": [
      { step: 1, action: "Position cursor for docs", ide_feature: "Editor", tips: ["Above function declaration"] },
      { step: 2, action: "Generate documentation", ide_feature: "Copilot Chat /doc", tips: ["Specify doc format"] },
      { step: 3, action: "Review and accept", ide_feature: "Inline suggestion", tips: ["Tab to accept"] },
      { step: 4, action: "Verify doc accuracy", ide_feature: "Preview", tips: ["Check rendered docs"] },
    ],
  },

  generic: {
    "code_review": [
      { step: 1, action: "Connect MCP server", ide_feature: "MCP client config", tips: ["Use stdio transport"] },
      { step: 2, action: "Send review request with file content", ide_feature: "MCP tool call", tips: ["Include file path and content"] },
      { step: 3, action: "Receive analysis", ide_feature: "MCP response", tips: ["Parse JSON response"] },
      { step: 4, action: "Apply fixes manually", ide_feature: "Editor", tips: ["Follow suggestions carefully"] },
      { step: 5, action: "Verify changes", ide_feature: "Terminal", tips: ["Run tests and linters"] },
    ],
    "refactoring": [
      { step: 1, action: "Describe refactoring via MCP", ide_feature: "MCP tool call", tips: ["Include current and target state"] },
      { step: 2, action: "Receive refactoring plan", ide_feature: "MCP response", tips: ["Review suggested changes"] },
      { step: 3, action: "Apply changes manually", ide_feature: "Editor", tips: ["Follow step-by-step instructions"] },
      { step: 4, action: "Verify refactoring", ide_feature: "Terminal", tips: ["Run full test suite"] },
    ],
    "debugging": [
      { step: 1, action: "Send error details via MCP", ide_feature: "MCP tool call", tips: ["Include error message and context"] },
      { step: 2, action: "Receive diagnosis", ide_feature: "MCP response", tips: ["Check suggested fixes"] },
      { step: 3, action: "Apply fix", ide_feature: "Editor", tips: ["Verify fix addresses root cause"] },
      { step: 4, action: "Test fix", ide_feature: "Terminal", tips: ["Test edge cases"] },
    ],
    "documentation": [
      { step: 1, action: "Send code for documentation", ide_feature: "MCP tool call", tips: ["Include function signatures"] },
      { step: 2, action: "Receive generated docs", ide_feature: "MCP response", tips: ["Check format and content"] },
      { step: 3, action: "Insert documentation", ide_feature: "Editor", tips: ["Maintain doc style consistency"] },
    ],
  },
};

// ─── Known IDE Issues ────────────────────────────────────────────────────────
const IDE_ISSUES = {
  cursor: {
    "mcp_server_not_connecting": {
      diagnosis: "Cursor cannot establish connection to MCP server.",
      possible_causes: [
        "Server not listed in .cursor/mcp.json or Cursor settings",
        "Node.js not found in PATH when Cursor spawns the process",
        "Server crashes on startup due to missing dependencies",
        "Port conflict with another MCP server",
        "Stdio transport blocked by firewall or antivirus",
      ],
      fixes: [
        "Add server to .cursor/mcp.json: { \"mcpServers\": { \"name\": { \"command\": \"node\", \"args\": [\"src/index.js\"] } } }",
        "Verify Node.js is in system PATH: open terminal and run 'node --version'",
        "Run 'npm install' in the project directory to install dependencies",
        "Check Cursor Output panel (View > Output > MCP) for error logs",
        "Restart Cursor after configuration changes",
      ],
      severity: "high",
    },
    "ai_not_using_mcp_tools": {
      diagnosis: "Cursor AI chat does not invoke MCP tools during conversations.",
      possible_causes: [
        "MCP server connected but tools not discovered",
        "AI model selected does not support tool use",
        "Tool descriptions too vague for AI to select appropriately",
        "Rate limiter blocking tool calls",
      ],
      fixes: [
        "Check MCP server status in Cursor Settings > AI > MCP",
        "Ensure you're using a model that supports function calling (GPT-4, Claude)",
        "Make tool descriptions specific and action-oriented",
        "Review rate limiter logs for HALT messages",
      ],
      severity: "high",
    },
    "slow_inline_edits": {
      diagnosis: "Cursor inline editing (Cmd+K) is slow or times out.",
      possible_causes: [
        "Large file exceeding context window",
        "MCP server processing delay",
        "Network latency to AI model provider",
        "Too many context files loaded",
      ],
      fixes: [
        "Select smaller code regions for inline edits",
        "Close unnecessary files to reduce context",
        "Check MCP server response time in Output panel",
        "Use Composer mode for larger changes instead of inline edit",
      ],
      severity: "medium",
    },
    "tab_completion_conflicts": {
      diagnosis: "Tab completions conflict with MCP tool suggestions.",
      possible_causes: [
        "Both autocomplete and MCP suggestions active simultaneously",
        "Tab key mapped to multiple actions",
      ],
      fixes: [
        "Configure keybindings to separate autocomplete from MCP acceptance",
        "Disable tab completion during MCP-intensive workflows",
        "Use Cmd+Right to accept MCP suggestions instead of Tab",
      ],
      severity: "low",
    },
  },

  windsurf: {
    "cascade_not_executing": {
      diagnosis: "Windsurf Cascade mode fails to execute MCP tool calls.",
      possible_causes: [
        "Cascade mode not enabled in settings",
        "MCP server not configured in Windsurf settings",
        "Flow context engine not indexing the project",
        "Server response exceeds Cascade timeout",
      ],
      fixes: [
        "Enable Cascade in Settings > Windsurf > Cascade",
        "Add MCP server to .windsurfrules or Windsurf settings",
        "Wait for context engine indexing to complete (check status bar)",
        "Increase Cascade timeout in settings if available",
        "Restart Windsurf to reinitialize Cascade connection",
      ],
      severity: "high",
    },
    "context_engine_not_indexing": {
      diagnosis: "Windsurf context engine not indexing project files.",
      possible_causes: [
        "Project too large for auto-indexing",
        ".windsurfignore excludes key directories",
        "File watchers hitting OS limits",
        "Context engine disabled in settings",
      ],
      fixes: [
        "Add relevant directories to .windsurfignore exclusions",
        "Increase inotify watch limit (Linux) or restart on macOS/Windows",
        "Enable context engine: windsurf.contextEngine.enabled = true",
        "Split large projects into smaller workspaces",
      ],
      severity: "medium",
    },
    "flow_mode_errors": {
      diagnosis: "Windsurf Flow mode produces errors during multi-step execution.",
      possible_causes: [
        "MCP server returns errors mid-execution",
        "Step dependencies not properly resolved",
        "Token limit exceeded during long flows",
      ],
      fixes: [
        "Break complex flows into smaller Cascade invocations",
        "Check MCP server logs for mid-execution errors",
        "Use 'memories' to persist successful flow patterns",
        "Restart Flow session if state becomes inconsistent",
      ],
      severity: "medium",
    },
    "memory_not_persisting": {
      diagnosis: "Windsurf memories (preferences) not persisting across sessions.",
      possible_causes: [
        "Memory storage corrupted",
        "Session data cleared between updates",
        "Storage path configuration issue",
      ],
      fixes: [
        "Manually re-add critical memories after Windsurf updates",
        "Check Windsurf data directory for memory files",
        "Report persistent memory issues to Codeium support",
      ],
      severity: "low",
    },
  },

  copilot: {
    "agent_mode_unavailable": {
      diagnosis: "GitHub Copilot Agent mode not available for MCP tool execution.",
      possible_causes: [
        "Agent mode feature flag not enabled",
        "Copilot subscription does not include Agent mode",
        "VS Code version too old (requires 1.93+)",
        "Extensions not updated",
      ],
      fixes: [
        "Update GitHub Copilot and Copilot Chat extensions to latest",
        "Update VS Code to version 1.93 or later",
        "Check subscription tier — Agent mode requires Copilot Business/Enterprise or Pro+",
        "Enable in settings: github.copilot.chat.agent.enabled = true",
        "Restart VS Code after enabling",
      ],
      severity: "high",
    },
    "mcp_tools_not_discovered": {
      diagnosis: "Copilot Chat cannot discover MCP server tools.",
      possible_causes: [
        "MCP server not configured in VS Code settings",
        "chat.mcp.enabled not set to true",
        "Server not running or crashed",
        "Tool descriptions incompatible with Copilot's parser",
      ],
      fixes: [
        "Enable MCP: chat.mcp.enabled = true in settings.json",
        "Add server to mcp.servers in settings or .vscode/mcp.json",
        "Check VS Code Output panel > MCP for connection errors",
        "Restart VS Code to reinitialize MCP connections",
      ],
      severity: "high",
    },
    "suggestions_not_contextual": {
      diagnosis: "Copilot suggestions not incorporating MCP context properly.",
      possible_causes: [
        "Context window too small for file content",
        "Copilot not aware of MCP-provided context",
        "File not in active workspace",
      ],
      fixes: [
        "Use #file references to explicitly include context in chat",
        "Keep files open in editor to improve context",
        "Use /explain on key functions to prime context",
        "Reduce context by closing irrelevant files",
      ],
      severity: "medium",
    },
    "inline_completion_slow": {
      diagnosis: "Copilot inline completions are slow or not appearing.",
      possible_causes: [
        "Network latency to GitHub servers",
        "Large file causing timeout",
        "Multiple extensions competing for completions",
        "Copilot service experiencing degradation",
      ],
      fixes: [
        "Check GitHub Copilot status page for service issues",
        "Disable conflicting autocomplete extensions",
        "Reduce file size by splitting large files",
        "Increase suggestion delay in settings to reduce frequency",
      ],
      severity: "medium",
    },
  },

  "claude-code": {
    "mcp_json_not_found": {
      diagnosis: "Claude Code cannot find .mcp.json configuration.",
      possible_causes: [
        ".mcp.json not in project root or home directory",
        "JSON syntax error in .mcp.json",
        "File permissions preventing read",
        "Wrong working directory",
      ],
      fixes: [
        "Create .mcp.json in project root with correct format",
        "Validate JSON syntax: node -e \"JSON.parse(require('fs').readFileSync('.mcp.json'))\"",
        "Ensure file is readable by the Claude Code process",
        "Run Claude Code from the project root directory",
      ],
      severity: "high",
    },
    "tools_not_appearing": {
      diagnosis: "MCP tools not appearing in Claude Code's available tools list.",
      possible_causes: [
        "MCP server not starting correctly",
        "Server exports incorrect format",
        "Server crashes during initialization",
        "Network or permission issue with server",
      ],
      fixes: [
        "Test server standalone: echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}' | node src/index.js",
        "Check server stderr output for startup errors",
        "Verify package.json has correct 'type': 'module' for ES modules",
        "Ensure all npm dependencies are installed",
      ],
      severity: "high",
    },
    "session_timeout": {
      diagnosis: "Claude Code session times out during long MCP operations.",
      possible_causes: [
        "MCP server response exceeds session timeout",
        "Server processing too many sequential operations",
        "Token budget exhausted",
      ],
      fixes: [
        "Break complex tasks into smaller subtasks",
        "Use subagents for parallel execution",
        "Monitor token usage with /cost command",
        "Increase timeout if configurable in session settings",
      ],
      severity: "medium",
    },
    "subagent_mcp_access": {
      diagnosis: "Subagents spawned by Claude Code cannot access MCP tools.",
      possible_causes: [
        "MCP connection not inherited by subagent processes",
        "Subagent spawned in different environment",
        "Server limits concurrent connections",
      ],
      fixes: [
        "Verify MCP server supports concurrent connections",
        "Spawn subagents from within the same session context",
        "Check rate limiter for concurrent connection limits",
        "Use local:// files to share context between subagents instead",
      ],
      severity: "medium",
    },
  },

  vscode: {
    "mcp_server_not_registered": {
      diagnosis: "VS Code does not register the MCP server.",
      possible_causes: [
        "mcp.servers not configured in settings.json",
        ".vscode/mcp.json missing or malformed",
        "VS Code version too old (requires 1.99+ for native MCP)",
        "Extension conflict blocking MCP initialization",
      ],
      fixes: [
        "Add server to .vscode/mcp.json: { \"servers\": { \"name\": { \"command\": \"node\", \"args\": [\"src/index.js\"] } } }",
        "Update VS Code to 1.99+ or use Insiders build",
        "Check for conflicting extensions in Extensions view",
        "Run 'MCP: List Servers' command to verify registration",
      ],
      severity: "high",
    },
    "copilot_chat_mcp_disabled": {
      diagnosis: "Copilot Chat in VS Code cannot access MCP tools.",
      possible_causes: [
        "chat.mcp.enabled not set to true",
        "MCP server not connected",
        "Copilot Chat extension outdated",
      ],
      fixes: [
        "Set chat.mcp.enabled = true in settings.json",
        "Update GitHub Copilot Chat extension",
        "Restart VS Code after configuration change",
        "Check Output > MCP for connection status",
      ],
      severity: "high",
    },
    "task_json_mcp_integration": {
      diagnosis: "VS Code tasks.json cannot invoke MCP server commands.",
      possible_causes: [
        "Task configuration missing required fields",
        "MCP server stdio conflict with task runner",
        "ProblemMatcher interfering with output",
      ],
      fixes: [
        "Ensure task has correct 'type', 'command', and 'args'",
        "Use separate terminal for MCP server",
        "Configure ProblemMatcher to handle MCP output format",
        "Test task independently before integrating with MCP",
      ],
      severity: "medium",
    },
    "settings_sync_conflict": {
      diagnosis: "MCP configuration conflicts across synced machines.",
      possible_causes: [
        "Different Node.js paths on different machines",
        "Platform-specific environment variables",
        "Extension versions diverging across machines",
      ],
      fixes: [
        "Use relative paths in MCP server configuration",
        "Set environment variables per-platform in settings",
        "Sync extension versions via Settings Sync",
        "Use workspace-level .vscode/mcp.json instead of global settings",
      ],
      severity: "low",
    },
  },

  generic: {
    "transport_error": {
      diagnosis: "MCP stdio transport connection fails.",
      possible_causes: [
        "Node.js not in PATH",
        "Server crashes on startup",
        "stdin/stdout not properly connected",
        "JSON-RPC protocol mismatch",
      ],
      fixes: [
        "Verify Node.js installation: node --version",
        "Test server directly: echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}' | node src/index.js",
        "Check server stderr for crash logs",
        "Ensure JSON-RPC 2.0 protocol compliance",
      ],
      severity: "high",
    },
    "tool_call_failure": {
      diagnosis: "MCP tool calls return errors or unexpected results.",
      possible_causes: [
        "Tool input schema validation failure",
        "Rate limiter blocking excessive calls",
        "Server-side error in tool handler",
        "Invalid JSON in tool response",
      ],
      fixes: [
        "Verify tool input matches expected Zod schema",
        "Check rate limiter for HALT messages",
        "Review server error logs for handler exceptions",
        "Validate JSON output from server",
      ],
      severity: "medium",
    },
    "resource_not_found": {
      diagnosis: "MCP resource requests return not found.",
      possible_causes: [
        "Resource URI not registered",
        "Resource path incorrect",
        "File permissions preventing access",
      ],
      fixes: [
        "List available resources via resources/list request",
        "Verify resource URI format matches server registration",
        "Check file permissions and paths",
      ],
      severity: "medium",
    },
    "response_parsing_error": {
      diagnosis: "Client cannot parse MCP server responses.",
      possible_causes: [
        "Response exceeds max message size",
        "Non-JSON characters in response",
        "Encoding mismatch (UTF-8 vs ASCII)",
      ],
      fixes: [
        "Check response size limits",
        "Ensure all responses are valid JSON",
        "Force UTF-8 encoding in server and client",
        "Use compression for large responses",
      ],
      severity: "low",
    },
  },
};

// ─── Tool: adapt_for_ide ─────────────────────────────────────────────────────
function adaptOutputForIDE(content, ide, outputType) {
  const notes = [];
  let adapted = content;
  let format = "text";

  switch (ide) {
    case "cursor":
      // Cursor prefers markdown with code fences
      format = "markdown";
      if (outputType === "error") {
        adapted = `**Error**\n\n\`\`\`\n${content}\n\`\`\`\n\n*Review with Cmd+L for AI-assisted fix*`;
        notes.push("Cursor displays markdown natively in chat panels");
        notes.push("Use Cmd+K on the error line for inline fix");
      } else if (outputType === "suggestion") {
        adapted = `### Suggestion\n\n${content}\n\n*Apply with Cmd+K or review in Composer*`;
        notes.push("Suggestions in markdown render with formatting in chat");
      } else if (outputType === "code") {
        adapted = "```javascript\n" + content + "\n```";
        notes.push("Code blocks in Cursor chat are syntax-highlighted");
        notes.push("Click 'Apply' to insert directly into editor");
      } else if (outputType === "warning") {
        adapted = `> ⚠️ **Warning:** ${content}`;
        notes.push("Blockquote warnings stand out in Cursor's markdown renderer");
      } else {
        adapted = content;
      }
      break;

    case "windsurf":
      // Windsurf prefers concise markdown for Cascade
      format = "markdown";
      if (outputType === "error") {
        adapted = `**Error:** ${content}\n\n_Cascade can auto-fix — ask in Cmd+I_`;
        notes.push("Windsurf Cascade can chain fix operations");
        notes.push("Keep error messages concise for better Cascade parsing");
      } else if (outputType === "suggestion") {
        adapted = `**Suggestion:** ${content}`;
        notes.push("Brief suggestions work best with Windsurf's context engine");
      } else if (outputType === "code") {
        adapted = "```\n" + content + "\n```";
        notes.push("Plain code blocks work best — avoid language tags for Cascade");
      } else if (outputType === "warning") {
        adapted = `> **Warning:** ${content}`;
        notes.push("Warnings in blockquotes are well-parsed by Cascade");
      } else {
        adapted = content;
      }
      break;

    case "copilot":
      // Copilot prefers plain text with minimal markdown
      format = "text";
      if (outputType === "error") {
        adapted = `Error: ${content}`;
        notes.push("Copilot Chat parses plain text errors well");
        notes.push("Use /fix command after pasting the error");
      } else if (outputType === "suggestion") {
        adapted = `Suggestion: ${content}`;
        notes.push("Prefix with 'Suggestion:' for Copilot's context parsing");
      } else if (outputType === "code") {
        adapted = content;
        notes.push("Copilot handles plain code — paste directly into chat");
        notes.push("Agent mode can apply code changes directly");
      } else if (outputType === "warning") {
        adapted = `Warning: ${content}`;
        notes.push("Plain text warnings are reliably parsed by Copilot");
      } else {
        adapted = content;
      }
      break;

    case "claude-code":
      // Claude Code handles markdown well
      format = "markdown";
      if (outputType === "error") {
        adapted = `**Error:**\n\`\`\`\n${content}\n\`\`\`\n\n*Claude Code can fix this — describe what you want*`;
        notes.push("Claude Code processes errors well from fenced code blocks");
        notes.push("Include file path for targeted fixes");
      } else if (outputType === "suggestion") {
        adapted = `**Suggestion:** ${content}`;
        notes.push("Claude Code can apply suggestions directly to files");
      } else if (outputType === "code") {
        adapted = "```" + (content.includes("function") || content.includes("const") ? "javascript" : "") + "\n" + content + "\n```";
        notes.push("Claude Code can read and modify code blocks");
      } else if (outputType === "warning") {
        adapted = `> ⚠️ ${content}`;
        notes.push("Warnings in Claude Code terminal are visible in output");
      } else {
        adapted = content;
      }
      break;

    case "vscode":
      // VS Code uses diagnostics and markdown in chat
      format = outputType === "error" || outputType === "warning" ? "diagnostic" : "markdown";
      if (outputType === "error") {
        adapted = `[Error] ${content}`;
        notes.push("VS Code diagnostics panel will display errors");
        notes.push("Configure ProblemMatcher for structured error output");
        notes.push("Errors appear in Problems panel (Ctrl+Shift+M)");
      } else if (outputType === "warning") {
        adapted = `[Warning] ${content}`;
        notes.push("Warnings appear in Problems panel with severity levels");
      } else if (outputType === "suggestion") {
        adapted = `**Suggestion:** ${content}`;
        notes.push("Suggestions display in chat markdown format");
      } else if (outputType === "code") {
        adapted = "```javascript\n" + content + "\n```";
        notes.push("Code blocks in VS Code chat are syntax-highlighted");
      } else {
        adapted = content;
      }
      break;

    default: // generic
      format = "text";
      adapted = content;
      notes.push("Generic mode — no IDE-specific formatting applied");
      break;
  }

  return { adapted, format, ide_specific_notes: notes };
}

// ─── Tool: get_ide_workflow steps estimator ───────────────────────────────────
function estimateTokens(workflow) {
  let total = 0;
  for (const step of workflow) {
    total += step.action.length * 1.3; // ~1.3 tokens per character
    total += step.ide_feature.length * 1.3;
    total += step.tips.reduce((sum, t) => sum + t.length * 1.3, 0);
  }
  return Math.ceil(total);
}

// ─── Tool: diagnose_ide_issues ───────────────────────────────────────────────
function matchIssue(ide, issueDescription) {
  const normalizedDesc = issueDescription.toLowerCase();
  const issueBank = IDE_ISSUES[ide] || IDE_ISSUES.generic;

  // Score each known issue by keyword overlap
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, issue] of Object.entries(issueBank)) {
    const keywords = key.replace(/_/g, " ").split(" ");
    const allText = `${issue.diagnosis} ${key} ${issue.possible_causes.join(" ")}`.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (normalizedDesc.includes(keyword)) score += 3;
    }
    for (const cause of issue.possible_causes) {
      const causeWords = cause.toLowerCase().split(/\s+/);
      for (const word of causeWords) {
        if (word.length > 3 && normalizedDesc.includes(word)) score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = issue;
    }
  }

  // If no strong match, return generic diagnosis
  if (!bestMatch || bestScore < 2) {
    return {
      diagnosis: `Unrecognized issue for ${ide}. Provide more specific details for better diagnosis.`,
      possible_causes: ["Issue description too vague for pattern matching", "May be an undocumented issue"],
      fixes: [
        "Try restarting the IDE and MCP server",
        "Check MCP server logs for error details",
        "Visit project documentation for known issues",
      ],
      severity: "medium",
    };
  }

  return bestMatch;
}

// ─── Register Tools ──────────────────────────────────────────────────────────
export function registerIDERulesTools(server) {
  // ── get_ide_config ──────────────────────────────────────────────────────
  server.tool(
    "get_ide_config",
    "Returns IDE-specific configuration, recommended extensions, MCP setup, settings, and workflow tips for a given IDE. Use before setting up MCP integration.",
    {
      ide: z
        .enum(["cursor", "windsurf", "copilot", "claude-code", "vscode", "generic"])
        .describe("Target IDE to get configuration for"),
    },
    async ({ ide }) => {
      const halt = rateLimiter.check("get_ide_config");
      if (halt) return { content: [{ type: "text", text: halt }] };

      const config = IDE_CONFIGS[ide];
      if (!config) {
        return {
          content: [{ type: "text", text: `HALT — Unknown IDE "${ide}". Supported: cursor, windsurf, copilot, claude-code, vscode, generic` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              config: {
                mcp_config: config.mcp_config,
                extensions: config.extensions,
                settings: config.settings,
                workflow_tips: config.workflow_tips,
              },
              capabilities: config.capabilities,
            }),
          },
        ],
      };
    }
  );

  // ── adapt_for_ide ───────────────────────────────────────────────────────
  server.tool(
    "adapt_for_ide",
    "Adapts tool output for IDE-specific rendering. Transforms content to match IDE conventions (markdown for Cursor, plain text for Copilot, diagnostics for VS Code, etc.).",
    {
      content: z.string().describe("Raw content to adapt for the target IDE"),
      ide: z.enum(["cursor", "windsurf", "copilot", "claude-code", "vscode", "generic"]).describe("Target IDE"),
      output_type: z.enum(["error", "warning", "suggestion", "code", "docs"]).describe("Type of content to adapt"),
    },
    async ({ content, ide, output_type }) => {
      const halt = rateLimiter.check("adapt_for_ide");
      if (halt) return { content: [{ type: "text", text: halt }] };

      const result = adaptOutputForIDE(content, ide, output_type);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              adapted: result.adapted,
              format: result.format,
              ide_specific_notes: result.ide_specific_notes,
            }),
          },
        ],
      };
    }
  );

  // ── get_ide_workflow ────────────────────────────────────────────────────
  server.tool(
    "get_ide_workflow",
    "Returns an optimal step-by-step workflow for a specific IDE and task type. Each step includes the IDE feature to use and practical tips.",
    {
      ide: z.enum(["cursor", "windsurf", "copilot", "claude-code", "vscode", "generic"]).describe("Target IDE"),
      task_type: z.enum(["code_review", "refactoring", "debugging", "documentation"]).describe("Type of task to get workflow for"),
    },
    async ({ ide, task_type }) => {
      const halt = rateLimiter.check("get_ide_workflow");
      if (halt) return { content: [{ type: "text", text: halt }] };

      const workflows = IDE_WORKFLOWS[ide];
      if (!workflows) {
        return {
          content: [{ type: "text", text: `HALT — No workflows defined for IDE "${ide}".` }],
        };
      }

      const workflow = workflows[task_type];
      if (!workflow) {
        return {
          content: [
            {
              type: "text",
              text: `HALT — No "${task_type}" workflow for ${ide}. Available: ${Object.keys(workflows).join(", ")}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              workflow,
              estimated_tokens: estimateTokens(workflow),
            }),
          },
        ],
      };
    }
  );

  // ── diagnose_ide_issues ─────────────────────────────────────────────────
  server.tool(
    "diagnose_ide_issues",
    "Diagnoses common IDE integration issues by matching against known patterns. Returns possible causes, fixes, and severity.",
    {
      ide: z.enum(["cursor", "windsurf", "copilot", "claude-code", "vscode", "generic"]).describe("IDE experiencing the issue"),
      issue_description: z.string().describe("Description of the issue encountered"),
    },
    async ({ ide, issue_description }) => {
      const halt = rateLimiter.check("diagnose_ide_issues");
      if (halt) return { content: [{ type: "text", text: halt }] };

      const result = matchIssue(ide, issue_description);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              diagnosis: result.diagnosis,
              possible_causes: result.possible_causes,
              fixes: result.fixes,
              severity: result.severity,
            }),
          },
        ],
      };
    }
  );
}
