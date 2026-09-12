import {
  LeoRuntime
} from "./leo-runtime.ts";

import {
  approveRequest
} from "../approvals/approval-engine.ts";

import {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

import {
  TEST_OWNER_AUTH_TOKEN,
  createTestOwnerAuthenticator
} from "../identity/owner-auth.test-support.ts";
import type {
  AIProvider,
  AIRequest,
  AIResponse
} from "../ai/ai-provider.ts";

class TestProvider implements AIProvider {

  readonly name = "test-provider";

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {

    return {
      content:
        "I prepared the requested command for execution.",
      model: "test-model",
      provider: this.name,
      usage: {
        inputTokens: request.messages.length,
        outputTokens: 1
      }
    };
  }
}

async function testExecutor(
  tool: { name: string },
  parameters: unknown
): Promise<unknown> {

  if (tool.name !== "pc.run_command") {
    throw new Error(
      `Unexpected tool: ${tool.name}`
    );
  }

  return {
    executed: true,
    parameters
  };
}

function assert(
  condition: boolean,
  message: string
): void {

  if (!condition) {
    throw new Error(
      `TEST FAILURE: ${message}`
    );
  }
}

async function main() {

  console.log(
    "=== L.E.O. END-TO-END RUNTIME TEST ==="
  );

  const brain =
    new LeoBrain(
      new TestProvider()
    );

  const runtime =
    new LeoRuntime(
      brain,
      createTestOwnerAuthenticator()
    );

  console.log(
    "\n[1] Sending owner command..."
  );

  const first =
    await runtime.process({
      userMessage:
        'run Write-Output "Hello from L.E.O."',
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN
    });

  console.log(first);

  assert(
    first.type === "approval_required",
    "Executable command did not require approval."
  );

  if (first.type !== "approval_required") {
    throw new Error(
      "TEST FAILURE: Runtime returned an unexpected result type."
    );
  }

  assert(
    first.approvalId.length > 0,
    "Approval ID was not returned."
  );

  console.log(
    "PASS: Runtime routed command to approval."
  );

  console.log(
    "\n[2] Owner approves the exact action..."
  );

  const approval =
    await approveRequest(
      first.approvalId
    );

  assert(
    approval.status === "approved",
    "Approval was not persisted as approved."
  );

  console.log(
    "PASS: Owner approval recorded."
  );

  console.log(
    "\n[3] Resubmitting the exact approved action..."
  );

  const second =
    await runtime.process({
      userMessage:
        'run Write-Output "Hello from L.E.O."',
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
      approvalId: first.approvalId
    });

  console.log(second);

  assert(
    second.type === "execution",
    "Approved action was not executed."
  );

  if (second.type !== "execution") {
    throw new Error(
      "TEST FAILURE: Runtime returned an unexpected result after approval."
    );
  }

  assert(
    second.toolName === "pc.run_command",
    "Wrong tool was executed."
  );

  const executionResult =
    second.result as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };

  assert(
    executionResult.exitCode === 0,
    "Real execution engine did not report successful execution."
  );

  assert(
    executionResult.stdout?.includes("Hello from L.E.O.") === true,
    "Real execution engine returned unexpected stdout."
  );

  assert(
    executionResult.stderr === "",
    "Real execution engine reported stderr output."
  );
  console.log(
    "PASS: Approved action reached the executor."
  );

  console.log(
    "\n=== END-TO-END RUNTIME APPROVAL ROUND-TRIP PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== END-TO-END RUNTIME TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
