import { getAgent } from "./agent-store.ts";
import { getTool } from "../permissions/tool-registry.ts";
import type { LeoAgent } from "./agent-types.ts";

export interface AgentAuthorizationResult {
  authorized: boolean;
  reason?: string;
  agent?: LeoAgent;
  missingPermissions?: string[];
}

/**
 * Checks whether a stored agent is currently allowed to invoke a given
 * tool, based purely on the agent's own record — lifecycle status,
 * declared permissions, and security policy. This is a SEPARATE, ADDITIONAL
 * guard: passing this check does not skip the owner permission/approval
 * gate in execution-engine.ts. An agent must clear BOTH.
 */
export async function authorizeAgentForTool(
  agentId: string,
  toolName: string
): Promise<AgentAuthorizationResult> {
  const agent = await getAgent(agentId);
  if (!agent) {
    return { authorized: false, reason: `Unknown agent: ${agentId}` };
  }

  if (agent.status !== "active") {
    return {
      authorized: false,
      reason: `Agent "${agent.name}" is not active (status: ${agent.status}). Only active agents may execute tools.`,
      agent
    };
  }

  const tool = getTool(toolName);
  if (!tool) {
    return { authorized: false, reason: `Unknown tool: ${toolName}`, agent };
  }

  const missingPermissions = tool.permissions.filter(
    permission => !agent.permissions.includes(permission)
  );
  if (missingPermissions.length > 0) {
    return {
      authorized: false,
      reason: `Agent "${agent.name}" lacks required permission(s) for "${toolName}": ${missingPermissions.join(", ")}.`,
      agent,
      missingPermissions
    };
  }

  if (tool.affectsExternalSystems && !agent.securityPolicy.allowExternalSystemActions) {
    return {
      authorized: false,
      reason: `Agent "${agent.name}" is not authorized for external-system actions, which "${toolName}" requires.`,
      agent
    };
  }

  if (tool.name === "agent.create" && !agent.securityPolicy.allowAgentCreation) {
    return {
      authorized: false,
      reason: `Agent "${agent.name}" is not authorized to create other agents.`,
      agent
    };
  }

  if (tool.name === "permissions.modify" && !agent.securityPolicy.allowPermissionChanges) {
    return {
      authorized: false,
      reason: `Agent "${agent.name}" is not authorized to modify permissions.`,
      agent
    };
  }

  return { authorized: true, agent };
}

/**
 * Convenience check used by the Supervisor when scanning for a candidate
 * agent — same rule as authorizeAgentForTool but takes an already-loaded
 * agent record to avoid a redundant store read per candidate.
 */
export function agentCoversTool(agent: LeoAgent, toolName: string): boolean {
  if (agent.status !== "active") return false;
  const tool = getTool(toolName);
  if (!tool) return false;
  const hasAllPermissions = tool.permissions.every(permission => agent.permissions.includes(permission));
  if (!hasAllPermissions) return false;
  if (tool.affectsExternalSystems && !agent.securityPolicy.allowExternalSystemActions) return false;
  return true;
}
