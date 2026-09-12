import type {
  WorkflowDefinition,
  WorkflowHistoryEntry,
  WorkflowResult,
  WorkflowState,
  WorkflowNodeContext
} from "./workflow.ts";

import {
  WorkflowPauseError
} from "./workflow.ts";

import {
  savePausedWorkflow
} from "./workflow-store.ts";

const DEFAULT_MAX_STEPS = 100;

interface WorkflowRunOptions {
  resumeApprovalId?: string;
  resumeNodeId?: string;
  resumeAttempt?: number;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function validateDefinition<TState extends WorkflowState>(
  definition: WorkflowDefinition<TState>
): number {

  const maxSteps =
    definition.maxSteps ?? DEFAULT_MAX_STEPS;

  if (maxSteps < 1) {
    throw new Error(
      "Workflow maxSteps must be greater than zero."
    );
  }

  if (!definition.id.trim()) {
    throw new Error(
      "Workflow id is required."
    );
  }

  if (!definition.nodes[definition.startNodeId]) {
    throw new Error(
      `Workflow start node does not exist: ${definition.startNodeId}`
    );
  }

  return maxSteps;
}

export async function runWorkflow<
  TState extends WorkflowState
>(
  definition: WorkflowDefinition<TState>,
  initialState: TState
): Promise<WorkflowResult<TState>> {

  return runWorkflowInternal(
    definition,
    initialState,
    [],
    {
      resumeNodeId:
        definition.startNodeId
    }
  );
}

export async function resumeWorkflow<
  TState extends WorkflowState
>(
  definition: WorkflowDefinition<TState>,
  paused: WorkflowResult<TState>
): Promise<WorkflowResult<TState>> {

  if (paused.status !== "paused") {
    throw new Error(
      `Workflow cannot be resumed from status: ${paused.status}.`
    );
  }

  if (!paused.pendingApprovalId) {
    throw new Error(
      "Paused workflow does not contain an approval ID."
    );
  }

  if (!paused.currentNodeId) {
    throw new Error(
      "Paused workflow does not contain a current node."
    );
  }

  return runWorkflowInternal(
    definition,
    paused.state,
    paused.history,
    {
      resumeApprovalId:
        paused.pendingApprovalId,

      resumeNodeId:
        paused.currentNodeId,

      resumeAttempt:
        paused.pendingApprovalAttempt ?? 1
    }
  );
}

async function runWorkflowInternal<
  TState extends WorkflowState
>(
  definition: WorkflowDefinition<TState>,
  initialState: TState,
  existingHistory: WorkflowHistoryEntry[],
  options: WorkflowRunOptions
): Promise<WorkflowResult<TState>> {

  const maxSteps =
    validateDefinition(definition);

  const history =
    [...existingHistory];

  let state =
    initialState;

  let currentNodeId:
    string | null =
    options.resumeNodeId ??
    definition.startNodeId;

  let lastOutput:
    unknown;

  for (
    let step = 0;
    step < maxSteps;
    step++
  ) {

    if (!currentNodeId) {

      return {
        workflowId: definition.id,
        status: "completed",
        state,
        history,
        currentNodeId: null,
        output: lastOutput
      };
    }

    const node:
      WorkflowDefinition<TState>["nodes"][string] =
      definition.nodes[currentNodeId];

    if (!node) {

      return {
        workflowId: definition.id,
        status: "failed",
        state,
        history,
        currentNodeId,
        output: lastOutput,
        error:
          `Workflow node does not exist: ${currentNodeId}`
      };
    }

    const maxAttempts =
      Math.max(
        1,
        node.retry?.maxAttempts ?? 1
      );

    const firstAttempt =
      options.resumeNodeId === node.id &&
      options.resumeAttempt
        ? options.resumeAttempt
        : 1;

    let succeeded = false;

    let nodeOutput:
      unknown;

    for (
      let attempt = firstAttempt;
      attempt <= maxAttempts;
      attempt++
    ) {

      try {

        const context:
          WorkflowNodeContext<TState> = {
          state,
          workflowId:
            definition.id,
          nodeId:
            node.id,
          attempt,
          history,
          approvalId:
            options.resumeNodeId === node.id
              ? options.resumeApprovalId
              : undefined
        };

        const result =
          await node.run(context);

        state =
          result.state;

        nodeOutput =
          result.output;

        history.push({
          nodeId:
            node.id,
          attempt,
          status:
            "success"
        });

        succeeded = true;

        options.resumeApprovalId =
          undefined;

        options.resumeNodeId =
          undefined;

        options.resumeAttempt =
          undefined;

        break;

      } catch (error) {

        if (
          error instanceof
          WorkflowPauseError
        ) {

          const pausedResult:
            WorkflowResult<TState> = {
            workflowId:
              definition.id,

            status:
              "paused",

            state,

            history,

            currentNodeId:
              node.id,

            output:
              lastOutput,

            pendingApprovalId:
              error.approvalId,

            pendingApprovalAttempt:
              attempt
          };

          await savePausedWorkflow(
            pausedResult
          );

          return pausedResult;
        }

        const normalized =
          normalizeError(error);

        history.push({
          nodeId:
            node.id,

          attempt,

          status:
            "failure",

          error:
            normalized.message
        });

        if (
          attempt === maxAttempts
        ) {

          return {
            workflowId:
              definition.id,

            status:
              "failed",

            state,

            history,

            currentNodeId:
              node.id,

            output:
              lastOutput,

            error:
              normalized.message
          };
        }
      }
    }

    if (!succeeded) {

      return {
        workflowId:
          definition.id,

        status:
          "failed",

        state,

        history,

        currentNodeId:
          node.id,

        output:
          lastOutput,

        error:
          "Workflow node failed."
      };
    }

    lastOutput =
      nodeOutput;

    if (!node.next) {

      return {
        workflowId:
          definition.id,

        status:
          "completed",

        state,

        history,

        currentNodeId:
          null,

        output:
          lastOutput
      };
    }

    const nextNodeId:
      string | null =
      node.next(
        state,
        nodeOutput
      );

    if (
      nextNodeId === null
    ) {

      return {
        workflowId:
          definition.id,

        status:
          "completed",

        state,

        history,

        currentNodeId:
          null,

        output:
          lastOutput
      };
    }

    if (
      !definition.nodes[nextNodeId]
    ) {

      return {
        workflowId:
          definition.id,

        status:
          "failed",

        state,

        history,

        currentNodeId:
          node.id,

        output:
          lastOutput,

        error:
          `Workflow transition points to unknown node: ${nextNodeId}`
      };
    }

    currentNodeId =
      nextNodeId;
  }

  return {
    workflowId:
      definition.id,

    status:
      "failed",

    state,

    history,

    currentNodeId,

    output:
      lastOutput,

    error:
      `Workflow exceeded maximum step limit of ${maxSteps}.`
  };
}
