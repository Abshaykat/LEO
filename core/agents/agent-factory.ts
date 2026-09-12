import {
  createDefaultCapabilityRegistry
} from "../capabilities/capability-registry.ts";

import type {
  CapabilityDefinition
} from "../capabilities/capability-types.ts";

import {
  normalizeAgentInput,
  validateAgentInput,
  type AgentFactoryInput,
  DEFAULT_AGENT_MEMORY_POLICY,
  DEFAULT_AGENT_SECURITY_POLICY
} from "./agent-policy.ts";

export interface AgentFactoryDraft {
  name: string;
  purpose: string;
  instructions: string;
  status: "draft";
  capabilities: string[];
  permissions: AgentFactoryInput["permissions"];
  memoryPolicy: typeof DEFAULT_AGENT_MEMORY_POLICY;
  securityPolicy: typeof DEFAULT_AGENT_SECURITY_POLICY;
  version: 1;
}

export class AgentFactory {
  private readonly capabilities;

  constructor(
    capabilities: CapabilityDefinition[] =
      createDefaultCapabilityRegistry().list()
  ) {
    this.capabilities = capabilities;
  }

  validate(
    input: AgentFactoryInput
  ) {
    return validateAgentInput(
      input,
      this.capabilities
    );
  }

  createDraft(
    input: AgentFactoryInput
  ): AgentFactoryDraft {
    const normalized = normalizeAgentInput(input);

    const validation = this.validate(normalized);

    if (!validation.valid) {
      throw new Error(
        validation.errors.join(" ")
      );
    }

    return {
      name: normalized.name,
      purpose: normalized.purpose,
      instructions: normalized.instructions,
      status: "draft",
      capabilities: [...(normalized.capabilities ?? [])],
      permissions: [...(normalized.permissions ?? [])],
      memoryPolicy: {
        mode:
          normalized.memoryPolicy?.mode ??
          DEFAULT_AGENT_MEMORY_POLICY.mode,
        allowedScopes: [
          ...(normalized.memoryPolicy?.allowedScopes ?? [])
        ]
      },
      securityPolicy: {
        ...DEFAULT_AGENT_SECURITY_POLICY
      },
      version: 1
    };
  }
}
