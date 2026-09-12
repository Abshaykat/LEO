import assert from "node:assert/strict";

import { LeoRuntime } from "../runtime/leo-runtime.ts";
import { approveRequest } from "../approvals/approval-engine.ts";
import { getAuditFilePath } from "./audit-logger.ts";

import {
  TEST_OWNER_AUTH_TOKEN,
  createTestOwnerAuthenticator
} from "../identity/owner-auth.test-support.ts";
import type {
  AIProvider,
  AIRequest,
  AIResponse
} from "../ai/ai-provider.ts";

class TraceTestProvider implements AIProvider {
  readonly name = "trace-test-provider";

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    return {
      content:
        'I prepared the requested command for execution.',
      model: "trace-test-model",
      provider: this.name,
      usage: {
        inputTokens: request.messages.length,
        outputTokens: 1
      }
    };
  }
}

function assertCondition(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `APPROVAL EXECUTION TRACE TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {
  console.log(
    "=== L.E.O. APPROVAL -> EXECUTION TRACE CORRELATION TEST ==="
  );


  /*
   * Replace the runtime brain with the existing test provider
   * through the normal constructor path.
   */
  const { LeoBrain } =
    await import("../orchestrator/leo-brain.ts");

  const brain = new LeoBrain(
    new TraceTestProvider()
  );

  const tracedRuntime = new LeoRuntime(
    brain,
    createTestOwnerAuthenticator()
  );

  const userMessage =
    'run Write-Output "Approval trace correlation test"';

  /*
   * 1. Initial request.
   */
  console.log("\n[1] Requesting action...");

  const first = await tracedRuntime.process({
    userMessage,
    source: "text",
    ownerAuthToken: TEST_OWNER_AUTH_TOKEN
  });

  console.dir(first, { depth: null });

  assertCondition(
    first.type === "approval_required",
    "Initial action did not require approval."
  );

  if (first.type !== "approval_required") {
    throw new Error(
      "Unexpected initial runtime result."
    );
  }

  assertCondition(
    first.approvalId.length > 0,
    "Approval ID missing."
  );

  assertCondition(
    "traceId" in first &&
    typeof first.traceId === "string" &&
    first.traceId.length > 0,
    "Initial approval response did not expose traceId."
  );

  const traceId = first.traceId;

  console.log(
    `Trace ID: ${traceId}`
  );

  /*
   * 2. Owner approval.
   */
  console.log("\n[2] Approving exact action...");

  const approval = await approveRequest(
    first.approvalId
  );

  assert.equal(
    approval.status,
    "approved"
  );

  console.log(
    "PASS: Owner approval recorded."
  );

  /*
   * 3. Execute exact approved action using SAME traceId.
   */
  console.log(
    "\n[3] Executing approved action with same trace..."
  );

  const second = await tracedRuntime.process({
    userMessage,
    source: "text",
    ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
    approvalId: first.approvalId,
    traceId
  });

  console.dir(second, { depth: null });

  assertCondition(
    second.type === "execution",
    "Approved action was not executed."
  );

  /*
   * 4. Read audit log and reconstruct lifecycle.
   */
  console.log(
    "\n[4] Verifying complete audit lifecycle..."
  );

  const content =
    await import("node:fs/promises")
      .then(fs =>
        fs.readFile(
          getAuditFilePath(),
          "utf8"
        )
      );

  const records =
    content
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(
        line =>
          JSON.parse(line) as Record<string, unknown>
      );

  const matching =
    records.filter(
      record =>
        record.traceId === traceId
    );

  console.log(
    `Trace-bearing records for ${traceId}: ${matching.length}`
  );

  assertCondition(
    matching.length > 0,
    "No audit records were found for the original traceId."
  );

  const stages =
    matching
      .filter(
        record =>
          record.type === "decision_trace"
      )
      .map(
        record => {
          const details =
            record.details as
              | Record<string, unknown>
              | undefined;

          return details?.stage;
        }
      )
      .filter(
        (stage): stage is string =>
          typeof stage === "string"
      );

  console.log(
    "Stages:",
    stages
  );

  assertCondition(
    stages.includes("request_received"),
    "request_received stage missing."
  );

  assertCondition(
    stages.includes("action_planned"),
    "action_planned stage missing."
  );

  assertCondition(
    stages.includes("action_validated"),
    "action_validated stage missing."
  );

  assertCondition(
    stages.includes("approval_requested"),
    "approval_requested stage missing."
  );

  assertCondition(
    stages.includes("approval_consumed"),
    "approval_consumed stage missing."
  );

  assertCondition(
    stages.includes("execution_finished"),
    "execution_finished stage missing."
  );

  /*
   * Approval ID must remain correlated to the same trace.
   */
  const approvalRecords =
    matching.filter(
      record =>
        record.approvalId === first.approvalId
    );

  assertCondition(
    approvalRecords.length > 0,
    "Approval records are not correlated to the same trace."
  );

  /*
   * The trace must contain both approval and execution.
   */
  const hasExecution =
    matching.some(
      record =>
        record.type === "execution_finished" ||
        record.type === "execution_started"
    );

  assertCondition(
    hasExecution,
    "Execution lifecycle was not found under the approval trace."
  );

  console.log(
    "PASS: Approval and execution share one trace."
  );

  console.log(
    "\n=== APPROVAL -> EXECUTION TRACE CORRELATION TEST PASSED ==="
  );
}

main().catch(error => {
  console.error(
    "\n=== APPROVAL -> EXECUTION TRACE CORRELATION TEST FAILED ==="
  );

  console.error(error);
  process.exit(1);
});
