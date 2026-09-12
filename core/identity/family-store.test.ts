import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. FAMILY-STORE TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-family-store-test-"));
  process.env.LEO_HOME = tempRoot;

  const {
    createFamilyMember,
    getFamilyMember,
    listFamilyMembers,
    updateFamilyMemberPermissions,
    setFamilyMemberStatus,
    deleteFamilyMember
  } = await import("./family-store.ts");

  // 1. Create defaults to active status, exact permissions given (no implied extras from role).
  const member = await createFamilyMember({ name: "Nusrat", role: "adult", permissions: ["knowledge_management"] });
  if (member.status !== "active") throw new Error("Expected a new family member to start active.");
  if (member.permissions.length !== 1 || member.permissions[0] !== "knowledge_management") {
    throw new Error("Expected exactly the given permissions, nothing implied by role.");
  }
  console.log("PASS: createFamilyMember starts active with exactly the given permission scope.");

  // 2. Rejects an empty name and an invalid role.
  {
    let threw = false;
    try {
      await createFamilyMember({ name: "  ", role: "adult" });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected an empty name to be rejected.");
  }
  {
    let threw = false;
    try {
      await createFamilyMember({ name: "X", role: "owner" as any });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected an invalid role to be rejected.");
  }
  console.log("PASS: createFamilyMember validates name and role.");

  // 3. Defaulting: omitting permissions entirely gives an empty (least-privilege) scope.
  const noPerms = await createFamilyMember({ name: "Guest", role: "guest" });
  if (noPerms.permissions.length !== 0) throw new Error("Expected omitted permissions to default to an empty array.");
  console.log("PASS: omitting permissions defaults to least-privilege (empty scope).");

  // 4. listFamilyMembers returns everyone, sorted by name.
  {
    const all = await listFamilyMembers();
    const names = all.map(m => m.name);
    if (!names.includes("Nusrat") || !names.includes("Guest")) throw new Error("Expected both members to be listed.");
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(names) !== JSON.stringify(sorted)) throw new Error("Expected the list to be name-sorted.");
  }
  console.log("PASS: listFamilyMembers returns every member, sorted by name.");

  // 5. updateFamilyMemberPermissions replaces the scope and bumps version.
  {
    const updated = await updateFamilyMemberPermissions(member.id, { permissions: ["knowledge_management", "read_files"] });
    if (updated.permissions.length !== 2) throw new Error("Expected the permission scope to be replaced.");
    if (updated.version !== member.version + 1) throw new Error("Expected the version to increment.");
  }
  console.log("PASS: updateFamilyMemberPermissions replaces scope and increments version.");

  // 6. setFamilyMemberStatus toggles disabled/active.
  {
    const disabled = await setFamilyMemberStatus(member.id, "disabled");
    if (disabled.status !== "disabled") throw new Error("Expected status to become disabled.");
    const reenabled = await setFamilyMemberStatus(member.id, "active");
    if (reenabled.status !== "active") throw new Error("Expected status to become active again.");
  }
  console.log("PASS: setFamilyMemberStatus toggles between active and disabled.");

  // 7. getFamilyMember returns null (not a throw) for an unknown id.
  {
    const missing = await getFamilyMember("00000000-0000-0000-0000-000000000000");
    if (missing !== null) throw new Error("Expected an unknown id to resolve to null.");
  }
  console.log("PASS: getFamilyMember returns null for an unknown id rather than throwing.");

  // 8. deleteFamilyMember removes the record; a second delete is a harmless no-op.
  {
    await deleteFamilyMember(member.id);
    const gone = await getFamilyMember(member.id);
    if (gone !== null) throw new Error("Expected the member to be gone after deletion.");
    await deleteFamilyMember(member.id); // must not throw
  }
  console.log("PASS: deleteFamilyMember removes the record; deleting again is a harmless no-op.");

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== FAMILY-STORE TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
