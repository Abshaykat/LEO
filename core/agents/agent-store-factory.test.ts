import {
  AgentFactory
} from "./agent-factory.ts";

import {
  createAgent,
  listAgents,
  deleteAgent
} from "./agent-store.ts";

const factory = new AgentFactory();

function assert(
  condition: unknown,
  message: string
): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log(
    "\n=== L.E.O. AGENT FACTORY + STORE TEST ==="
  );

  const draft = factory.createDraft({
    name: "Research Agent",
    purpose: "Perform controlled research.",
    instructions:
      "Use only approved research capabilities.",
    capabilities: [
      "web.search",
      "web.read"
    ],
    permissions: [
      "internet_access"
    ]
  });

  assert(
    draft.status === "draft",
    "Factory draft must start as draft."
  );

  const created = await createAgent({
    name: draft.name,
    purpose: draft.purpose,
    instructions: draft.instructions,
    capabilities: draft.capabilities,
    permissions: draft.permissions,
    memoryPolicy: draft.memoryPolicy,
    securityPolicy: draft.securityPolicy
  });

  assert(
    created.status === "draft",
    "Persisted agent must remain draft."
  );

  assert(
    created.version === 1,
    "Persisted agent must have version 1."
  );

  assert(
    created.capabilities.includes("web.search"),
    "Persisted capabilities were not retained."
  );

  assert(
    created.permissions.includes("internet_access"),
    "Persisted permissions were not retained."
  );

  assert(
    created.securityPolicy.allowAutonomousExecution === false,
    "Autonomous execution must remain disabled."
  );

  assert(
    created.securityPolicy.allowPermissionChanges === false,
    "Permission changes must remain disabled."
  );

  const agents = await listAgents();

  assert(
    agents.some(agent => agent.id === created.id),
    "Created agent was not persisted."
  );

  await deleteAgent(created.id);

  const afterDelete = await listAgents();

  assert(
    !afterDelete.some(agent => agent.id === created.id),
    "Created agent was not removed by cleanup."
  );

  console.log(
    "PASS: Factory output persists through agent store."
  );
  console.log(
    "PASS: Draft lifecycle state is preserved."
  );
  console.log(
    "PASS: Capabilities and permissions persist."
  );
  console.log(
    "PASS: Security authority remains disabled."
  );
  console.log(
    "PASS: Agent cleanup succeeds."
  );

  console.log(
    "=== FACTORY + STORE TEST PASSED ==="
  );
}

main().catch((error: unknown) => {
  console.error(
    "\n=== TEST FAILED ==="
  );
  console.error(error);
  process.exitCode = 1;
});
