/**
 * Importing this module (for its side effects only) registers every known
 * L.E.O. tool executor into execution/tool-executor-registry.ts. Nothing
 * is exported — the act of importing it is the wiring step.
 *
 * execution-engine.ts imports this once, at load time, so that `execute()`
 * always has a fully populated registry to look up against. No other file
 * needs to import the individual capability modules directly.
 */

// Layer 2 — PC / system tools
import "../tools/pc-core-tools.ts";
import "../tools/pc-setup-tools.ts";
import "../tools/software-engineering-tools.ts";
import "../tools/system-update-tools.ts";
import "../tools/git-tools.ts";
import "../tools/docker-tools.ts";
import "../tools/web-tools.ts";
import "../tools/voice-tools.ts";

// Layer 2 — knowledge, backup, diagnostics
import "../knowledge/local-knowledge.ts";
import "../backup/backup-manager.ts";
import "../diagnostics/diagnostics-tool-executors.ts";

// Layer 0 — security policy
import "../security/policy-store.ts";

// Layer 0 — memory (versioned create/update/delete/search, closing a
// previous gap where memory could only be recalled for AI context, never
// actually written through the normal execution gate)
import "../memory/memory-tool-executors.ts";

// Layer 4 — multi-user / family identity
import "../identity/family-tool-executors.ts";

// Layer 3 — agent lifecycle
import "../agents/agent-tool-executors.ts";
