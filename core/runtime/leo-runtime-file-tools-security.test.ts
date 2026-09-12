import { execute } from "../execution/execution-engine.ts";
import { approveRequest } from "../approvals/approval-engine.ts";

const context = {
  source: "system" as const,
  ownerAuthenticated: true
};

const leoRoot =
  process.env.LEO_COMMAND_WORKING_DIRECTORY?.trim() ||
  "D:\\LEO";

async function expectExecutionFailure(
  name: string,
  request: any
): Promise<void> {
  const pending = await execute(request);

  if (
    pending.decision !== "require_approval" ||
    !pending.approvalId
  ) {
    throw new Error(
      `SECURITY FAILURE: ${name} did not enter approval gate.`
    );
  }

  await approveRequest(pending.approvalId);

  try {
    await execute({
      ...request,
      approvalId: pending.approvalId
    });

    throw new Error(
      `SECURITY FAILURE: ${name} was executed.`
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

async function main() {
  console.log(
    "=== L.E.O. AI FILE-TOOL SECURITY REGRESSION ==="
  );

  await expectExecutionFailure(
    "Read path traversal",
    {
      toolName: "pc.read_file",
      parameters: {
        path:
          `${leoRoot}\\..\\Windows\\System32\\drivers\\etc\\hosts`
      },
      reason: "Test AI read-file path boundary.",
      context
    }
  );

  await expectExecutionFailure(
    "Write workspace escape",
    {
      toolName: "pc.write_file",
      parameters: {
        path:
          `${leoRoot}\\..\\outside-ai-file-test.txt`,
        content:
          "SECURITY TEST"
      },
      reason: "Test AI write-file workspace boundary.",
      context
    }
  );

  await expectExecutionFailure(
    "Read empty path",
    {
      toolName: "pc.read_file",
      parameters: {
        path: "   "
      },
      reason: "Test AI read-file path validation.",
      context
    }
  );

  await expectExecutionFailure(
    "Write missing content",
    {
      toolName: "pc.write_file",
      parameters: {
        path:
          `${leoRoot}\\workspace\\security-test.txt`
      },
      reason: "Test AI write-file content validation.",
      context
    }
  );

  const unsupported = await execute({
    toolName: "pc.delete_file",
    parameters: {
      path:
        `${leoRoot}\\workspace\\security-test.txt`
    },
    reason: "Test unsupported AI file tool.",
    context
  });

  if (
    unsupported.decision !== "deny"
  ) {
    throw new Error(
      "SECURITY FAILURE: Unsupported AI tool was not denied."
    );
  }

  console.log(
    "PASS: Unsupported AI tool denied."
  );

  const validRead = {
    toolName: "pc.read_file",
    parameters: {
      path: `${leoRoot}\\README.md`
    },
    reason: "Verify valid approved AI read remains functional.",
    context
  };

  const pendingRead = await execute(validRead);

  if (
    pendingRead.decision !== "require_approval" ||
    !pendingRead.approvalId
  ) {
    throw new Error(
      "SECURITY FAILURE: Valid AI read did not require approval."
    );
  }

  await approveRequest(pendingRead.approvalId);

  const readResult = await execute({
    ...validRead,
    approvalId: pendingRead.approvalId
  });

  if (
    readResult.decision !== "allow"
  ) {
    throw new Error(
      "SECURITY FAILURE: Valid approved AI read failed."
    );
  }

  console.log(
    "PASS: Valid approved AI read executed."
  );

  console.log(
    "\n=== AI FILE-TOOL SECURITY REGRESSION PASSED ==="
  );
}

main().catch((error) => {
  console.error(
    "\n=== AI FILE-TOOL SECURITY REGRESSION FAILED ==="
  );

  console.error(error);
  process.exit(1);
});
