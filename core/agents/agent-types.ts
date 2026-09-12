import type { CapabilityDefinition } from "../capabilities/capability-types.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";

export type AgentLifecycleStatus =
  | "draft"
  | "active"
  | "disabled"
  | "archived";

export type AgentMemoryMode =
  | "none"
  | "restricted"
  | "standard";

export interface AgentMemoryPolicy {
  mode: AgentMemoryMode;
  allowedScopes: string[];
}

export interface AgentSecurityPolicy {
  allowExternalSystemActions: boolean;
  allowPermissionChanges: boolean;
  allowAgentCreation: boolean;
  allowAutonomousExecution: boolean;
}

export interface LeoAgent {
  id: string;
  name: string;
  purpose: string;
  instructions: string;

  status: AgentLifecycleStatus;

  capabilities: string[];
  permissions: ToolPermission[];

  memoryPolicy: AgentMemoryPolicy;
  securityPolicy: AgentSecurityPolicy;

  version: number;

  createdAt: string;
  updatedAt: string;
}
