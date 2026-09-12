import type { ToolPermission } from "../permissions/tool-registry.ts";

export type FamilyMemberStatus = "active" | "disabled";

/**
 * A role is advisory metadata for the owner's own record-keeping — it does
 * NOT itself grant any permission. Only the explicit `permissions` list on
 * a LeoFamilyMember does. This avoids a "role" ever silently implying more
 * access than the owner actually typed in.
 */
export type FamilyRole = "adult" | "child" | "guest";

export interface LeoFamilyMember {
  id: string;
  name: string;
  role: FamilyRole;
  status: FamilyMemberStatus;

  /** The exact, explicit subset of ToolPermission this member may use — never inferred from role. */
  permissions: ToolPermission[];

  /**
   * Optional link to a voice profile enrolled in the voice service, used
   * ONLY for personalization suggestions (e.g. greeting them by name) —
   * never as authorization proof. See identity/family-execution-context.ts.
   */
  voiceProfileId?: string;

  version: number;
  createdAt: string;
  updatedAt: string;
}
