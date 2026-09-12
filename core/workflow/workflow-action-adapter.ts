import {
  execute,
  type ExecutionResult
} from "../execution/execution-engine.ts";

import type {
  PlannedAction
} from "../actions/action-plan.ts";

import type {
  ExecutionContext
} from "../execution/execution-gate.ts";

import {
  WorkflowPauseError
} from "./workflow.ts";

export interface WorkflowActionRequest {
  action: PlannedAction;
  context: ExecutionContext;
  approvalId?: string;
}

export async function executePlannedAction(
  request: WorkflowActionRequest
): Promise<ExecutionResult> {
  return execute({
    toolName: request.action.toolName,
    parameters: request.action.parameters,
    reason: request.action.reason,
    context: request.context,
    approvalId: request.approvalId
  });
}

export async function executePlannedActionForWorkflow(
  request: WorkflowActionRequest
): Promise<ExecutionResult> {
  const result = await executePlannedAction(request);

  if (result.decision === "require_approval") {
    throw new WorkflowPauseError(result.approvalId);
  }

  return result;
}
