import {
  workflowPlanToDefinition
} from "./workflow-plan-adapter.ts";

import type {
  ExecutionContext
} from "../execution/execution-gate.ts";

import type {
  WorkflowPlan
} from "../actions/action-plan.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `WORKFLOW PLAN ADAPTER TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {
  console.log(
    "=== L.E.O. WORKFLOW PLAN ADAPTER TEST ==="
  );

  const executionContext: ExecutionContext = {
    source: "text",
    ownerAuthenticated: true
  };

  const plan: WorkflowPlan = {
    workflowId:
      "phase-3b2-adapter-test",

    reason:
      "Verify AI workflow plans can be converted into controlled workflow definitions.",

    steps: [
      {
        id: "step-1",
        action: {
          toolName: "pc.read_file",
          parameters: {
            path:
              "D:\\LEO\\workspace\\adapter-test.txt"
          },
          reason:
            "Read the controlled test file."
        }
      },
      {
        id: "step-2",
        action: {
          toolName: "pc.write_file",
          parameters: {
            path:
              "D:\\LEO\\workspace\\adapter-test-output.txt",
            content:
              "Workflow adapter test."
          },
          reason:
            "Write the verified workflow output."
        }
      }
    ]
  };

  console.log(
    "\n[1] Converting valid WorkflowPlan..."
  );

  const definition =
    workflowPlanToDefinition(
      plan,
      executionContext
    );

  assert(
    definition.id ===
      "phase-3b2-adapter-test",
    "Workflow ID was not preserved."
  );

  assert(
    definition.startNodeId ===
      "step-1",
    "Start node was not set correctly."
  );

  assert(
    Object.keys(definition.nodes).length ===
      2,
    "Workflow node count is incorrect."
  );

  console.log(
    "PASS: Workflow definition created."
  );

  console.log(
    "PASS: Workflow ID preserved."
  );

  console.log(
    "PASS: Start node preserved."
  );

  console.log(
    "PASS: All workflow steps converted."
  );

  console.log(
    "\n[2] Verifying sequential transitions..."
  );

  assert(
    definition.nodes["step-1"] !==
      undefined,
    "Step 1 node is missing."
  );

  assert(
    definition.nodes["step-2"] !==
      undefined,
    "Step 2 node is missing."
  );

  const step1 =
    definition.nodes["step-1"];

  const step2 =
    definition.nodes["step-2"];

  const initialState = {};

  console.log(
    "\n[2] Verifying controlled approval boundary..."
  );

  let pauseError:
    unknown;

  try {
    await step1.run({
      state:
        initialState,

      workflowId:
        definition.id,

      nodeId:
        step1.id,

      attempt:
        1,

      history:
        []
    });
  } catch (error) {
    pauseError =
      error;
  }

  assert(
    pauseError instanceof Error,
    "Step 1 did not enter the controlled workflow pause path."
  );

  assert(
    pauseError instanceof
      (await import("./workflow.ts"))
        .WorkflowPauseError,
    "Step 1 did not raise WorkflowPauseError."
  );

  if (
    !(pauseError instanceof
      (await import("./workflow.ts"))
        .WorkflowPauseError)
  ) {
    throw new Error(
      "WorkflowPauseError was not produced."
    );
  }

  assert(
    pauseError.approvalId.length > 0,
    "Workflow pause did not provide an approval ID."
  );

  console.log(
    "PASS: Step 1 entered the approval boundary."
  );

  console.log(
    "PASS: WorkflowPauseError was raised."
  );

  console.log(
    "PASS: Approval ID was generated."
  );

  console.log(
    "\n[3] Verifying sequential transitions..."
  );

  assert(
    step1.next?.(
      initialState,
      undefined
    ) ===
      "step-2",
    "Step 1 did not transition to Step 2."
  );

  assert(
    step2.next?.(
      initialState,
      undefined
    ) ===
      null,
    "Final step did not terminate the workflow."
  );

  console.log(
    "PASS: Step 1 transitions to Step 2."
  );

  console.log(
    "PASS: Final step terminates correctly."
  );
  console.log(
    "\n[3] Rejecting invalid WorkflowPlan..."
  );

  let rejected =
    false;

  try {
    workflowPlanToDefinition(
      {
        workflowId:
          "invalid-test",
        reason:
          "Invalid workflow test.",
        steps: []
      },
      executionContext
    );
  } catch {
    rejected = true;
  }

  assert(
    rejected,
    "Invalid empty workflow was accepted."
  );

  console.log(
    "PASS: Invalid WorkflowPlan rejected."
  );

  console.log(
    "\n=== L.E.O. WORKFLOW PLAN ADAPTER TEST PASSED ==="
  );
}

main().catch((error) => {
  console.error(
    "\n=== L.E.O. WORKFLOW PLAN ADAPTER TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});