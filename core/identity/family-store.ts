import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FAMILY_ROOT } from "../config/leo-config.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";
import type { FamilyMemberStatus, FamilyRole, LeoFamilyMember } from "./family-types.ts";

export type { LeoFamilyMember };

function filePath(id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error("Invalid family member id.");
  }
  return path.join(FAMILY_ROOT, `${id}.json`);
}

async function ensure(): Promise<void> {
  await mkdir(FAMILY_ROOT, { recursive: true });
}

async function save(member: LeoFamilyMember): Promise<void> {
  await ensure();
  const target = filePath(member.id);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(member, null, 2) + "\n", "utf8");
  await rename(temp, target);
}

export async function getFamilyMember(id: string): Promise<LeoFamilyMember | null> {
  try {
    const raw = await readFile(filePath(id), "utf8");
    return JSON.parse(raw) as LeoFamilyMember;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function listFamilyMembers(): Promise<LeoFamilyMember[]> {
  await ensure();
  const entries = await readdir(FAMILY_ROOT, { withFileTypes: true });
  const result: LeoFamilyMember[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const value = JSON.parse(await readFile(path.join(FAMILY_ROOT, entry.name), "utf8")) as LeoFamilyMember;
      if (value && typeof value.id === "string" && typeof value.name === "string") {
        result.push(value);
      }
    } catch {
      // Ignore malformed family member files; diagnostics can report them later.
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreateFamilyMemberInput {
  name: string;
  role: FamilyRole;
  permissions?: ToolPermission[];
}

/**
 * Family members are created directly "active" (no draft/review step —
 * unlike agents, there's no auto-generated instruction text to review).
 * They start with EXACTLY the permissions the owner explicitly listed —
 * never anything implied by role.
 */
export async function createFamilyMember(input: CreateFamilyMemberInput): Promise<LeoFamilyMember> {
  if (!input.name.trim()) throw new Error("Family member name is required.");
  if (!["adult", "child", "guest"].includes(input.role)) {
    throw new Error(`Invalid family role: ${input.role}`);
  }

  const now = new Date().toISOString();
  const member: LeoFamilyMember = {
    id: randomUUID(),
    name: input.name.trim(),
    role: input.role,
    status: "active",
    permissions: [...new Set(input.permissions ?? [])],
    version: 1,
    createdAt: now,
    updatedAt: now
  };

  await save(member);
  return member;
}

export interface UpdateFamilyMemberInput {
  permissions?: ToolPermission[];
  voiceProfileId?: string | null;
}

export async function updateFamilyMemberPermissions(
  id: string,
  input: UpdateFamilyMemberInput
): Promise<LeoFamilyMember> {
  const member = await getFamilyMember(id);
  if (!member) throw new Error(`Family member not found: ${id}`);

  const updated: LeoFamilyMember = {
    ...member,
    ...(input.permissions !== undefined ? { permissions: [...new Set(input.permissions)] } : {}),
    ...(input.voiceProfileId !== undefined
      ? { voiceProfileId: input.voiceProfileId === null ? undefined : input.voiceProfileId }
      : {}),
    version: member.version + 1,
    updatedAt: new Date().toISOString()
  };

  await save(updated);
  return updated;
}

export async function setFamilyMemberStatus(id: string, status: FamilyMemberStatus): Promise<LeoFamilyMember> {
  const member = await getFamilyMember(id);
  if (!member) throw new Error(`Family member not found: ${id}`);

  const updated: LeoFamilyMember = {
    ...member,
    status,
    version: member.version + 1,
    updatedAt: new Date().toISOString()
  };

  await save(updated);
  return updated;
}

export async function deleteFamilyMember(id: string): Promise<void> {
  try {
    await unlink(filePath(id));
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
