import path from "node:path";
import { execute } from "./execution-engine.ts";
import { approveRequest } from "../approvals/approval-engine.ts";
import { LEO_ROOT } from "../config/leo-config.ts";

const context = {
  source: "system" as const,
  ownerAuthenticated: true
};

async function approveAndExecute(request: any) {
  const pending = await execute(request);

  if (pending.decision !== "require_approval" || !pending.approvalId) {
    throw new Error("SECURITY FAILURE: Approval was not required.");
  }

  await approveRequest(pending.approvalId);

  return execute({
    ...request,
    approvalId: pending.approvalId
  });
}

async function main() {
  console.log("=== L.E.O. OWNER-APPROVAL EXECUTION TEST ===");

  const readRequest = {
    toolName: "pc.read_file",
    parameters: {
      path: path.join(LEO_ROOT, "README.md")
    },
    reason: "Read the L.E.O. README.",
    context
  };

  console.log("\n[1] Read without approval...");

  const blocked = await execute(readRequest);

  console.dir(blocked, { depth: null });

  if (blocked.decision !== "require_approval") {
    throw new Error(
      "SECURITY FAILURE: Read executed without owner approval."
    );
  }

  console.log("Read correctly blocked.");

  console.log("\n[2] Approving read...");

  const readResult = await approveAndExecute(readRequest);

  console.dir(readResult, { depth: null });

  if (readResult.decision !== "allow") {
    throw new Error(
      "SECURITY FAILURE: Approved read was not executed."
    );
  }

  console.log("\n[3] Approving workspace write...");

  const writeResult = await approveAndExecute({
    toolName: "pc.write_file",
    parameters: {
      path: path.join(LEO_ROOT, "workspace", "execution-test.txt"),
      content: "L.E.O. owner approval test.\n"
    },
    reason: "Write an authorized workspace test file.",
    context
  });

  console.dir(writeResult, { depth: null });

  if (writeResult.decision !== "allow") {
    throw new Error(
      "SECURITY FAILURE: Approved write was not executed."
    );
  }

  console.log("\n=== OWNER-APPROVAL SECURITY TEST PASSED ===");
}

main().catch((error) => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
