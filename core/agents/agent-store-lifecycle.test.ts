import assert from "node:assert/strict";
import {
  createAgent,
  getAgent,
  deleteAgent,
  transitionAgentLifecycle
} from "./agent-store.ts";

async function main(): Promise<void> {
  console.log("\n=== L.E.O. AGENT STORE LIFECYCLE TEST ===");

  const created = await createAgent({
    name: "Lifecycle Store Test",
    purpose: "Controlled lifecycle transition testing.",
    instructions: "No autonomous authority.",
    capabilities: ["web.search"],
    permissions: [],
    memoryPolicy: {
      mode: "restricted",
      allowedScopes: []
    },
    securityPolicy: {
      allowExternalSystemActions: false,
      allowPermissionChanges: false,
      allowAgentCreation: false,
      allowAutonomousExecution: false
    }
  });

  try {
    assert.equal(created.status, "draft");
    assert.equal(created.version, 1);

    const active = await transitionAgentLifecycle(
      created.id,
      "active"
    );

    assert.equal(active.status, "active");
    assert.equal(active.version, 2);

    assert.deepEqual(
      active.capabilities,
      created.capabilities
    );

    assert.deepEqual(
      active.permissions,
      created.permissions
    );

    assert.deepEqual(
      active.securityPolicy,
      created.securityPolicy
    );

    const persisted = await getAgent(created.id);

    assert.ok(persisted);
    assert.equal(persisted.status, "active");
    assert.equal(persisted.version, 2);

    await assert.rejects(
      () => transitionAgentLifecycle(created.id, "draft"),
      /Invalid agent lifecycle transition/
    );

    const disabled = await transitionAgentLifecycle(
      created.id,
      "disabled"
    );

    assert.equal(disabled.status, "disabled");
    assert.equal(disabled.version, 3);

    const reactivated = await transitionAgentLifecycle(
      created.id,
      "active"
    );

    assert.equal(reactivated.status, "active");
    assert.equal(reactivated.version, 4);

    const archived = await transitionAgentLifecycle(
      created.id,
      "archived"
    );

    assert.equal(archived.status, "archived");
    assert.equal(archived.version, 5);

    await assert.rejects(
      () => transitionAgentLifecycle(created.id, "active"),
      /Invalid agent lifecycle transition/
    );

    await assert.rejects(
      () => transitionAgentLifecycle("missing-agent", "active"),
      /Agent not found/
    );

    console.log("PASS: draft -> active.");
    console.log("PASS: Lifecycle version increments.");
    console.log("PASS: Capabilities preserved.");
    console.log("PASS: Permissions preserved.");
    console.log("PASS: Security policy preserved.");
    console.log("PASS: Invalid transition rejected.");
    console.log("PASS: active -> disabled.");
    console.log("PASS: disabled -> active.");
    console.log("PASS: active -> archived.");
    console.log("PASS: archived -> active rejected.");
    console.log("PASS: Missing agent rejected.");
    console.log("=== AGENT STORE LIFECYCLE TEST PASSED ===");
  } finally {
    await deleteAgent(created.id);
  }
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});