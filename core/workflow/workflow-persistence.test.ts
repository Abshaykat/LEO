import assert from "node:assert/strict";

import {
  runWorkflow,
  resumeWorkflow
} from "./workflow-runner.ts";

import {
  loadPausedWorkflow,
  deletePersistedWorkflow,
  getWorkflowStorePath
} from "./workflow-store.ts";

import {
  WorkflowPauseError
} from "./workflow.ts";

import type {
  WorkflowDefinition,
  WorkflowState
} from "./workflow.ts";

async function main() {

  console.log(
    "=== L.E.O. WORKFLOW PERSISTENCE TEST ==="
  );

  interface State extends WorkflowState {
    value: number;
  }

  let executions = 0;

  const definition:
    WorkflowDefinition<State> = {
    id:
      "test-persistent-approval",

    startNodeId:
      "approval-node",

    nodes: {

      "approval-node": {

        id:
          "approval-node",

        async run({
          state,
          approvalId,
          attempt
        }) {

          executions++;

          if (!approvalId) {
            throw new WorkflowPauseError(
              "test-approval-id"
            );
          }

          assert.equal(
            approvalId,
            "test-approval-id"
          );

          assert.equal(
            attempt,
            1
          );

          return {
            state: {
              ...state,
              value:
                state.value + 1
            },

            output:
              "approved"
          };
        }
      }
    }
  };

  /*
   * 1. Start workflow.
   */

  const paused =
    await runWorkflow(
      definition,
      {
        value: 0
      }
    );

  assert.equal(
    paused.status,
    "paused"
  );

  assert.equal(
    paused.pendingApprovalId,
    "test-approval-id"
  );

  assert.equal(
    paused.currentNodeId,
    "approval-node"
  );

  assert.equal(
    paused.pendingApprovalAttempt,
    1
  );

  console.log(
    "PASS: Workflow paused."
  );

  /*
   * 2. Verify persisted state.
   */

  const stored =
    await loadPausedWorkflow<State>(
      definition.id
    );

  assert.ok(
    stored
  );

  assert.equal(
    stored?.status,
    "paused"
  );

  assert.equal(
    stored?.state.value,
    0
  );

  assert.equal(
    stored?.pendingApprovalId,
    "test-approval-id"
  );

  assert.equal(
    stored?.currentNodeId,
    "approval-node"
  );

  assert.equal(
    stored?.pendingApprovalAttempt,
    1
  );

  console.log(
    "PASS: Paused workflow persisted."
  );

  /*
   * 3. Verify process-restart simulation.
   */

  const reloaded =
    await loadPausedWorkflow<State>(
      definition.id
    );

  assert.ok(
    reloaded
  );

  console.log(
    "PASS: Paused workflow reloaded."
  );

  /*
   * 4. Resume using restored state.
   */

  const completed =
    await resumeWorkflow(
      definition,
      reloaded!
    );

  assert.equal(
    completed.status,
    "completed"
  );

  assert.equal(
    completed.state.value,
    1
  );

  assert.equal(
    completed.output,
    "approved"
  );

  assert.equal(
    completed.history.length,
    1
  );

  assert.equal(
    executions,
    2
  );

  console.log(
    "PASS: Persisted workflow resumed."
  );

  /*
   * 5. Verify storage location.
   */

  const storePath =
    await getWorkflowStorePath(
      definition.id
    );

  console.log(
    "Workflow store:",
    storePath
  );

  /*
   * 6. Cleanup test state.
   */

  await deletePersistedWorkflow(
    definition.id
  );

  const deleted =
    await loadPausedWorkflow<State>(
      definition.id
    );

  assert.equal(
    deleted,
    undefined
  );

  console.log(
    "PASS: Persisted test workflow cleaned up."
  );

  console.log(
    "\n=== WORKFLOW PERSISTENCE TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== WORKFLOW PERSISTENCE TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
