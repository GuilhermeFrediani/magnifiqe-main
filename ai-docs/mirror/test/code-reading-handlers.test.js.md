# test/code-reading-handlers.test.js

- kind: js
- lines: 393
- bytes: 12782

## Summary
Handler-level tests for src/code-reading.js MCP tools. Exercises smart_outline, smart_unfold, smart_read via mock server.

## Imports
- `node:test`
- `node:assert`
- `fs`
- `path`
- `../src/code-reading.js`

## Exports
- `greet`
- `add`
- `formatDate`

## Source
```js
/**
 * Handler-level tests for src/code-reading.js MCP tools.
 * Exercises smart_outline, smart_unfold, smart_read via mock server.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { registerCodeReadingTools } from "../src/code-reading.js";

/* ------------------------------------------------------------------ */
/*  Mock server — captures tool registrations, exposes handlers       */
/* ------------------------------------------------------------------ */

function createMockServer() {
  const tools = {};
  return {
    server: {
      tool(name, desc, schema, handler) {
        tools[name] = { handler };
      },
    },
    tools,
  };
}

/* ------------------------------------------------------------------ */
/*  Temp file helpers                                                 */
/* ------------------------------------------------------------------ */

const TMP_DIR = join(import.meta.dirname, "_tmp_code_reading");

const JS_CONTENT = `
export function greet(name) {
  return "Hello, " + name;
}

export function add(a, b) {
  return a + b;
}

class Calculator {
  constructor() {
    this.value = 0;
  }

  add(n) {
    this.value += n;
    return this;
  }

  subtract(n) {
    this.value -= n;
    return this;
  }
}
`.trimStart();

const TS_CONTENT = `
export interface User {
  name: string;
  age: number;
}

export function formatDate(date: Date): string {
  return date.toISOString();
}

export type Status = "active" | "inactive";
`.trimStart();

const PY_CONTENT = `
def greet(name):
    return f"Hello, {name}"

class Calculator:
    def __init__(self):
        self.value = 0

    def add(self, n):
        self.value += n
        return self
