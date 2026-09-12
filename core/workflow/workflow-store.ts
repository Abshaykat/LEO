import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile
} from "node:fs/promises";

import path from "node:path";
import { WORKFLOW_ROOT } from "../config/leo-config.ts";

import type {
  WorkflowResult,
  WorkflowState
} from "./workflow.ts";

function getWorkflowPath(
  workflowId: string
): string {
  return path.join(
    WORKFLOW_ROOT,
    `${workflowId}.json`
  );
}

async function ensureStore(): Promise<void> {
  await mkdir(
    WORKFLOW_ROOT,
    {
      recursive: true
    }
  );
}

export async function savePausedWorkflow<
  TState extends WorkflowState
>(
  workflow: WorkflowResult<TState>
): Promise<void> {

  if (workflow.status !== "paused") {
    throw new Error(
      "Only paused workflows can be persisted."
    );
  }

  if (!workflow.pendingApprovalId) {
    throw new Error(
      "Paused workflow must contain an approval ID."
    );
  }

  if (!workflow.currentNodeId) {
    throw new Error(
      "Paused workflow must contain a current node."
    );
  }

  await ensureStore();

  const workflowPath =
    getWorkflowPath(workflow.workflowId);

  const temporaryPath =
    `${workflowPath}.tmp`;

  await writeFile(
    temporaryPath,
    JSON.stringify(
      workflow,
      null,
      2
    ) + "\n",
    {
      encoding: "utf8"
    }
  );

  await rename(
    temporaryPath,
    workflowPath
  );
}

export async function loadPausedWorkflow<
  TState extends WorkflowState
>(
  workflowId: string
): Promise<WorkflowResult<TState> | undefined> {

  await ensureStore();

  const workflowPath =
    getWorkflowPath(workflowId);

  try {

    const content =
      await readFile(
        workflowPath,
        "utf8"
      );

    const parsed: unknown =
      JSON.parse(content);

    if (
      typeof parsed !== "object" ||
      parsed === null
    ) {
      throw new Error(
        "Persisted workflow must contain an object."
      );
    }

    const workflow =
      parsed as WorkflowResult<TState>;

    if (workflow.status !== "paused") {
      throw new Error(
        `Persisted workflow is not paused: ${workflow.status}`
      );
    }

    if (!workflow.pendingApprovalId) {
      throw new Error(
        "Persisted paused workflow is missing approval ID."
      );
    }

    if (!workflow.currentNodeId) {
      throw new Error(
        "Persisted paused workflow is missing current node."
      );
    }

    return workflow;

  } catch (error) {

    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}


export async function findPausedWorkflowByApprovalId(
  approvalId: string
): Promise<WorkflowResult<WorkflowState> | undefined> {

  if (!approvalId.trim()) {
    return undefined;
  }

  await ensureStore();

  const entries =
    await readdir(
      WORKFLOW_ROOT,
      {
        withFileTypes: true
      }
    );

  for (const entry of entries) {

    if (
      !entry.isFile() ||
      !entry.name.endsWith(".json")
    ) {
      continue;
    }

    const workflowPath =
      path.join(
        WORKFLOW_ROOT,
        entry.name
      );

    const content =
      await readFile(
        workflowPath,
        "utf8"
      );

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null
    ) {
      continue;
    }

    const workflow =
      parsed as Partial<
        WorkflowResult<WorkflowState>
      >;

    if (
      workflow.status === "paused" &&
      workflow.pendingApprovalId === approvalId
    ) {
      return workflow as WorkflowResult<WorkflowState>;
    }
  }

  return undefined;
}
export async function deletePersistedWorkflow(
  workflowId: string
): Promise<void> {

  const workflowPath =
    getWorkflowPath(workflowId);

  try {

    const {
      unlink
    } = await import("node:fs/promises");

    await unlink(workflowPath);

  } catch (error) {

    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}

export async function getWorkflowStorePath(
  workflowId: string
): Promise<string> {

  await ensureStore();

  return getWorkflowPath(workflowId);
}

