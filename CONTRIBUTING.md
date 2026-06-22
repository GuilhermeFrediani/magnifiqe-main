# Contributing to Stack Perfeita MCP

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Prerequisites

- **Node.js 18+** (`node --version` to check)
- **npm** (ships with Node)

No build step, no transpilation. The project is plain ES modules.

## Setup

```bash
git clone https://github.com/GuilhermeFrediani/magnifiqe.git
cd magnifiqe
npm install
```

That's it. `npm install` pulls all dependencies (`@modelcontextprotocol/sdk`, `zod`, `acorn`, `@babel/parser`).

## Running Tests

```bash
npm test
```

This runs `node --test test/*.test.js` -- Node's built-in test runner, no framework required.

For watch mode during development:

```bash
npm run test:watch
```

To run the Council smoke test separately:

```bash
npm run test:smoke:council
```

Full validation (tests + smoke test + AI docs generation):

```bash
npm run validate
```

## Project Structure

```
src/
  index.js                 # MCP server entry point, wires all modules
  config.js                # Constants, path resolution, pattern catalogs
  helpers.js               # File reading, path safety, token utilities
  rate-limiter.js          # Per-tool rate limiting (20 calls/60s window)
  validators.js            # Code, response, and dependency validation
  project-state.js         # Checkpoints, state persistence, resume
  council.js               # 5-bot Council + Chairman sessions
  council-live.js          # Model-agnostic Council runtime (simple/deep/auto)
  compaction.js            # Context compaction utilities
  state-compaction.js      # State-level compaction
  code-reading.js          # Smart outline, unfold, code metrics
  activation.js            # Project activation, runtime doctor, prompt scripts
  roles.js                 # Role definitions and activation
  profiles.js              # Model profiles
  skills.js                # Skill management
  commands.js              # Command management
  memory.js                # Session memory
  dependency-resolution.js # Dependency validation, workspace support
  resources.js             # MCP resource registration

test/
  *.test.js                # One file per module, mirroring src/

ai-rules/                  # Modular markdown rules (loaded on demand)
ai-docs/                   # AI-first markdown mirrors (generated)
```

## Code Style Guidelines

### ES Modules

The project uses `"type": "module"` in `package.json`. All imports use ESM syntax:

```js
import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";
```

No `require()`. Always include the `.js` extension in local imports.

### Zod Schemas

Every MCP tool parameter is defined with Zod:

```js
server.tool(
  "tool_name",
  "Human-readable description of what this tool does.",
  {
    param1: z.string().describe("What param1 is for."),
    param2: z.number().optional().describe("Optional param."),
  },
  async ({ param1, param2 }) => {
    // implementation
  }
);
```

Use `.describe()` on every schema field -- the descriptions become the tool's documentation in IDEs. Use `.optional()` for non-required fields. Use `.default()` when a default makes sense.

### Rate Limiting

Every tool handler must check the rate limiter as its first action:

```js
const rateLimitHit = rateLimiter.check("tool_name");
if (rateLimitHit) {
  return { content: [{ type: "text", text: rateLimitHit }] };
}
```

The rate limiter enforces 20 calls per 60-second window per tool name. This prevents agent loops from overwhelming the server.

### Console Logging

`stdout` is reserved for MCP JSON-RPC. The entry point redirects `console.log` to `stderr`. Do not write to `stdout` directly. Use `process.stderr.write()` or the redirected `console.log` for diagnostics.

### Return Format

All tools return MCP content blocks:

```js
return { content: [{ type: "text", text: "result string" }] };
```

For errors, return a HALT message in the text content rather than throwing.

## How to Add a New MCP Tool

**1. Create or extend a module file in `src/`.**

For a new tool category, create `src/your-category.js`. For a tool in an existing category, add it there.

**2. Export a `register*Tools(server)` function.**

```js
import { z } from "zod";
import { rateLimiter } from "./rate-limiter.js";

export function registerYourTools(server) {
  server.tool(
    "your_tool_name",
    "Description visible to IDEs and agents.",
    {
      input: z.string().describe("The input to process."),
    },
    async ({ input }) => {
      const rateLimitHit = rateLimiter.check("your_tool_name");
      if (rateLimitHit) {
        return { content: [{ type: "text", text: rateLimitHit }] };
      }

      // Your logic here

      return {
        content: [{ type: "text", text: "result" }],
      };
    }
  );
}
```

**3. Wire it in `src/index.js`.**

Add the import and call:

```js
import { registerYourTools } from "./your-category.js";
// ...
registerYourTools(server);
```

**4. Add a test file.**

Create `test/your-category.test.js` (see next section).

**5. Run validation.**

```bash
npm run validate
```

## How to Add a New Test

Tests use Node's built-in `node:test` and `node:assert` -- no external test frameworks.

**1. Create a test file in `test/` named `<module>.test.js`.**

**2. Follow this structure:**

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { yourFunction } from '../src/your-module.js';

describe('yourModule', () => {
  it('should handle the basic case', () => {
    const result = yourFunction('input');
    assert.strictEqual(result, 'expected');
  });

  it('should handle edge cases', () => {
    assert.throws(() => yourFunction(null), /error message/);
  });
});
```

**Test file conventions:**

- One test file per source module
- Import directly from the source module
- Use `describe`/`it` blocks for organization
- Use `beforeEach` to reset state between tests (especially for rate limiters, caches)
- Test behavior, not implementation details
- Cover the happy path, error paths, and boundary conditions
- Keep tests self-contained -- no shared mutable state across `describe` blocks

**3. Run your new tests:**

```bash
npm test
```

## Pull Request Guidelines

1. **Fork and branch.** Create a feature branch from `main`.
2. **Keep changes focused.** One logical change per PR. If you're adding a tool, that's one PR. If you're fixing a bug in an existing tool, that's another.
3. **Add tests.** Every new tool or significant behavior change needs tests. Bug fixes should include a regression test.
4. **Run the full validation before submitting:**

   ```bash
   npm run validate
   ```

   This runs unit tests, the Council smoke test, and regenerates AI docs. All three must pass.

5. **Write clear commit messages.** Describe what changed and why, not how.
6. **Keep PR descriptions practical.** What does this change? Why? How was it tested?

## What Not to Do

- Do not add external dependencies unless strictly necessary. The dependency footprint is intentionally small.
- Do not use `console.log` for output -- it breaks the MCP protocol on stdout.
- Do not skip the rate limiter check in tool handlers.
- Do not add TypeScript or build tools. The project is plain JavaScript.
- Do not create abstract abstractions for a single use case. Keep it concrete.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
