import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AUDIT_ROOT } from "../config/leo-config.ts";

export type AuditEventType =
  | "permission_decision"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_consumed"
  | "execution_started"
  | "execution_succeeded"
  | "execution_failed"
  | "execution_denied"
  | "request"
  | "authorization"
  | "approval_created"
  | "approval_decided"
  | "execution_finished"
  | "verification"
  | "decision_trace"
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "memory_retrieved"
  | "memory_access_denied";

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  traceId?: string;
  tool?: string;
  action?: string;
  approvalId?: string;
  agentId?: string;
  userId?: string;
  decision?: string;
  reason?: string;
  parametersHash?: string;
  success?: boolean;
  result?: unknown;
  error?: string;
  details?: unknown;
}

const AUDIT_FILE = path.join(AUDIT_ROOT, "events.jsonl");

function sanitize(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  try {
    JSON.stringify(value);
    return value;
  } catch {
    return "[UNSERIALIZABLE]";
  }
}

export async function writeAuditEvent(
  event: Omit<AuditEvent, "id" | "timestamp">
): Promise<AuditEvent> {
  await mkdir(AUDIT_ROOT, {
    recursive: true
  });

  const record: AuditEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
    result: sanitize(event.result),
    details: sanitize(event.details)
  };

  await appendFile(
    AUDIT_FILE,
    JSON.stringify(record) + "\n",
    {
      encoding: "utf8"
    }
  );

  return record;
}

export function getAuditFilePath(): string {
  return AUDIT_FILE;
}

