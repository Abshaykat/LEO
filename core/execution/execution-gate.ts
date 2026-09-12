import { recordDecisionTrace } from "../audit/decision-trace.ts";
import type {
  ActionRequest,
  PermissionResult
} from "../permissions/permission-engine.ts";

import {
  evaluateAction
} from "../permissions/permission-engine.ts";

import {
  createApprovalRequest,
  consumeApproval
} from "../approvals/approval-engine.ts";

import {
  writeAuditEvent
} from "../audit/audit-logger.ts";

import type {
  ToolDefinition
} from "../permissions/tool-registry.ts";

export interface ExecutionContext {
  source: "text" | "voice" | "system";
  ownerAuthenticated: boolean;
}

export interface ExecutionRequest {
  tool: ToolDefinition;
  parameters: unknown;
  reason: string;
  context: ExecutionContext;
  approvalId?: string;
  traceId?: string;
  /** Set when this call was delegated by the Supervisor to a specific L.E.O. agent. */
  agentId?: string;
  /** Set when this call was made on behalf of a specific family member (never the owner themselves). */
  userId?: string;
}

export type ExecutionDecision =
  | {
      decision: "allow";
      reason: string;
      result: unknown;
    }
  | {
      decision: "require_approval";
      reason: string;
      approvalId: string;
    }
  | {
      decision: "deny";
      reason: string;
    };

export type ToolExecutor = (
  tool: ToolDefinition,
  parameters: unknown
) => Promise<unknown>;

function buildPermissionRequest(
  tool: ToolDefinition
): ActionRequest {

  return {
    action: tool.name,
    risk: tool.risk,
    requiresOwnerApproval: tool.requiresApproval,
    affectsThirdParty: tool.affectsExternalSystems,
    destructive: tool.destructive,
    createsAgent: tool.name === "agent.create",
    changesPermissions:
      tool.name === "permissions.modify"
  };
}

export async function executeThroughGate(
  request: ExecutionRequest,
  executor: ToolExecutor
): Promise<ExecutionDecision> {

  const {
    tool,
    parameters,
    reason,
    context,
    approvalId,
    traceId,
    agentId,
    userId
  } = request;

  /*
   * Record every execution request.
   */
  await writeAuditEvent({
    type: "request",
    tool: tool.name,
    traceId,
    agentId,
    userId,
    details: {
      source: context.source,
      ownerAuthenticated: context.ownerAuthenticated
    }
  });

  /*
   * Owner authentication is mandatory.
   */
  if (!context.ownerAuthenticated) {

    await writeAuditEvent({
      type: "authorization",
      tool: tool.name,
      traceId,
      decision: "deny",
      details: {
        reason: "Owner authentication required."
      }
    });

    return {
      decision: "deny",
      reason: "Owner authentication is required."
    };
  }

  /*
   * IMPORTANT:
   *
   * The permission request is generated from the
   * registered ToolDefinition.
   *
   * The model cannot downgrade the risk level.
   */
  const permission =
    buildPermissionRequest(tool);

  const authorization: PermissionResult =
    evaluateAction(permission);

  await writeAuditEvent({
    type: "authorization",
    tool: tool.name,
    traceId,
    action: permission.action,
    decision: authorization.decision,
    details: {
      reason: authorization.reason,
      risk: permission.risk,
      requiresApproval: permission.requiresOwnerApproval,
      destructive: permission.destructive,
      affectsThirdParty: permission.affectsThirdParty
    }
  });

  /*
   * Hard denial.
   */
  if (authorization.decision === "deny") {

    return {
      decision: "deny",
      reason: authorization.reason
    };
  }

  /*
   * Owner approval required.
   */
  if (authorization.decision === "require_approval") {

    /*
     * First pass:
     * create an approval request.
     */
    if (!approvalId) {

      const approval = await createApprovalRequest(
        tool,
        parameters,
        reason,
        traceId
      );

      await writeAuditEvent({
        type: "decision_trace",
        traceId,
        tool: tool.name,
        approvalId: approval.id,
        decision: "require_approval",
        details: {
          stage: "approval_requested",
          reason: authorization.reason
        }
      });

      return {
        decision: "require_approval",
        reason: authorization.reason,
        approvalId: approval.id
      };
    }

    /*
     * Second pass:
     *
     * consumeApproval verifies:
     *
     * 1. Approval exists.
     * 2. Approval is approved.
     * 3. Approval hasn't expired.
     * 4. Tool matches.
     * 5. Parameters match the original hash.
     * 6. Approval cannot be reused.
     */
    await consumeApproval(
      approvalId,
      tool.name,
      parameters,
      traceId
    );

    await writeAuditEvent({
      type: "decision_trace",
      traceId,
      tool: tool.name,
      approvalId,
      decision: "allow",
      details: {
        stage: "approval_consumed"
      }
    });
  }

  /*
   * The action has passed the authorization boundary.
   */
  await writeAuditEvent({
    type: "execution_started",
    tool: tool.name,
    traceId,
    action: permission.action,
    approvalId,
    agentId,
    userId,
    details: {
      risk: permission.risk
    }
  });

  await recordDecisionTrace({
    traceId: traceId ?? "",
    stage: "execution_started",
    outcome: "pending",
    tool: tool.name,
    approvalId,
    details: {
      risk: permission.risk
    }
  });
  try {

    /*
     * ONLY the executor can actually perform
     * the underlying operation.
     */
    const result =
      await executor(tool, parameters);

    await writeAuditEvent({
      type: "execution_finished",
      tool: tool.name,
      traceId,
      action: permission.action,
      approvalId,
      agentId,
      userId,
      success: true
    });

    await recordDecisionTrace({
      traceId: traceId ?? "",
      stage: "execution_finished",
      outcome: "success",
      tool: tool.name,
      approvalId
    });
    /*
     * Initial verification record.
     *
     * Later this will become a real result verifier
     * rather than simply recording successful completion.
     */
    await writeAuditEvent({
      type: "verification",
      tool: tool.name,
      traceId,
      action: permission.action,
      approvalId,
      success: true,
      details: {
        message: "Execution returned successfully."
      }
    });

    await recordDecisionTrace({
      traceId: traceId ?? "",
      stage: "verification",
      outcome: "success",
      tool: tool.name,
      approvalId,
      details: {
        message: "Execution returned successfully."
      }
    });
    return {
      decision: "allow",
      reason: "Action passed the L.E.O. execution gate.",
      result
    };

  } catch (error) {

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await writeAuditEvent({
      type: "execution_failed",
      tool: tool.name,
      traceId,
      action: permission.action,
      approvalId,
      agentId,
      userId,
      success: false,
      details: {
        error: message
      }
    });

    await recordDecisionTrace({
      traceId: traceId ?? "",
      stage: "execution_failed",
      outcome: "failure",
      tool: tool.name,
      approvalId,
      reason: message
    });
    throw error;
  }
}







