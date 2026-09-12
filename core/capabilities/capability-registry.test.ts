import { createDefaultCapabilityRegistry } from "./capability-registry.ts";

function main() {
  console.log("=== L.E.O. CAPABILITY-REGISTRY TEST ===");

  const registry = createDefaultCapabilityRegistry();

  const expectedLayer2Capabilities = [
    "system.software_management",
    "system.software_engineering",
    "system.safe_update",
    "system.diagnostics",
    "knowledge.continuous_update"
  ];

  for (const id of expectedLayer2Capabilities) {
    const capability = registry.get(id);
    if (!capability) throw new Error(`Expected capability "${id}" to be registered.`);
    if (capability.status !== "available") {
      throw new Error(`Expected capability "${id}" to be available, got status: ${capability.status}`);
    }
    if (!registry.hasAvailable(id)) throw new Error(`Expected hasAvailable("${id}") to be true.`);
  }
  console.log("PASS: all Layer 2 tool domains have a matching, available capability registry entry.");

  // Pre-existing capabilities must still be intact after the addition.
  if (!registry.hasAvailable("local.command.execute")) {
    throw new Error("Regression: a pre-existing capability was lost.");
  }
  if (registry.hasAvailable("spreadsheet.create")) {
    throw new Error("Regression: an intentionally unavailable capability now reports available.");
  }
  console.log("PASS: pre-existing capability entries and their availability status are unchanged.");

  console.log("\n=== CAPABILITY-REGISTRY TEST PASSED ===");
}

main();
