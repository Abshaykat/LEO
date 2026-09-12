import { evaluateAction } from "./permission-engine.ts";

function assertDecision(
  name: string,
  actual: string,
  expected: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${name}: expected ${expected}, received ${actual}`
    );
  }

  console.log(`PASS: ${name} -> ${actual}`);
}

console.log("=== L.E.O. PERMISSION ENGINE TEST ===");

assertDecision(
  "Normal task",
  evaluateAction({
    action: "create_project",
    risk: "low"
  }).decision,
  "allow"
);

assertDecision(
  "Create AI agent",
  evaluateAction({
    action: "create_agent",
    risk: "critical",
    createsAgent: true
  }).decision,
  "require_approval"
);

assertDecision(
  "Change permissions",
  evaluateAction({
    action: "grant_admin_access",
    risk: "critical",
    changesPermissions: true
  }).decision,
  "require_approval"
);

assertDecision(
  "Unauthorized third-party action",
  evaluateAction({
    action: "access_unauthorized_system",
    risk: "critical",
    affectsThirdParty: true
  }).decision,
  "deny"
);

assertDecision(
  "Destructive action",
  evaluateAction({
    action: "delete_data",
    risk: "critical",
    destructive: true
  }).decision,
  "require_approval"
);

assertDecision(
  "Explicit approval-required action",
  evaluateAction({
    action: "read_file",
    risk: "low",
    requiresOwnerApproval: true
  }).decision,
  "require_approval"
);

console.log("\n=== PERMISSION ENGINE TEST PASSED ===");
