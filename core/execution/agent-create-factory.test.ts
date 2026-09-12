import {
  createApprovalRequest,
  approveRequest
} from "../approvals/approval-engine.ts";

import {
  execute
} from "./execution-engine.ts";

import {
  getTool
} from "../permissions/tool-registry.ts";

import {
  listAgents,
  deleteAgent
} from "../agents/agent-store.ts";

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
    "\n=== L.E.O. APPROVED AGENT.CREATE FACTORY TEST ==="
  );

  const tool = getTool("agent.create");

  assert(
    tool != null,
    "agent.create tool is not registered."
  );

  const parameters = {
    name: "Phase 2.3A Research Agent",
    purpose: "Controlled research testing.",
    instructions:
      "Use only approved research capabilities.",
    capabilities: [
      "web.search",
      "web.read"
    ],
    permissions: [
      "internet_access"
    ]
  };

  const approval = await createApprovalRequest(
    tool!,
    parameters,
    "Phase 2.3A Agent Factory integration test.",
    "phase-2.3a3-test"
  );

  await approveRequest(
    approval.id,
    "phase-2.3a3-test"
  );

  const result = await execute({
    toolName: "agent.create",
    parameters,
    reason:
      "Phase 2.3A Agent Factory integration test.",
    context: {
      source: "system",
      ownerAuthenticated: true
    },
    approvalId: approval.id,
    traceId: "phase-2.3a3-test"
  });

  assert(
    result.decision === "allow",
    "Approved agent.create did not execute."
  );

  if (result.decision !== "allow") {
    throw new Error(
      `agent.create was not allowed: ${result.reason}`
    );
  }

  const created = result.result as {
    id: string;
    status: string;
    capabilities: string[];
    permissions: string[];
    securityPolicy: {
      allowExternalSystemActions: boolean;
      allowPermissionChanges: boolean;
      allowAgentCreation: boolean;
      allowAutonomousExecution: boolean;
    };
  };

  assert(
    created.status === "draft",
    "Created agent must remain draft."
  );

  assert(
    created.capabilities.includes("web.search"),
    "Capability web.search was not persisted."
  );

  assert(
    created.capabilities.includes("web.read"),
    "Capability web.read was not persisted."
  );

  assert(
    created.permissions.includes("internet_access"),
    "Permission was not persisted."
  );

  assert(
    created.securityPolicy.allowExternalSystemActions === false,
    "External authority must remain disabled."
  );

  assert(
    created.securityPolicy.allowPermissionChanges === false,
    "Permission delegation must remain disabled."
  );

  assert(
    created.securityPolicy.allowAgentCreation === false,
    "Agent creation delegation must remain disabled."
  );

  assert(
    created.securityPolicy.allowAutonomousExecution === false,
    "Autonomous execution must remain disabled."
  );

  const persisted = await listAgents();

  assert(
    persisted.some(agent => agent.id === created.id),
    "Created agent was not persisted."
  );

  await deleteAgent(created.id);

  console.log(
    "PASS: Existing approval path accepted agent.create."
  );

  console.log(
    "PASS: Production path persisted Factory fields."
  );

  console.log(
    "PASS: Agent remained draft."
  );

  console.log(
    "PASS: Security authority remained disabled."
  );

  console.log(
    "PASS: Agent cleanup succeeded."
  );

  console.log(
    "=== APPROVED AGENT.CREATE FACTORY TEST PASSED ==="
  );
}

main().catch((error: unknown) => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exitCode = 1;
});

