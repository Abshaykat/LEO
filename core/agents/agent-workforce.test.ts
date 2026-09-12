import { AgentWorkforce } from "./agent-workforce.ts";

const workforce = new AgentWorkforce();
const agent = workforce.createRole("research", "Research only; never execute consequential actions.");
if (agent.definition.status !== "draft") throw new Error("Workforce agent must start as draft.");
if (agent.definition.securityPolicy.allowAutonomousExecution) throw new Error("Autonomous execution must remain disabled.");
if (workforce.canDelegateSensitiveAuthority()) throw new Error("Sensitive authority must never be delegated.");

// A role's recommended permissions are advisory only — creating a draft
// must never auto-grant them.
if ((agent.definition.permissions ?? []).length !== 0) {
  throw new Error("createRole must never auto-grant permissions, even advisory ones.");
}
const codingRecommendation = workforce.recommendedPermissions("coding");
if (!codingRecommendation.includes("software_engineering")) {
  throw new Error("Expected the coding role to recommend the software_engineering permission.");
}
console.log("PASS: recommendedPermissions is advisory and never auto-granted at draft creation.");

console.log("PASS: Controlled AI Workforce governance.");

// Every non-integration role must produce a draft that passes real
// capability validation against the default registry — this would have
// thrown "Unknown capability" before the Layer 2 capability domains
// (system.software_management, system.software_engineering,
// system.safe_update, system.diagnostics, knowledge.continuous_update)
// were registered.
for (const role of ["research", "browser", "coding", "system", "office", "data"] as const) {
  const draft = workforce.createRole(role, `Test instructions for the ${role} role.`);
  if (draft.definition.status !== "draft") {
    throw new Error(`Expected the ${role} role to produce a valid draft.`);
  }
}
console.log("PASS: coding/system/data roles (and all non-integration roles) validate cleanly with their declared Layer 2 capabilities.");

// The system role specifically should now cover all three new Layer 2
// tool-domain capabilities it was given.
{
  const capabilities = workforce.listRoleCapabilities("system");
  for (const expected of ["system.software_management", "system.safe_update", "system.diagnostics"]) {
    if (!capabilities.includes(expected)) {
      throw new Error(`Expected the system role to declare capability "${expected}".`);
    }
  }
}
console.log("PASS: the system role declares all three of its Layer 2 capability domains.");
