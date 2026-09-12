import { execute } from "./execution-engine.ts";
import { approveRequest } from "../approvals/approval-engine.ts";

const context = {
  source: "system" as const,
  ownerAuthenticated: true
};

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
    "=== L.E.O. EXECUTION BOUNDARY SECURITY TEST ==="
  );

  /*
   * 1. Path traversal must be rejected.
   */

  await expectExecutionFailure(
    "Path traversal outside L.E.O. root",
    {
      toolName: "pc.read_file",
      parameters: {
        path: "D:\\LEO\\..\\Windows\\System32\\drivers\\etc\\hosts"
      },
      reason: "Test path boundary.",
      context
    }
  );

  /*
   * 2. Workspace write outside workspace must be rejected.
   */

  await expectExecutionFailure(
    "Workspace escape",
    {
      toolName: "pc.write_file",
      parameters: {
        path: "D:\\LEO\\..\\outside-test.txt",
        content: "SECURITY TEST"
      },
      reason: "Test workspace boundary.",
      context
    }
  );

  /*
   * 3. Command chaining must be rejected.
   */

  await expectExecutionFailure(
    "Command chaining",
    {
      toolName: "pc.run_command",
      parameters: {
        command: "Write-Output test; Write-Output second"
      },
      reason: "Test command chaining policy.",
      context
    }
  );

  /*
   * 4. PowerShell encoded commands must be rejected.
   */

  await expectExecutionFailure(
    "Encoded PowerShell command",
    {
      toolName: "pc.run_command",
      parameters: {
        command: "powershell.exe -EncodedCommand TEST"
      },
      reason: "Test encoded command policy.",
      context
    }
  );

  /*
   * 5. Process spawning must be rejected.
   */

  await expectExecutionFailure(
    "Process spawning",
    {
      toolName: "pc.run_command",
      parameters: {
        command: "Start-Process notepad.exe"
      },
      reason: "Test process spawning policy.",
      context
    }
  );

  /*
   * 6. Download primitives must be rejected.
   */

  await expectExecutionFailure(
    "Network download primitive",
    {
      toolName: "pc.run_command",
      parameters: {
        command: "Invoke-WebRequest example.com"
      },
      reason: "Test download policy.",
      context
    }
  );

  /*
   * 7. System shutdown/restart must be rejected.
   */

  await expectExecutionFailure(
    "System shutdown command",
    {
      toolName: "pc.run_command",
      parameters: {
        command: "shutdown /s /t 0"
      },
      reason: "Test system shutdown policy.",
      context
    }
  );

  /*
   * 8. Empty command must be rejected.
   */

  await expectExecutionFailure(
    "Empty command",
    {
      toolName: "pc.run_command",
      parameters: {
        command: "   "
      },
      reason: "Test empty command validation.",
      context
    }
  );

  /*
   * 9. Unknown tool must be denied before execution.
   */

  const unknown = await execute({
    toolName: "totally.unknown.tool",
    parameters: {},
    reason: "Test unknown tool.",
    context
  });

  if (unknown.decision !== "deny") {
    throw new Error(
      "SECURITY FAILURE: Unknown tool was not denied."
    );
  }

  console.log(
    "PASS: Unknown tool denied."
  );

  /*
   * 10. Safe command must still work.
   */

  const safeRequest = {
    toolName: "pc.run_command",
    parameters: {
      command: 'Write-Output "Boundary test passed."'
    },
    reason: "Verify safe command execution remains functional.",
    context
  };

  const safePending = await execute(safeRequest);

  if (
    safePending.decision !== "require_approval" ||
    !safePending.approvalId
  ) {
    throw new Error(
      "SECURITY FAILURE: Safe command did not require approval."
    );
  }

  await approveRequest(safePending.approvalId);

  const safeResult = await execute({
    ...safeRequest,
    approvalId: safePending.approvalId
  });

  if (safeResult.decision !== "allow") {
    throw new Error(
      "SECURITY FAILURE: Safe approved command failed."
    );
  }

  console.log(
    "PASS: Safe approved command executed."
  );

  console.log(
    "\n=== EXECUTION BOUNDARY SECURITY TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== EXECUTION BOUNDARY SECURITY TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
