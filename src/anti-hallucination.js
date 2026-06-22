/**
 * Stack Perfeita MCP — Anti-Hallucination orchestrator
 * Thin delegation layer that registers all anti-hallucination tools
 * by delegating to focused sub-modules:
 *
 * - verification.js: file/symbol verification, hallucination detection,
 *   groundedness scoring, incremental diff tracking
 * - watchdog.js: output dedup tracking, session watchdog timing,
 *   test execution monitoring, session health diagnostics
 * - caveman.js: output budget enforcement, caveman mode validation,
 *   auto-validation chain
 * - prompt-injection.js: prompt injection attack detection
 */

import { registerVerificationTools } from "./verification.js";
import { registerWatchdogTools } from "./watchdog.js";
import { registerCavemanTools } from "./caveman.js";
import { registerPromptInjectionTools } from "./prompt-injection.js";

// Re-export sub-module registrations for direct access if needed
export { registerVerificationTools } from "./verification.js";
export { registerWatchdogTools } from "./watchdog.js";
export { registerCavemanTools } from "./caveman.js";
export { registerPromptInjectionTools } from "./prompt-injection.js";

/**
 * Registers all anti-hallucination tools on the MCP server.
 * This is the single entry point consumed by index.js.
 */
export function registerAntiHallucinationTools(server) {
  registerVerificationTools(server);
  registerWatchdogTools(server);
  registerCavemanTools(server);
  registerPromptInjectionTools(server);
}
