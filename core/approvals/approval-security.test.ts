import {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  consumeApproval
} from "../approvals/approval-engine.ts";

import {
  getTool
} from "../permissions/tool-registry.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(`SECURITY FAILURE: ${message}`);
  }
}

async function expectFailure(
  name: string,
  action: () => unknown | Promise<unknown>
): Promise<void> {

  try {
    await action();

    throw new Error(
      `SECURITY FAILURE: ${name} was accepted.`
    );

  } catch (error) {

    if (
      error instanceof Error &&
      error.message.startsWith("SECURITY FAILURE:")
    ) {
      throw error;
    }

    console.log(`PASS: ${name}`);
  }
}

async function createPendingApproval() {

  const tool = getTool("pc.run_command");

  if (!tool) {
    throw new Error(
      "SECURITY FAILURE: pc.run_command is not registered."
    );
  }

  return createApprovalRequest(
    tool,
    {
      command: "Write-Output 'security-test'"
    },
    "L.E.O. security regression test."
  );
}

async function main() {

  console.log(
    "=== L.E.O. APPROVAL SECURITY REGRESSION TEST ==="
  );

  /*
   * 1. Rejected approval cannot execute.
   */

  const rejected = await createPendingApproval();

  await rejectRequest(rejected.id);

  await expectFailure(
    "Rejected approval",
    async () =>
      await consumeApproval(
        rejected.id,
        "pc.run_command",
        rejected.parameters
      )
  );

  /*
   * 2. Wrong approval ID cannot execute.
   */

  const valid = await createPendingApproval();

  await approveRequest(valid.id);

  await expectFailure(
    "Wrong approval ID",
    async () =>
      await consumeApproval(
        "00000000-0000-0000-0000-000000000000",
        "pc.run_command",
        valid.parameters
      )
  );

  /*
   * 3. Wrong tool cannot use approval.
   */

  await expectFailure(
    "Wrong tool",
    async () =>
      await consumeApproval(
        valid.id,
        "pc.read_file",
        valid.parameters
      )
  );

  /*
   * 4. Modified parameters cannot use approval.
   */

  await expectFailure(
    "Modified parameters",
    async () =>
      await consumeApproval(
        valid.id,
        "pc.run_command",
        {
          command: "DELETE EVERYTHING"
        }
      )
  );

  /*
   * 5. Exact action is accepted once.
   */

  const consumed = await consumeApproval(
    valid.id,
    "pc.run_command",
    valid.parameters
  );

  assert(
    consumed.status === "consumed",
    "Approved action was not consumed."
  );

  console.log(
    "PASS: Exact approved action accepted once."
  );

  /*
   * 6. Consumed approval cannot be reused.
   */

  await expectFailure(
    "Consumed approval reuse",
    async () =>
      await consumeApproval(
        valid.id,
        "pc.run_command",
        valid.parameters
      )
  );

  /*
   * 7. Unknown tool must not exist.
   */

  assert(
    getTool("unknown.tool") === undefined,
    "Unknown tool was unexpectedly registered."
  );

  console.log(
    "PASS: Unknown tool rejected by registry."
  );

  console.log(
    "\n=== APPROVAL SECURITY REGRESSION TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== APPROVAL SECURITY REGRESSION TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});



