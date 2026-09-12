import { randomUUID } from "node:crypto";

import type { ToolDefinition } from "../permissions/tool-registry.ts";

import {
  createActionHash
} from "./action-hash.ts";

import {
  writeAuditEvent
} from "../audit/audit-logger.ts";

import {
  saveApproval,
  getStoredApproval,
  listStoredApprovals
} from "./approval-store.ts";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "consumed";

export interface ApprovalRequest {
  id: string;
  tool: string;
  description: string;
  consequence: string;
  parameters: unknown;
  actionHash: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
}

const APPROVAL_LIFETIME_MS = 5 * 60 * 1000;

export async function createApprovalRequest(
  tool: ToolDefinition,
  parameters: unknown,
  reason: string,
  traceId?: string
): Promise<ApprovalRequest> {

  const now = Date.now();

  const request: ApprovalRequest = {
    id: randomUUID(),
    tool: tool.name,
    description: tool.description,
    consequence: tool.consequence,
    parameters,
    actionHash: createActionHash(
      tool.name,
      parameters
    ),
    reason,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(
      now + APPROVAL_LIFETIME_MS
    ).toISOString(),
    status: "pending"
  };

  await saveApproval(request);

  await writeAuditEvent({
    type: "approval_created",
    tool: tool.name,
    approvalId: request.id,
    traceId,
    details: {
      actionHash: request.actionHash,
      reason,
      consequence: request.consequence
    }
  });

  return request;
}

export async function getApprovalRequest(
  id: string
): Promise<ApprovalRequest | undefined> {

  return getStoredApproval(id);
}

export async function listPendingApprovals():
  Promise<ApprovalRequest[]> {

  const approvals =
    await listStoredApprovals();

  const now = Date.now();

  const pending: ApprovalRequest[] = [];

  for (const request of approvals) {

    if (
      request.status === "pending" &&
      Date.parse(request.expiresAt) <= now
    ) {

      request.status = "expired";

      await saveApproval(request);

      continue;
    }

    if (request.status === "pending") {
      pending.push(request);
    }
  }

  return pending;
}

export async function approveRequest(
  id: string,
  traceId?: string
): Promise<ApprovalRequest> {

  const request =
    await getStoredApproval(id);

  if (!request) {
    throw new Error(
      "Approval request not found."
    );
  }

  if (request.status !== "pending") {
    throw new Error(
      `Approval request is ${request.status}.`
    );
  }

  if (
    Date.parse(request.expiresAt) <= Date.now()
  ) {

    request.status = "expired";

    await saveApproval(request);

    throw new Error(
      "Approval request has expired."
    );
  }

  request.status = "approved";

  await saveApproval(request);

  await writeAuditEvent({
    type: "approval_decided",
    tool: request.tool,
    approvalId: request.id,
    traceId,
    decision: "approved",
    details: {
      actionHash: request.actionHash
    }
  });

  return request;
}

export async function rejectRequest(
  id: string,
  traceId?: string
): Promise<ApprovalRequest> {

  const request =
    await getStoredApproval(id);

  if (!request) {
    throw new Error(
      "Approval request not found."
    );
  }

  if (request.status !== "pending") {
    throw new Error(
      `Approval request is ${request.status}.`
    );
  }

  request.status = "rejected";

  await saveApproval(request);

  await writeAuditEvent({
    type: "approval_decided",
    tool: request.tool,
    approvalId: request.id,
    traceId,
    decision: "rejected",
    details: {
      actionHash: request.actionHash
    }
  });

  return request;
}

export async function consumeApproval(
  id: string,
  toolName: string,
  parameters: unknown,
  traceId?: string
): Promise<ApprovalRequest> {

  const request =
    await getStoredApproval(id);

  if (!request) {
    throw new Error(
      "Approval request not found."
    );
  }

  if (request.status !== "approved") {
    throw new Error(
      `Approval is not executable. Current status: ${request.status}.`
    );
  }

  if (
    Date.parse(request.expiresAt) <= Date.now()
  ) {

    request.status = "expired";

    await saveApproval(request);

    throw new Error(
      "Approval request has expired."
    );
  }

  if (request.tool !== toolName) {
    throw new Error(
      "Approved tool does not match execution tool."
    );
  }

  const currentHash =
    createActionHash(
      toolName,
      parameters
    );

  if (
    currentHash !== request.actionHash
  ) {
    throw new Error(
      "Action parameters do not match the approved action."
    );
  }

  request.status = "consumed";

  await saveApproval(request);

  await writeAuditEvent({
    type: "approval_consumed",
    tool: request.tool,
    approvalId: request.id,
    traceId,
    details: {
      actionHash: request.actionHash
    }
  });

  return request;
}

