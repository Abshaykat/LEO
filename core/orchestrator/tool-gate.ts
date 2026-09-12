import {
  evaluateAction
} from "../permissions/permission-engine.ts";

import {
  getTool
} from "../permissions/tool-registry.ts";

import {
  createApprovalRequest
} from "../approvals/approval-engine.ts";

import {
  writeAuditEvent
} from "../audit/audit-logger.ts";

export interface ToolExecutionRequest {
  toolName: string;
  parameters: unknown;
  reason: string;
}

export interface ToolExecutionDecision {
  decision: "allow" | "require_approval" | "deny";
  reason: string;
  approvalId?: string;
}

export async function authorizeTool(
  request: ToolExecutionRequest
): Promise<ToolExecutionDecision> {

  const tool = getTool(request.toolName);

  if (!tool) {

    await writeAuditEvent({
      type: "authorization",
      tool: request.toolName,
      decision: "deny",
      details: {
        reason: "Unknown tool"
      }
    });

    return {
      decision: "deny",
      reason: `Unknown tool: ${request.toolName}`
    };
  }

  const policy = evaluateAction({
    action: tool.name,
    risk: tool.risk,
    requiresOwnerApproval: tool.requiresApproval,
    affectsThirdParty: tool.affectsExternalSystems,
    destructive: tool.destructive,
    createsAgent: tool.name === "agent.create",
    changesPermissions: tool.name === "permissions.modify"
  });

  if (policy.decision === "require_approval") {

    const approval = await createApprovalRequest(
      tool,
      request.parameters,
      request.reason
    );

    return {
      decision: "require_approval",
      reason: policy.reason,
      approvalId: approval.id
    };
  }

  await writeAuditEvent({
    type: "authorization",
    tool: tool.name,
    decision: policy.decision,
    details: {
      reason: policy.reason
    }
  });

  return {
    decision: policy.decision,
    reason: policy.reason
  };
}
