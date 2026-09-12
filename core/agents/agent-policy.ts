import type { CapabilityDefinition } from "../capabilities/capability-types.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";

export interface AgentFactoryInput {
  name: string;
  purpose: string;
  instructions: string;
  capabilities?: string[];
  permissions?: ToolPermission[];
  memoryPolicy?: {
    mode?: "none" | "restricted" | "standard";
    allowedScopes?: string[];
  };
  securityPolicy?: {
    allowExternalSystemActions?: boolean;
    allowPermissionChanges?: boolean;
    allowAgentCreation?: boolean;
    allowAutonomousExecution?: boolean;
  };
}

export interface AgentValidationResult {
  valid: boolean;
  errors: string[];
  capabilities: CapabilityDefinition[];
}

export const DEFAULT_AGENT_SECURITY_POLICY = Object.freeze({
  allowExternalSystemActions: false,
  allowPermissionChanges: false,
  allowAgentCreation: false,
  allowAutonomousExecution: false
});

export const DEFAULT_AGENT_MEMORY_POLICY: { mode: "none" | "restricted" | "standard"; allowedScopes: string[] } = Object.freeze({ mode: "restricted", allowedScopes: [] });

export function normalizeAgentInput(
  input: AgentFactoryInput
): AgentFactoryInput {
  return {
    ...input,
    name: input.name.trim(),
    purpose: input.purpose.trim(),
    instructions: input.instructions.trim(),
    capabilities: [...new Set(input.capabilities ?? [])],
    permissions: [...new Set(input.permissions ?? [])],
    memoryPolicy: {
      mode: input.memoryPolicy?.mode ?? DEFAULT_AGENT_MEMORY_POLICY.mode,
      allowedScopes: [
        ...new Set(input.memoryPolicy?.allowedScopes ?? [])
      ]
    },
    securityPolicy: {
      ...DEFAULT_AGENT_SECURITY_POLICY,
      ...input.securityPolicy
    }
  };
}

export function validateAgentInput(
  input: AgentFactoryInput,
  availableCapabilities: CapabilityDefinition[]
): AgentValidationResult {
  const normalized = normalizeAgentInput(input);
  const errors: string[] = [];

  if (!normalized.name) {
    errors.push("Agent name is required.");
  }

  if (!normalized.purpose) {
    errors.push("Agent purpose is required.");
  }

  if (!normalized.instructions) {
    errors.push("Agent instructions are required.");
  }

  const registry = new Map(
    availableCapabilities.map(capability => [
      capability.id,
      capability
    ])
  );

  const capabilities: CapabilityDefinition[] = [];

  for (const id of normalized.capabilities ?? []) {
    const capability = registry.get(id);

    if (!capability) {
      errors.push(`Unknown capability: ${id}`);
      continue;
    }

    if (capability.status !== "available") {
      errors.push(
        `Capability is not available: ${id}`
      );
      continue;
    }

    capabilities.push(capability);
  }

  if (normalized.securityPolicy?.allowAutonomousExecution) {
    errors.push(
      "Autonomous agent execution cannot be enabled by the factory."
    );
  }

  if (normalized.securityPolicy?.allowPermissionChanges) {
    errors.push(
      "Agent permission changes cannot be enabled by the factory."
    );
  }

  if (normalized.securityPolicy?.allowAgentCreation) {
    errors.push(
      "Agent creation authority cannot be delegated to an agent."
    );
  }

  if (normalized.securityPolicy?.allowExternalSystemActions) {
    errors.push(
      "External system authority cannot be delegated by the factory."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    capabilities
  };
}

