import {
  AgentFactory
} from "./agent-factory.ts";

const factory = new AgentFactory();

function assert(
  condition: unknown,
  message: string
): void {
  if (!condition) {
    throw new Error(message);
  }
}

console.log("\n=== L.E.O. AGENT FACTORY TEST ===");

const draft = factory.createDraft({
  name: "Research Agent",
  purpose: "Perform controlled research.",
  instructions: "Use only approved research capabilities.",
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
  "New agent must start as draft."
);

assert(
  draft.version === 1,
  "New agent must start at version 1."
);

assert(
  draft.securityPolicy.allowAutonomousExecution === false,
  "Autonomous execution must be disabled."
);

assert(
  draft.securityPolicy.allowPermissionChanges === false,
  "Permission changes must be disabled."
);

assert(
  draft.securityPolicy.allowAgentCreation === false,
  "Agent creation authority must be disabled."
);

assert(
  draft.securityPolicy.allowExternalSystemActions === false,
  "External system authority must be disabled."
);

const invalidCapability = factory.validate({
  name: "Invalid Agent",
  purpose: "Test",
  instructions: "Test",
  capabilities: [
    "capability.does.not.exist"
  ]
});

assert(
  !invalidCapability.valid,
  "Unknown capability must be rejected."
);

const unavailableCapability = factory.validate({
  name: "Unavailable Agent",
  purpose: "Test",
  instructions: "Test",
  capabilities: [
    "browser.interact"
  ]
});

assert(
  !unavailableCapability.valid,
  "Unavailable capability must be rejected."
);

const escalationAttempt = factory.validate({
  name: "Escalation Agent",
  purpose: "Test",
  instructions: "Test",
  securityPolicy: {
    allowAutonomousExecution: true
  }
});

assert(
  !escalationAttempt.valid,
  "Autonomous execution escalation must be rejected."
);

console.log("PASS: Agent starts in draft state.");
console.log("PASS: Available capabilities are accepted.");
console.log("PASS: Unknown capabilities are rejected.");
console.log("PASS: Unavailable capabilities are rejected.");
console.log("PASS: Autonomous execution escalation is rejected.");
console.log("PASS: Agent/permission/external authority delegation is disabled.");
console.log("=== AGENT FACTORY TEST PASSED ===");
