import { getFamilyMember } from "./family-store.ts";
import { getTool } from "../permissions/tool-registry.ts";
import type { LeoFamilyMember } from "./family-types.ts";

export interface FamilyAuthorizationResult {
  /** True only when the member may have this tool executed on their behalf directly. */
  authorized: boolean;
  /** True when the tool requires the actual owner's approval, regardless of the member's scope. */
  requiresOwnerApproval: boolean;
  reason?: string;
  member?: LeoFamilyMember;
  missingPermissions?: string[];
}

/**
 * A tool that requires owner approval, is destructive, or affects external
 * systems can NEVER be directly authorized for a family member, no matter
 * what permissions they've been granted — those always flow to a real
 * owner-approval step. This mirrors (and is at least as strict as) the
 * rule the Supervisor already enforces for agents.
 */
function toolAlwaysNeedsOwner(toolName: string): boolean {
  const tool = getTool(toolName);
  if (!tool) return true;
  return (
    Boolean(tool.requiresApproval || tool.destructive || tool.affectsExternalSystems) ||
    toolName === "agent.create" ||
    toolName === "permissions.modify"
  );
}

export async function authorizeFamilyMemberForTool(
  userId: string,
  toolName: string
): Promise<FamilyAuthorizationResult> {
  const member = await getFamilyMember(userId);
  if (!member) {
    return { authorized: false, requiresOwnerApproval: false, reason: `Unknown family member: ${userId}` };
  }

  if (member.status !== "active") {
    return {
      authorized: false,
      requiresOwnerApproval: false,
      reason: `Family member "${member.name}" is not active (status: ${member.status}).`,
      member
    };
  }

  const tool = getTool(toolName);
  if (!tool) {
    return { authorized: false, requiresOwnerApproval: false, reason: `Unknown tool: ${toolName}`, member };
  }

  const missingPermissions = tool.permissions.filter(permission => !member.permissions.includes(permission));
  if (missingPermissions.length > 0) {
    return {
      authorized: false,
      requiresOwnerApproval: false,
      reason: `"${member.name}" is not granted the permission(s) required for "${toolName}": ${missingPermissions.join(", ")}.`,
      member,
      missingPermissions
    };
  }

  const needsOwner = toolAlwaysNeedsOwner(toolName);
  return {
    // "authorized" here means "may proceed through the normal gate" — if
    // needsOwner is true, that gate will still stop at require_approval,
    // exactly as it would for the owner's own request. The member is
    // never given a shortcut around that.
    authorized: true,
    requiresOwnerApproval: needsOwner,
    reason: needsOwner
      ? `"${member.name}" may request this, but it requires the owner's approval before it runs.`
      : `"${member.name}" is authorized for this tool.`,
    member
  };
}
