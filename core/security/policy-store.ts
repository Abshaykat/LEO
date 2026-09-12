import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_ROOT } from "../config/leo-config.ts";

export interface LeoPolicy {
  version: 1;
  updatedAt: string;
  allowAgentCreation: boolean;
  allowPermissionChanges: boolean;
  allowExternalSystemActions: boolean;
}

const FILE = path.join(WORKSPACE_ROOT, "security", "policy.json");

const DEFAULT_POLICY: LeoPolicy = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  allowAgentCreation: true,
  allowPermissionChanges: true,
  allowExternalSystemActions: false
};

async function ensure(): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
}

export async function getPolicy(): Promise<LeoPolicy> {
  await ensure();
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as LeoPolicy;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return DEFAULT_POLICY;
    }
    throw error;
  }
}

export async function updatePolicy(patch: Partial<Omit<LeoPolicy, "version" | "updatedAt">>): Promise<LeoPolicy> {
  const current = await getPolicy();
  const next: LeoPolicy = {
    ...current,
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString()
  };
  await ensure();
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  await rename(tmp, FILE);
  return next;
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

registerToolExecutor("permissions.modify", parameters => {
  const p = objectParams(parameters);
  const key = typeof p.key === "string" ? p.key : "";
  if (!["allowAgentCreation", "allowPermissionChanges", "allowExternalSystemActions"].includes(key)) {
    throw new Error("Unsupported permission policy key.");
  }
  if (typeof p.value !== "boolean") throw new Error("Permission policy value must be boolean.");
  return updatePolicy({ [key]: p.value });
});
