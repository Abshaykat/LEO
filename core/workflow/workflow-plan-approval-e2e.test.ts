import assert from "node:assert/strict";

import {
  runWorkflow,
  resumeWorkflow
} from "./workflow-runner.ts";

import {
  loadPausedWorkflow,
  deletePersistedWorkflow
} from "./workflow-store.ts";

import {
  workflowPlanToDefinition
} from "./workflow-plan-adapter.ts";

import {
  getApprovalRequest,
  approveRequest
} from "../approvals/approval-engine.ts";

import type {
  WorkflowState
} from "./workflow.ts";

import type {
  WorkflowPlan
} from "../actions/action-plan.ts";

import type {
  ExecutionContext
} from "../execution/execution-gate.ts";

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. MULTI-STEP WORKFLOW APPROVAL E2E TEST ==="
  );


  const workflowId =
    "phase-3b4-multi-step-approval-e2e";

  const workingDirectory =
    process.env.LEO_COMMAND_WORKING_DIRECTORY?.trim() ||
    "D:\\LEO";

  const executionContext: ExecutionContext = {
    source: "system",
    ownerAuthenticated: true
  };

  const plan: WorkflowPlan = {
    workflowId,

    reason:
      "Verify multi-step AI workflow execution remains approval-controlled per step.",

    steps: [
      {
        id:
          "step-1",

        action: {
          toolName:
            "pc.run_command",

          parameters: {
            command:
              'Write-Output "Workflow step 1 executed"',
            workingDirectory:
              workingDirectory
          },

          reason:
            "Execute the first controlled workflow step."
        }
      },

      {
        id:
          "step-2",

        action: {
          toolName:
            "pc.run_command",

          parameters: {
            command:
              'Write-Output "Workflow step 2 executed"',
            workingDirectory:
              workingDirectory
          },

          reason:
            "Execute the second controlled workflow step."
        }
      }
    ]
  };

  const definition =
    workflowPlanToDefinition(
      plan,
      executionContext
    );

  console.log(
    "\n[1] Starting AI-derived workflow..."
  );

  const pausedStep1 =
    await runWorkflow(
      definition,
      {
  
      }
    );

  assert.equal(
    pausedStep1.status,
    "paused"
  );

  assert.equal(
    pausedStep1.currentNodeId,
    "step-1"
  );

  assert.ok(
    pausedStep1.pendingApprovalId
  );

  const approvalId1 =
    pausedStep1.pendingApprovalId!;

  console.log(
    "PASS: Step 1 entered owner approval."
  );

  console.log(
    "Step 1 approval:",
    approvalId1
  );

  const approval1 =
    await getApprovalRequest(
      approvalId1
    );

  assert.ok(
    approval1
  );

  assert.equal(
    approval1?.status,
    "pending"
  );

  console.log(
    "PASS: Step 1 approval is pending."
  );

  console.log(
    "\n[2] Approving Step 1..."
  );

  await approveRequest(
    approvalId1
  );

  const approved1 =
    await getApprovalRequest(
      approvalId1
    );

  assert.ok(
    approved1
  );

  assert.equal(
    approved1?.status,
    "approved"
  );

  console.log(
    "PASS: Step 1 approval granted."
  );

  console.log(
    "\n[3] Resuming workflow after Step 1 approval..."
  );

  const pausedStep2 =
    await resumeWorkflow(
      definition,
      pausedStep1
    );

  assert.equal(
    pausedStep2.status,
    "paused"
  );

  assert.equal(
    pausedStep2.currentNodeId,
    "step-2"
  );

  assert.ok(
    pausedStep2.pendingApprovalId
  );

  const approvalId2 =
    pausedStep2.pendingApprovalId!;

  assert.notEqual(
    approvalId2,
    approvalId1
  );

  console.log(
    "PASS: Step 1 executed and workflow advanced to Step 2."
  );

  console.log(
    "PASS: Step 2 requires a new approval."
  );

  console.log(
    "PASS: Step 2 approval ID differs from Step 1."
  );

  const approval2 =
    await getApprovalRequest(
      approvalId2
    );

  assert.ok(
    approval2
  );

  assert.equal(
    approval2?.status,
    "pending"
  );

  console.log(
    "PASS: Step 2 approval is independently pending."
  );

  console.log(
    "\n[4] Verifying Step 1 approval cannot authorize Step 2..."
  );

  const step2AttemptWithStep1Approval =
    await getApprovalRequest(
      approvalId1
    );

  assert.ok(
    step2AttemptWithStep1Approval
  );

  assert.equal(
    step2AttemptWithStep1Approval?.status,
    "consumed"
  );

  assert.notEqual(
    approvalId1,
    approvalId2
  );

  console.log(
    "PASS: Step 1 approval was consumed by Step 1."
  );

  console.log(
    "PASS: Step 1 approval cannot be reused for Step 2."
  );

  console.log(
    "\n[5] Approving Step 2..."
  );

  await approveRequest(
    approvalId2
  );

  const approved2 =
    await getApprovalRequest(
      approvalId2
    );

  assert.ok(
    approved2
  );

  assert.equal(
    approved2?.status,
    "approved"
  );

  console.log(
    "PASS: Step 2 approval granted."
  );

  console.log(
    "\n[6] Resuming workflow after Step 2 approval..."
  );

  const completed =
    await resumeWorkflow(
      definition,
      pausedStep2
    );

  assert.equal(
    completed.status,
    "completed"
  );

  assert.equal(
    completed.currentNodeId,
    null
  );


  console.log(
    "PASS: Workflow completed after Step 2 approval."
  );

  const consumed1 =
    await getApprovalRequest(
      approvalId1
    );

  const consumed2 =
    await getApprovalRequest(
      approvalId2
    );

  assert.ok(
    consumed1
  );

  assert.ok(
    consumed2
  );

  assert.equal(
    consumed1?.status,
    "consumed"
  );

  assert.equal(
    consumed2?.status,
    "consumed"
  );

  console.log(
    "PASS: Both approvals were consumed exactly once."
  );

  console.log(
    "\n=== L.E.O. MULTI-STEP WORKFLOW APPROVAL E2E TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. MULTI-STEP WORKFLOW APPROVAL E2E TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);

}).finally(async () => {

  await deletePersistedWorkflow(
    "phase-3b4-multi-step-approval-e2e"
  );

});