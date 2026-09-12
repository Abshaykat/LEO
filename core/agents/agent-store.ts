import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AGENT_ROOT } from "../config/leo-config.ts";
import { validateAgentLifecycleTransition } from "./agent-lifecycle-policy.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";
import type {
  AgentLifecycleStatus,
  AgentMemoryPolicy,
  AgentSecurityPolicy,
  LeoAgent
} from "./agent-types.ts";

export type { LeoAgent };

function filePath(id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error("Invalid agent id.");
  }
  return path.join(AGENT_ROOT, `${id}.json`);
}

async function ensure(): Promise<void> {
  await mkdir(AGENT_ROOT, { recursive: true });
}

async function save(agent: LeoAgent): Promise<void> {
  await ensure();

  const target = filePath(agent.id);
  const temp = `${target}.tmp`;

  await writeFile(
    temp,
    JSON.stringify(agent, null, 2) + "\n",
    "utf8"
  );

  await rename(temp, target);
}

export async function getAgent(id: string): Promise<LeoAgent | null> {
  const target = filePath(id);

  try {
    const raw = await readFile(target, "utf8");
    return JSON.parse(raw) as LeoAgent;
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function transitionAgentLifecycle(
  id: string,
  targetStatus: AgentLifecycleStatus
): Promise<LeoAgent> {
  const agent = await getAgent(id);

  if (!agent) {
    throw new Error(`Agent not found: ${id}`);
  }

  const validation = validateAgentLifecycleTransition(
    agent.status,
    targetStatus
  );

  if (!validation.allowed) {
    throw new Error(
      validation.reason ?? "Invalid agent lifecycle transition."
    );
  }

  const updated: LeoAgent = {
    ...agent,
    status: targetStatus,
    version: agent.version + 1,
    updatedAt: new Date().toISOString()
  };

  await save(updated);

  return updated;
}
export async function listAgents(): Promise<LeoAgent[]> {
  await ensure();

  const { readdir } = await import("node:fs/promises");

  const entries = await readdir(
    AGENT_ROOT,
    { withFileTypes: true }
  );

  const result: LeoAgent[] = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".json")
    ) {
      continue;
    }

    try {
      const value = JSON.parse(
        await readFile(
          path.join(AGENT_ROOT, entry.name),
          "utf8"
        )
      ) as LeoAgent;

      if (
        value &&
        typeof value.id === "string" &&
        typeof value.name === "string"
      ) {
        result.push(value);
      }
    } catch {
      // Ignore malformed agent files.
      // Diagnostics can report them later.
    }
  }

  return result.sort(
    (a, b) => a.name.localeCompare(b.name)
  );
}

export interface CreateAgentInput {
  name: string;
  purpose: string;
  instructions: string;
  capabilities?: string[];
  permissions?: ToolPermission[];
  memoryPolicy?: AgentMemoryPolicy;
  securityPolicy?: AgentSecurityPolicy;
}

export async function createAgent(
  input: CreateAgentInput
): Promise<LeoAgent> {

  if (!input.name.trim()) {
    throw new Error("Agent name is required.");
  }

  if (!input.purpose.trim()) {
    throw new Error("Agent purpose is required.");
  }

  if (!input.instructions.trim()) {
    throw new Error("Agent instructions are required.");
  }

  const now = new Date().toISOString();

  const agent: LeoAgent = {
    id: randomUUID(),

    name: input.name.trim(),
    purpose: input.purpose.trim(),
    instructions: input.instructions.trim(),

    status: "draft",

    capabilities: [
      ...new Set(input.capabilities ?? [])
    ],

    permissions: [
      ...new Set(input.permissions ?? [])
    ],

    memoryPolicy: {
      mode: input.memoryPolicy?.mode ?? "restricted",
      allowedScopes: [
        ...new Set(
          input.memoryPolicy?.allowedScopes ?? []
        )
      ]
    },

    securityPolicy: {
      allowExternalSystemActions:
        input.securityPolicy?.allowExternalSystemActions ?? false,

      allowPermissionChanges:
        input.securityPolicy?.allowPermissionChanges ?? false,

      allowAgentCreation:
        input.securityPolicy?.allowAgentCreation ?? false,

      allowAutonomousExecution:
        input.securityPolicy?.allowAutonomousExecution ?? false
    },

    version: 1,

    createdAt: now,
    updatedAt: now
  };

  /*
   * Factory-created agents must never begin
   * with delegated authority.
   */
  if (
    agent.securityPolicy.allowExternalSystemActions ||
    agent.securityPolicy.allowPermissionChanges ||
    agent.securityPolicy.allowAgentCreation ||
    agent.securityPolicy.allowAutonomousExecution
  ) {
    throw new Error(
      "Agent authority escalation is not permitted."
    );
  }

  await save(agent);

  return agent;
}

export interface UpdateAgentFields {
  name?: string;
  purpose?: string;
  instructions?: string;
}

export async function updateAgent(
  id: string,
  fields: UpdateAgentFields
): Promise<LeoAgent> {
  const agent = await getAgent(id);

  if (!agent) {
    throw new Error(`Agent not found: ${id}`);
  }

  const keys = Object.keys(fields);

  if (keys.length === 0) {
    throw new Error(
      "Agent update requires at least one mutable field."
    );
  }

  const allowed = new Set([
    "name",
    "purpose",
    "instructions"
  ]);

  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new Error(
        `Agent update field is not permitted: ${key}`
      );
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (
      typeof value !== "string" ||
      value.trim().length === 0
    ) {
      throw new Error(
        `Agent update field must be a non-empty string: ${key}`
      );
    }
  }

  const updated: LeoAgent = {
    ...agent,

    ...(fields.name !== undefined
      ? { name: fields.name.trim() }
      : {}),

    ...(fields.purpose !== undefined
      ? { purpose: fields.purpose.trim() }
      : {}),

    ...(fields.instructions !== undefined
      ? { instructions: fields.instructions.trim() }
      : {}),

    version: agent.version + 1,
    updatedAt: new Date().toISOString()
  };

  await save(updated);

  return updated;
}
export async function deleteAgent(
  id: string
): Promise<void> {
  try {
    await unlink(filePath(id));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}