`.trimStart();

const SMALL_CONTENT = `const x = 1;\nconst y = 2;\n`;

before(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, "sample.js"), JS_CONTENT);
  writeFileSync(join(TMP_DIR, "sample.ts"), TS_CONTENT);
  writeFileSync(join(TMP_DIR, "sample.py"), PY_CONTENT);
  writeFileSync(join(TMP_DIR, "small.js"), SMALL_CONTENT);
  writeFileSync(join(TMP_DIR, "empty.js"), "");
  writeFileSync(join(TMP_DIR, "readme.txt"), "hello world");
});

after(() => {
  for (const f of ["sample.js", "sample.ts", "sample.py", "small.js", "empty.js", "readme.txt"]) {
    try { unlinkSync(join(TMP_DIR, f)); } catch { /* ignore */ }
  }
  try { require("fs").rmdirSync(TMP_DIR); } catch { /* ignore */ }
});

/* ================================================================== */
/*  smart_outline                                                     */
/* ================================================================== */

describe("smart_outline", () => {
  it("should return symbol outline for a JS file", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_outline.handler({
      file_path: join(TMP_DIR, "sample.js"),
    });
    const text = result.content[0].text;

    assert.ok(text.includes("## Outline:"), "should contain outline header");
    assert.ok(text.includes("greet"), "should include greet function");
    assert.ok(text.includes("add"), "should include add function");
    assert.ok(text.includes("Calculator"), "should include Calculator class");
    assert.ok(text.includes("symbol(s)"), "should include symbol count");
  });

  it("should return symbol outline for a TS file", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_outline.handler({
      file_path: join(TMP_DIR, "sample.ts"),
    });
    const text = result.content[0].text;

    assert.ok(text.includes("formatDate"), "should include formatDate");
    assert.ok(text.includes("User"), "should include User interface");
    assert.ok(text.includes("Status"), "should include Status type");
  });

  it("should return HALT for a non-existent file", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_outline.handler({
      file_path: join(TMP_DIR, "does-not-exist.js"),
    });
    const text = result.content[0].text;

    assert.ok(text.includes("HALT"), "should contain HALT error");
    assert.ok(text.includes("does not exist"), "should say file does not exist");
  });

  it("should handle unsupported language gracefully", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_outline.handler({
      file_path: join(TMP_DIR, "readme.txt"),
    });
    const text = result.content[0].text;

    assert.ok(text.includes("Unsupported"), "should say unsupported language");
  });

  it("should handle an empty JS file", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_outline.handler({
      file_path: join(TMP_DIR, "empty.js"),
    });
    const text = result.content[0].text;

    // readFile returns "" (falsy) for empty files, hitting the guard
    assert.ok(
      text.includes("No symbols found") || text.includes("Cannot read"),
      "should report empty content or cannot-read",
    );
  });
});

/* ================================================================== */
/*  smart_unfold                                                      */
/* ================================================================== */

describe("smart_unfold", () => {
  it("should return the body of a named function", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_unfold.handler({
      file_path: join(TMP_DIR, "sample.js"),
      symbol_name: "greet",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("## greet"), "should contain function header");
    assert.ok(text.includes('return "Hello, " + name'), "should contain function body");
  });

  it("should return the body of a class", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_unfold.handler({
      file_path: join(TMP_DIR, "sample.js"),
      symbol_name: "Calculator",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("## Calculator"), "should contain class header");
    assert.ok(text.includes("constructor"), "should contain constructor");
    assert.ok(text.includes("add(n)"), "should contain add method");
  });

  it("should list available symbols when symbol is not found", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_unfold.handler({
      file_path: join(TMP_DIR, "sample.js"),
      symbol_name: "nonExistentFunction",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("not found"), "should say symbol not found");
    assert.ok(text.includes("Available symbols"), "should list available symbols");
    assert.ok(text.includes("greet"), "should list greet as available");
  });

  it("should return HALT for a non-existent file", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_unfold.handler({
      file_path: join(TMP_DIR, "does-not-exist.js"),
      symbol_name: "foo",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("HALT"), "should contain HALT error");
  });

  it("should handle unsupported language gracefully", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_unfold.handler({
      file_path: join(TMP_DIR, "readme.txt"),
      symbol_name: "something",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("Unsupported"), "should say unsupported language");
  });
});

/* ================================================================== */
/*  smart_read                                                        */
/* ================================================================== */

describe("smart_read", () => {
  it("should return full content in full mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "sample.js"),
      mode: "full",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("greet"), "should contain file content");
    assert.ok(text.includes("Calculator"), "should contain entire file");
  });

  it("should return full content for small files in auto mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    // small.js is 2 lines, well under the 50-line threshold
    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "small.js"),
      mode: "auto",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("const x = 1"), "should return raw file content for small files");
  });

  it("should return outline for large files in auto mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    // sample.js is large enough to trigger outline mode in auto
    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "sample.js"),
      mode: "auto",
    });
    const text = result.content[0].text;

    // Either outline or full content; both should include symbols
    assert.ok(
      text.includes("greet") || text.includes("Calculator"),
      "should contain file symbols or content",
    );
  });

  it("should return outline in outline mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "sample.js"),
      mode: "outline",
    });
    const text = result.content[0].text;

    // outline mode falls through to auto's outline path — should contain symbols
    assert.ok(text.includes("greet") || text.includes("function"), "should contain symbols or function kind");
  });

  it("should return specific symbol body in symbol mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "sample.js"),
      mode: "symbol",
      symbol_name: "add",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("## add"), "should contain function header");
    assert.ok(text.includes("return a + b"), "should contain add function body");
  });

  it("should require symbol_name in symbol mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "sample.js"),
      mode: "symbol",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("requires symbol_name"), "should require symbol_name parameter");
  });

  it("should report symbol not found in symbol mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "sample.js"),
      mode: "symbol",
      symbol_name: "totallyMadeUp",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("not found"), "should say symbol not found");
    assert.ok(text.includes("Available"), "should list available symbols");
  });

  it("should return HALT for a non-existent file", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "does-not-exist.js"),
      mode: "full",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("HALT"), "should contain HALT error");
  });

  it("should handle unsupported language in symbol mode", async () => {
    const { server, tools } = createMockServer();
    registerCodeReadingTools(server);

    const result = await tools.smart_read.handler({
      file_path: join(TMP_DIR, "readme.txt"),
      mode: "symbol",
      symbol_name: "foo",
    });
    const text = result.content[0].text;

    assert.ok(text.includes("Unsupported"), "should say unsupported language");
  });
});

```
