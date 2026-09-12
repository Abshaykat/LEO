import { registerToolExecutor } from "../execution/tool-executor-registry.ts";
import {
  createFamilyMember,
  deleteFamilyMember,
  listFamilyMembers,
  setFamilyMemberStatus,
  updateFamilyMemberPermissions
} from "./family-store.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

function toPermissionList(value: unknown): ToolPermission[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(String) as ToolPermission[];
}

registerToolExecutor("user.list", () => listFamilyMembers());

registerToolExecutor("user.create", parameters => {
  const p = objectParams(parameters);
  const role = p.role === "adult" || p.role === "child" || p.role === "guest" ? p.role : "guest";
  return createFamilyMember({
    name: String(p.name ?? ""),
    role,
    permissions: toPermissionList(p.permissions)
  });
});

registerToolExecutor("user.update_permissions", parameters => {
  const p = objectParams(parameters);
  const id = String(p.id ?? "");
  const permissions = toPermissionList(p.permissions);
  if (!permissions) throw new Error("user.update_permissions requires a permissions array.");
  return updateFamilyMemberPermissions(id, { permissions });
});

registerToolExecutor("user.disable", parameters => {
  const p = objectParams(parameters);
  return setFamilyMemberStatus(String(p.id ?? ""), "disabled");
});

registerToolExecutor("user.enable", parameters => {
  const p = objectParams(parameters);
  return setFamilyMemberStatus(String(p.id ?? ""), "active");
});

registerToolExecutor("user.delete", async parameters => {
  const p = objectParams(parameters);
  const id = String(p.id ?? "");
  await deleteFamilyMember(id);
  return { deleted: true, id };
});
