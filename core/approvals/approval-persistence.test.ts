import {
  createApprovalRequest,
  approveRequest,
  consumeApproval,
  getApprovalRequest
} from "./approval-engine.ts";

import {
  getStoredApproval,
  getApprovalStorePath
} from "./approval-store.ts";

import {
  getTool
} from "../permissions/tool-registry.ts";

async function main() {

  console.log(
    "=== L.E.O. APPROVAL PERSISTENCE TEST ==="
  );

  const tool = getTool("pc.run_command");

  if (!tool) {
    throw new Error(
      "pc.run_command is not registered."
    );
  }

  const parameters = {
    command: "Write-Output 'persistence-test'",
    workingDirectory: "D:\\LEO"
  };

  /*
   * 1. Create approval.
   */

  const created =
    await createApprovalRequest(
      tool,
      parameters,
      "Approval persistence regression test."
    );

  console.log(
    "[1] Created:",
    created.id
  );

  /*
   * 2. Verify it exists in persistent storage.
   */

  const storedCreated =
    await getStoredApproval(created.id);

  if (!storedCreated) {
    throw new Error(
      "SECURITY FAILURE: Created approval was not persisted."
    );
  }

  if (storedCreated.status !== "pending") {
    throw new Error(
      "SECURITY FAILURE: Persisted approval is not pending."
    );
  }

  console.log(
    "PASS: Pending approval persisted."
  );

  /*
   * 3. Approve.
   */

  const approved =
    await approveRequest(created.id);

  if (approved.status !== "approved") {
    throw new Error(
      "SECURITY FAILURE: Approval was not approved."
    );
  }

  /*
   * 4. Verify approved state persisted.
   */

  const storedApproved =
    await getStoredApproval(created.id);

  if (
    !storedApproved ||
    storedApproved.status !== "approved"
  ) {
    throw new Error(
      "SECURITY FAILURE: Approved state was not persisted."
    );
  }

  console.log(
    "PASS: Approved state persisted."
  );

  /*
   * 5. Simulate a fresh engine lookup.
   *
   * getApprovalRequest() reads from persistent storage.
   */

  const reloaded =
    await getApprovalRequest(created.id);

  if (
    !reloaded ||
    reloaded.status !== "approved"
  ) {
    throw new Error(
      "SECURITY FAILURE: Approved state could not be reloaded."
    );
  }

  console.log(
    "PASS: Approved approval reloaded from storage."
  );

  /*
   * 6. Consume exact approved action.
   */

  const consumed =
    await consumeApproval(
      created.id,
      "pc.run_command",
      parameters
    );

  if (consumed.status !== "consumed") {
    throw new Error(
      "SECURITY FAILURE: Approval was not consumed."
    );
  }

  /*
   * 7. Verify consumed state persisted.
   */

  const storedConsumed =
    await getStoredApproval(created.id);

  if (
    !storedConsumed ||
    storedConsumed.status !== "consumed"
  ) {
    throw new Error(
      "SECURITY FAILURE: Consumed state was not persisted."
    );
  }

  console.log(
    "PASS: Consumed state persisted."
  );

  /*
   * 8. Verify the consumed approval cannot be reused.
   */

  try {

    await consumeApproval(
      created.id,
      "pc.run_command",
      parameters
    );

    throw new Error(
      "SECURITY FAILURE: Consumed approval was reused."
    );

  } catch (error) {

    if (
      error instanceof Error &&
      error.message.startsWith(
        "SECURITY FAILURE:"
      )
    ) {
      throw error;
    }

    console.log(
      "PASS: Persisted consumed approval cannot be reused."
    );
  }

  /*
   * 9. Display the persistent store path.
   */

  const storePath =
    await getApprovalStorePath();

  console.log(
    "\nApproval store:",
    storePath
  );

  console.log(
    "\n=== APPROVAL PERSISTENCE TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== APPROVAL PERSISTENCE TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
