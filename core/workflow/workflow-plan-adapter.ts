import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowState
} from "./workflow.ts";

import type {
  WorkflowPlan
} from "../actions/action-plan.ts";

import type {
  ExecutionContext
} from "../execution/execution-gate.ts";

import {
  executePlannedActionForWorkflow
} from "./workflow-action-adapter.ts";

function assertValidWorkflowPlan(
  plan: WorkflowPlan
): void {
  if (
    typeof plan.workflowId !== "string" ||
    plan.workflowId.trim().length === 0
  ) {
    throw new Error(
      "WorkflowPlan requires a non-empty workflowId."
    );
  }

  if (
    !Array.isArray(plan.steps) ||
    plan.steps.length === 0
  ) {
    throw new Error(
      "WorkflowPlan requires at least one step."
    );
  }

  if (
    typeof plan.reason !== "string" ||
    plan.reason.trim().length === 0
  ) {
    throw new Error(
      "WorkflowPlan requires a non-empty reason."
    );
  }

  const stepIds =
    new Set<string>();

  for (const step of plan.steps) {
    if (
      typeof step.id !== "string" ||
      step.id.trim().length === 0
    ) {
      throw new Error(
        "WorkflowPlan contains a step without a valid id."
      );
    }

    if (stepIds.has(step.id)) {
      throw new Error(
        `WorkflowPlan contains duplicate step id '${step.id}'.`
      );
    }

    stepIds.add(step.id);

    if (
      typeof step.action !== "object" ||
      step.action === null
    ) {
      throw new Error(
        `Workflow step '${step.id}' contains an invalid action.`
      );
    }

    if (
      typeof step.action.toolName !== "string" ||
      step.action.toolName.trim().length === 0
    ) {
      throw new Error(
        `Workflow step '${step.id}' contains an invalid tool name.`
      );
    }

    if (
      typeof step.action.reason !== "string" ||
      step.action.reason.trim().length === 0
    ) {
      throw new Error(
        `Workflow step '${step.id}' contains an invalid action reason.`
      );
    }

    if (
      typeof step.action.parameters !== "object" ||
      step.action.parameters === null
    ) {
      throw new Error(
        `Workflow step '${step.id}' contains invalid action parameters.`
      );
    }
  }
}

export function workflowPlanToDefinition(
  plan: WorkflowPlan,
  context: ExecutionContext
): WorkflowDefinition<WorkflowState> {
  assertValidWorkflowPlan(plan);

  const nodes:
    Record<string, WorkflowNode<WorkflowState>> = {};

  for (
    let index = 0;
    index < plan.steps.length;
    index++
  ) {
    const step =
      plan.steps[index];

    if (!step) {
      throw new Error(
        `WorkflowPlan contains an invalid step at index ${index}.`
      );
    }

    const nextStep =
      plan.steps[index + 1];

    nodes[step.id] = {
      id:
        step.id,

      run: async ({
        state,
        approvalId
      }) => {

        const result =
          await executePlannedActionForWorkflow({
            action:
              step.action,

            context,

            approvalId
          });

        if (
          result.decision !==
          "allow"
        ) {
          throw new Error(
            `Workflow action did not execute: ${result.decision}`
          );
        }

        return {
          state,
          output:
            result.result
        };
      },

      next: () =>
        nextStep?.id ?? null
    };
  }

  return {
    id:
      plan.workflowId,

    startNodeId:
      plan.steps[0]!.id,

    nodes
  };
}