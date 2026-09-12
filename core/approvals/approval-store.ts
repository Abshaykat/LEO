import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { APPROVAL_ROOT } from "../config/leo-config.ts";
import path from "node:path";

import type { ApprovalRequest } from "./approval-engine.ts";

const APPROVAL_FILE = path.join(
  APPROVAL_ROOT,
  "approvals.json"
);

async function ensureStore(): Promise<void> {
  await mkdir(APPROVAL_ROOT, {
    recursive: true
  });
}

async function readApprovals(): Promise<ApprovalRequest[]> {
  await ensureStore();

  try {
    const content = await readFile(
      APPROVAL_FILE,
      "utf8"
    );

    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error(
        "Approval store must contain an array."
      );
    }

    return parsed as ApprovalRequest[];

  } catch (error) {

    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

async function writeApprovals(
  approvals: ApprovalRequest[]
): Promise<void> {

  await ensureStore();

  const temporaryFile =
    `${APPROVAL_FILE}.tmp`;

  await writeFile(
    temporaryFile,
    JSON.stringify(
      approvals,
      null,
      2
    ) + "\n",
    {
      encoding: "utf8"
    }
  );

  await rename(
    temporaryFile,
    APPROVAL_FILE
  );
}

export async function saveApproval(
  approval: ApprovalRequest
): Promise<void> {

  const approvals =
    await readApprovals();

  const index =
    approvals.findIndex(
      (item) => item.id === approval.id
    );

  if (index >= 0) {
    approvals[index] = approval;
  } else {
    approvals.push(approval);
  }

  await writeApprovals(approvals);
}

export async function getStoredApproval(
  id: string
): Promise<ApprovalRequest | undefined> {

  const approvals =
    await readApprovals();

  return approvals.find(
    (approval) => approval.id === id
  );
}

export async function listStoredApprovals():
  Promise<ApprovalRequest[]> {

  return readApprovals();
}

export async function getApprovalStorePath():
  Promise<string> {

  await ensureStore();

  return APPROVAL_FILE;
}
