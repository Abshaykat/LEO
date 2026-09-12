import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTool, listAiTools } from "../permissions/tool-registry.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("=== L.E.O. ARCHITECTURE-DECOUPLING TEST ===");

  // 1. Source-level guard: execution-engine.ts itself must never import any
  //    specific capability module directly. Its only capability-layer
  //    dependency is the single bootstrap import of register-tools.ts.
  //    This test exists so a future edit that reintroduces a direct
  //    `import ... from "../tools/..."` (etc.) into execution-engine.ts
  //    fails loudly here instead of silently reintroducing the coupling.
  {
    const source = await readFile(path.join(__dirname, "execution-engine.ts"), "utf8");
    const forbiddenPrefixes = [
      "../agents/",
      "../tools/",
      "../backup/",
      "../knowledge/",
      "../diagnostics/",
      "../security/"
    ];
    const importLines = source.split("\n").filter(line => /^\s*import\b/.test(line));
    for (const line of importLines) {
      for (const prefix of forbiddenPrefixes) {
        if (line.includes(prefix)) {
          throw new Error(
            `SAFETY FAILURE: execution-engine.ts directly imports a capability module again (${prefix}). ` +
              `Line: ${line.trim()}`
          );
        }
      }
    }
  }
  console.log("PASS: execution-engine.ts contains no direct capability-module imports.");

  // 2. Runtime guard: importing execution-engine.ts alone (this test's only
  //    real import below) must still result in every tool defined in
  //    tool-registry.ts having a real, callable executor — proving the
  //    bootstrap import does its job without anything else needing to
  //    import the individual capability modules first.
  const { execute } = await import("./execution-engine.ts");
  const { getToolExecutor, listRegisteredToolNames } = await import("./tool-executor-registry.ts");

  const allAiTools = listAiTools().map(t => t.name);
  const registered = listRegisteredToolNames();

  const missing = allAiTools.filter(name => !registered.includes(name));
  if (missing.length > 0) {
    throw new Error(`These tools are registered in tool-registry.ts but have NO executor: ${missing.join(", ")}`);
  }
  console.log(`PASS: all ${allAiTools.length} AI-enabled tools have a real registered executor (${registered.length} total registered).`);

  // 3. A genuinely unknown tool name still fails cleanly through execute(),
  //    not through some capability-module-specific error path.
  if (getTool("not.a.real.tool")) throw new Error("Test setup error: that tool name should not exist.");
  const denied = await execute({
    toolName: "not.a.real.tool",
    parameters: {},
    reason: "Architecture test.",
    context: { source: "system", ownerAuthenticated: true }
  });
  if (denied.decision !== "deny") throw new Error("Expected an unknown tool name to be denied.");
  console.log("PASS: an unknown tool name is cleanly denied by execute(), independent of any capability module.");

  console.log("\n=== ARCHITECTURE-DECOUPLING TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
