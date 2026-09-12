export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PermissionDecision =
  | "allow"
  | "require_approval"
  | "deny";

export interface ActionRequest {
  action: string;
  risk: RiskLevel;
  requiresOwnerApproval?: boolean;
  createsAgent?: boolean;
  changesPermissions?: boolean;
  affectsThirdParty?: boolean;
  destructive?: boolean;
}

export interface PermissionResult {
  decision: PermissionDecision;
  reason: string;
}

export function evaluateAction(
  request: ActionRequest
): PermissionResult {

  if (request.createsAgent) {
    return {
      decision: "require_approval",
      reason: "Creating or activating an AI agent requires explicit owner approval."
    };
  }

  if (request.changesPermissions) {
    return {
      decision: "require_approval",
      reason: "Changing permissions requires explicit owner approval."
    };
  }

  if (request.affectsThirdParty) {
    return {
      decision: "deny",
      reason: "Unauthorized or harmful third-party actions are not permitted."
    };
  }

  if (request.destructive) {
    return {
      decision: "require_approval",
      reason: "Destructive actions require explicit owner approval."
    };
  }

  if (request.requiresOwnerApproval) {
    return {
      decision: "require_approval",
      reason: "This action requires explicit owner approval."
    };
  }

  return {
    decision: "allow",
    reason: "Action satisfies the current L.E.O. permission policy."
  };
}
