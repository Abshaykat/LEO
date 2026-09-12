import assert from "node:assert/strict";

import { COMMAND_WORKING_DIRECTORY } from "../config/leo-config.ts";

import {
  LeoRuntime
} from "./leo-runtime.ts";

import {
  createHash
} from "node:crypto";

import {
  OwnerAuthenticator
} from "../identity/owner-auth.ts";

import {
  getApprovalRequest,
  approveRequest
} from "../approvals/approval-engine.ts";

import {
  loadPausedWorkflow,
  deletePersistedWorkflow
} from "../workflow/workflow-store.ts";

import type {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. RUNTIME MULTI-STEP WORKFLOW E2E TEST ==="
  );

  const workflowId =
    `runtime-workflow-e2e-${Date.now()}`;

  let brainCalled = false;

  /*
   * The fake brain returns an AI-generated WorkflowPlan.
   *
   * Runtime execution, approval handling, persistence and
   * resume behavior remain real.
   */

  const brain = {
    async respond() {
      brainCalled = true;

      return {
        response:
          "Prepared a two-step workflow.",

        provider:
          "test",

        model:
          "test-model",

        actionPlan: {
          type:
            "workflow",

          workflow: {
            workflowId,

            reason:
              "Verify runtime multi-step workflow approval and resume.",

            steps: [
              {
                id:
                  "step-1",

                action: {
                  toolName:
                    "pc.run_command",

                  parameters: {
                    command:
                      'Write-Output "Runtime workflow step 1"',

                    workingDirectory:
                      COMMAND_WORKING_DIRECTORY
                  },

                  reason:
                    "Execute controlled runtime workflow step 1."
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
                      'Write-Output "Runtime workflow step 2"',

                    workingDirectory:
                      COMMAND_WORKING_DIRECTORY
                  },

                  reason:
                    "Execute controlled runtime workflow step 2."
                }
              }
            ]
          }
        }
      };
    }
  } as unknown as LeoBrain;

  const ownerToken =
    "phase-3c3-runtime-workflow-owner-token";

  const ownerId =
    "phase-3c3-runtime-workflow-owner";

  const tokenSha256 =
    createHash("sha256")
      .update(
        ownerToken,
        "utf8"
      )
      .digest("hex");

  const ownerAuthenticator =
    new OwnerAuthenticator({
      ownerId,
      tokenSha256
    });

  const runtime =
    new LeoRuntime(
      brain,
      ownerAuthenticator
    );

  /*
   * =========================================================
   * 1. START WORKFLOW THROUGH RUNTIME
   * =========================================================
   */

  console.log(
    "\n[1] Starting workflow through LeoRuntime..."
  );

  const first =
    await runtime.process({
      userMessage:
        "Please execute the prepared two-step workflow plan.",

      source:
        "text",

      ownerAuthToken:
        ownerToken
    });

  assert.equal(
    first.type,
    "approval_required"
  );

  assert.equal(
    brainCalled,
    true
  );

  const approvalId1 =
    first.approvalId;

  assert.ok(
    approvalId1
  );

  console.log(
    "PASS: Runtime returned Step 1 approval."
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

  /*
   * =========================================================
   * 2. APPROVE STEP 1
   * =========================================================
   */

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

  assert.equal(
    approved1?.status,
    "approved"
  );

  console.log(
    "PASS: Step 1 approval granted."
  );

  /*
   * =========================================================
   * 3. VERIFY PERSISTED WORKFLOW
   * =========================================================
   */

  const paused1 =
    await loadPausedWorkflow(
      workflowId
    );

  assert.ok(
    paused1
  );

  assert.equal(
    paused1?.pendingApprovalId,
    approvalId1
  );

  console.log(
    "PASS: Paused workflow persisted."
  );

  /*
   * =========================================================
   * 4. RESUME THROUGH LEO RUNTIME
   * =========================================================
   *
   * This is the critical bridge verification.
   */

  console.log(
    "\n[3] Resuming approved workflow through LeoRuntime..."
  );

  const second =
    await runtime.process({
      userMessage:
        "Continue the approved workflow.",

      source:
        "text",

      ownerAuthToken:
        ownerToken,

      approvalId:
        approvalId1
    });

  assert.equal(
    second.type,
    "approval_required"
  );

  const approvalId2 =
    second.approvalId;

  assert.ok(
    approvalId2
  );

  assert.notEqual(
    approvalId2,
    approvalId1
  );

  console.log(
    "PASS: Runtime resumed Step 1 and produced a new Step 2 approval."
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

  /*
   * =========================================================
   * 5. VERIFY STEP 1 APPROVAL WAS CONSUMED
   * =========================================================
   */

  const consumed1 =
    await getApprovalRequest(
      approvalId1
    );

  assert.equal(
    consumed1?.status,
    "consumed"
  );

  console.log(
    "PASS: Step 1 approval was consumed exactly once."
  );

  /*
   * =========================================================
   * 6. APPROVE STEP 2
   * =========================================================
   */

  console.log(
    "\n[4] Approving Step 2..."
  );

  await approveRequest(
    approvalId2
  );

  const approved2 =
    await getApprovalRequest(
      approvalId2
    );

  assert.equal(
    approved2?.status,
    "approved"
  );

  console.log(
    "PASS: Step 2 approval granted."
  );

  /*
   * =========================================================
   * 7. RESUME STEP 2 THROUGH LEO RUNTIME
   * =========================================================
   */

  console.log(
    "\n[5] Resuming Step 2 through LeoRuntime..."
  );

  const completed =
    await runtime.process({
      userMessage:
        "Continue the approved workflow.",

      source:
        "text",

      ownerAuthToken:
        ownerToken,

      approvalId:
        approvalId2
    });

  assert.equal(
    completed.type,
    "execution"
  );

  console.log(
    "PASS: Runtime completed the multi-step workflow."
  );

  /*
   * =========================================================
   * 8. VERIFY BOTH APPROVALS
   * =========================================================
   */

  const finalApproval1 =
    await getApprovalRequest(
      approvalId1
    );

  const finalApproval2 =
    await getApprovalRequest(
      approvalId2
    );

  assert.equal(
    finalApproval1?.status,
    "consumed"
  );

  assert.equal(
    finalApproval2?.status,
    "consumed"
  );

  console.log(
    "PASS: Both approvals were consumed exactly once."
  );

  console.log(
    "\n=== L.E.O. RUNTIME MULTI-STEP WORKFLOW E2E TEST PASSED ==="
  );

  await deletePersistedWorkflow(
    workflowId
  );
}

main().catch(
  async (error) => {

    console.error(
      "\n=== L.E.O. RUNTIME MULTI-STEP WORKFLOW E2E TEST FAILED ==="
    );

    console.error(
      error
    );

    process.exitCode =
      1;
  }
);
