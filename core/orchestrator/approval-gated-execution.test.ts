import { execute } from "../execution/execution-engine.ts";
import { approveRequest } from "../approvals/approval-engine.ts";

const context = {
  source: "system" as const,
  ownerAuthenticated: true
};

async function main() {
  console.log("=== L.E.O. REAL COMMAND EXECUTION TEST ===");

  const parameters = {
    command: 'Write-Output "Hello from real L.E.O."'
  };

  console.log("\n[1] Requesting command without approval...");

  const first = await execute({
    toolName: "pc.run_command",
    parameters,
    reason: "Test real PowerShell execution.",
    context
  });

  console.dir(first, { depth: null });

  if (first.decision !== "require_approval") {
    throw new Error("SECURITY FAILURE: Command did not require approval.");
  }

  console.log("\n[2] Owner approves the command...");

  const approved = await approveRequest(first.approvalId);

  console.dir(approved, { depth: null });

  console.log("\n[3] Executing approved command...");

  const second = await execute({
    toolName: "pc.run_command",
    parameters,
    reason: "Test real PowerShell execution.",
    context,
    approvalId: first.approvalId
  });

  console.dir(second, { depth: null });

  if (second.decision !== "allow") {
    throw new Error("SECURITY FAILURE: Approved command was not executed.");
  }

  console.log("\n=== REAL COMMAND EXECUTION PASSED ===");
}

main().catch((error) => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
