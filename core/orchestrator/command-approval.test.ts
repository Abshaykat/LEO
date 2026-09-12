import { runCommand } from "./command-runner.ts";
import { approveRequest } from "../approvals/approval-engine.ts";

async function main() {
  console.log("=== L.E.O. COMMAND + APPROVAL TEST ===");

  const input = 'run Write-Output "Hello from L.E.O."';

  console.log("\n[1] User command:");
  console.log(input);

  const first = await runCommand(input);

  console.dir(first, { depth: null });

  if (first.decision !== "require_approval" || !first.approvalId) {
    throw new Error("SECURITY FAILURE: Approval was not required.");
  }

  console.log("\n[2] Approving exact command...");

  const approval = await approveRequest(first.approvalId);

  console.log("Approval:", approval.status);

  console.log("\n[3] Executing approved command...");

  const execution = await runCommand(
    input,
    first.approvalId
  );

  console.dir(execution, { depth: null });

  if (execution.decision !== "allow") {
    throw new Error("SECURITY FAILURE: Approved command was not executed.");
  }

  console.log("\n=== COMMAND APPROVAL TEST PASSED ===");
}

main().catch((error) => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
