import { randomUUID } from "node:crypto";

import {
  writeAuditEvent
} from "./audit-logger.ts";

export type DecisionTraceStage =
  | "request_received"
  | "action_planned"
  | "action_validated"
  | "authorization"
  | "approval_requested"
  | "approval_consumed"
  | "execution_started"
  | "execution_finished"
  | "execution_failed"
  | "verification";

export type DecisionTraceOutcome =
  | "pending"
  | "allow"
  | "deny"
  | "require_approval"
  | "success"
  | "failure";

export interface DecisionTrace {
  traceId: string;
  stage: DecisionTraceStage;
  outcome: DecisionTraceOutcome;
  tool?: string;
  approvalId?: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export function createTraceId(): string {
  return randomUUID();
}

export async function recordDecisionTrace(
  trace: DecisionTrace
): Promise<void> {

  await writeAuditEvent({
    type: "decision_trace",
    traceId: trace.traceId,
    tool: trace.tool,
    approvalId: trace.approvalId,
    decision: trace.outcome,
    reason: trace.reason,
    details: {
      stage: trace.stage,
      ...(trace.details ?? {})
    }
  });
}

