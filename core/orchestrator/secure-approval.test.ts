import {
  authorizeTool
} from "./tool-gate.ts";

import {
  approveRequest,
  consumeApproval
} from "../approvals/approval-engine.ts";

async function main() {

  console.log("=== L.E.O. SECURE APPROVAL TEST ===");

  const originalParameters = {
    command: "npm test",
    workingDirectory: "D:\\LEO"
  };

  console.log("\n[1] Requesting original action...");

  const request = await authorizeTool({
    toolName: "pc.run_command",
    parameters: originalParameters,
    reason: "Run the L.E.O. test suite."
  });

  console.log(request);

  if (!request.approvalId) {
    throw new Error("Expected approval ID.");
  }

  console.log("\n[2] Owner approves original action...");

  const approval = await approveRequest(
    request.approvalId
  );

  console.log(approval);

  console.log("\n[3] Attempting parameter tampering...");

  const modifiedParameters = {
    command: "DELETE EVERYTHING",
    workingDirectory: "D:\\LEO"
  };

  try {

    await consumeApproval(
      request.approvalId,
      "pc.run_command",
      modifiedParameters
    );

    console.log(
      "? SECURITY FAILURE: Modified action was accepted!"
    );

    process.exit(1);

  } catch (error) {

    console.log(
      "? Tampered action rejected:"
    );

    console.log(
      error instanceof Error
        ? error.message
        : String(error)
    );
  }

  console.log("\n[4] Executing the ORIGINAL approved action...");

  const consumed = await consumeApproval(
    request.approvalId,
    "pc.run_command",
    originalParameters
  );

  console.log(consumed);

  console.log(
    "\n? ORIGINAL ACTION ACCEPTED"
  );

  console.log(
    "\n=== SECURITY TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n? L.E.O. SECURITY TEST FAILED:"
  );

  console.error(error);

  process.exit(1);
});


