import { execute, type ExecutionResult } from "../execution/execution-engine.ts";
import type { ExecutionContext } from "../execution/execution-gate.ts";
import { authorizeFamilyMemberForTool } from "./family-execution-context.ts";
import { writeAuditEvent } from "../audit/audit-log.ts";

export interface FamilyRequestInput {
  userId: string;
  toolName: string;
  parameters: unknown;
  reason: string;
  context: ExecutionContext;
  traceId?: string;
  approvalId?: string;
}

/**
 * Routes a family member's request through:
 *   1. authorizeFamilyMemberForTool — is this member active, and does
 *      their explicit granted scope cover this tool?
 *   2. The SAME execute() gate everything else goes through — meaning any
 *      tool that requires owner approval, is destructive, or affects
 *      external systems will still stop at require_approval and wait for
 *      the real owner, exactly as if the owner had requested it directly.
 *      A family member is never able to self-approve their own request.
 *
 * context.ownerAuthenticated is UNCHANGED by this function — it still
 * reflects whether this is a legitimate, authenticated L.E.O. session (the
 * app-level gate). userId additionally scopes and attributes the request
 * to a specific household member WITHIN that session.
 */
export async function requestAsFamilyMember(input: FamilyRequestInput): Promise<ExecutionResult> {
  const authorization = await authorizeFamilyMemberForTool(input.userId, input.toolName);

  if (!authorization.authorized) {
    await writeAuditEvent({
      type: "execution_denied",
      tool: input.toolName,
      traceId: input.traceId,
      userId: input.userId,
      decision: "deny",
      reason: authorization.reason,
      details: { stage: "family_member_authorization" }
    });
    return { decision: "deny", reason: authorization.reason ?? "This family member is not authorized for this tool." };
  }

  return execute({
    toolName: input.toolName,
    parameters: input.parameters,
    reason: input.reason,
    context: input.context,
    traceId: input.traceId,
    approvalId: input.approvalId,
    userId: input.userId
  });
}
