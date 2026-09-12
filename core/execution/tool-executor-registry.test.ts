import {
  registerToolExecutor,
  getToolExecutor,
  listRegisteredToolNames,
  __clearRegistryForTests
} from "./tool-executor-registry.ts";

async function main() {
  console.log("=== L.E.O. TOOL-EXECUTOR-REGISTRY TEST ===");

  __clearRegistryForTests();

  // 1. Register and look up.
  registerToolExecutor("test.echo", async parameters => parameters);
  const found = getToolExecutor("test.echo");
  if (!found) throw new Error("Expected to find the registered executor.");
  const result = await found({ hello: "world" });
  if ((result as any).hello !== "world") throw new Error("Expected the executor to actually run.");
  console.log("PASS: register + lookup + invoke round-trips correctly.");

  // 2. Unknown tool returns undefined, not a throw.
  {
    const missing = getToolExecutor("test.does_not_exist");
    if (missing !== undefined) throw new Error("Expected an unregistered tool to return undefined.");
  }
  console.log("PASS: looking up an unregistered tool returns undefined rather than throwing.");

  // 3. Duplicate registration is refused — this is what would catch a
  //    future accidental double-registration of the same tool name from
  //    two different capability modules.
  {
    let threw = false;
    try {
      registerToolExecutor("test.echo", async () => "second");
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected a duplicate registration to be refused.");
  }
  console.log("PASS: registering the same tool name twice is refused.");

  // 4. listRegisteredToolNames reflects what's registered, sorted.
  {
    __clearRegistryForTests();
    registerToolExecutor("z.tool", async () => null);
    registerToolExecutor("a.tool", async () => null);
    const names = listRegisteredToolNames();
    if (names.join(",") !== "a.tool,z.tool") {
      throw new Error(`Expected sorted tool names, got: ${names.join(",")}`);
    }
  }
  console.log("PASS: listRegisteredToolNames reflects the current registry, sorted.");

  console.log("\n=== TOOL-EXECUTOR-REGISTRY TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
