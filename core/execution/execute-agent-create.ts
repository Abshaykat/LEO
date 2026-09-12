import { AgentFactory } from "../agents/agent-factory.ts";
import { createAgent } from "../agents/agent-store.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters)
  ) {
    return {};
  }

  return parameters as Record<string, unknown>;
}

export async function executeAgentCreate(
  parameters: unknown
) {
  const p = objectParams(parameters);

  const factory = new AgentFactory();

  const draft = factory.createDraft({
    name: String(p.name ?? ""),
    purpose: String(p.purpose ?? ""),
    instructions: String(p.instructions ?? ""),

    capabilities: Array.isArray(p.capabilities)
      ? p.capabilities.map(String)
      : [],

    permissions: Array.isArray(p.permissions)
      ? p.permissions.map(String) as ToolPermission[]
      : []
  });

  return createAgent({
    name: draft.name,
    purpose: draft.purpose,
    instructions: draft.instructions,
    capabilities: draft.capabilities,
    permissions: draft.permissions,
    memoryPolicy: draft.memoryPolicy,
    securityPolicy: draft.securityPolicy
  });
}
