import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. FAMILY-EXECUTION-CONTEXT TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-family-context-test-"));
  process.env.LEO_HOME = tempRoot;

  const { createFamilyMember, setFamilyMemberStatus } = await import("./family-store.ts");
  const { authorizeFamilyMemberForTool } = await import("./family-execution-context.ts");

  const member = await createFamilyMember({
    name: "test-teen",
    role: "child",
    permissions: ["knowledge_management", "read_files"]
  });

  // 1. Active member with matching permissions is authorized for a low-risk tool.
  {
    const result = await authorizeFamilyMemberForTool(member.id, "knowledge.search");
    if (!result.authorized) throw new Error(`Expected authorization, got denial: ${result.reason}`);
    if (result.requiresOwnerApproval) throw new Error("knowledge.search should not require owner approval.");
    console.log("PASS: an active member with matching permissions is authorized for a low-risk, no-approval tool.");
  }

  // 2. A tool outside the granted permissions is denied outright.
  {
    const result = await authorizeFamilyMemberForTool(member.id, "pc.install_software");
    if (result.authorized) throw new Error("SAFETY FAILURE: member was authorized outside their granted permissions.");
    if (!result.missingPermissions || result.missingPermissions.length === 0) {
      throw new Error("Expected missingPermissions to explain the gap.");
    }
    console.log("PASS: a tool outside the granted permission scope is denied outright.");
  }

  // 3. Even WITH matching permissions, an approval-required tool is
  //    "authorized to proceed" but flagged as still needing the owner —
  //    never a silent bypass.
  {
    const grantedButSensitive = await createFamilyMember({
      name: "test-adult",
      role: "adult",
      permissions: ["knowledge_management", "read_files", "write_files"]
    });
    const result = await authorizeFamilyMemberForTool(grantedButSensitive.id, "knowledge.add_document");
    if (!result.authorized) throw new Error("Expected the member to be allowed to proceed to the owner-approval gate.");
    if (!result.requiresOwnerApproval) {
      throw new Error("SAFETY FAILURE: an approval-required tool was not flagged as needing owner approval.");
    }
    console.log("PASS: an approval-required tool is never silently authorized, even with matching permissions.");
  }

  // 4. A disabled member is denied regardless of permissions.
  {
    await setFamilyMemberStatus(member.id, "disabled");
    const result = await authorizeFamilyMemberForTool(member.id, "knowledge.search");
    if (result.authorized) throw new Error("SAFETY FAILURE: a disabled member was still authorized.");
    if (!result.reason?.includes("not active")) throw new Error(`Expected a status-based denial, got: ${result.reason}`);
    console.log("PASS: a disabled family member is denied regardless of their granted permissions.");
  }

  // 5. Unknown member id.
  {
    const result = await authorizeFamilyMemberForTool("00000000-0000-0000-0000-000000000000", "knowledge.search");
    if (result.authorized || !result.reason?.includes("Unknown family member")) {
      throw new Error("Expected an unknown-member denial.");
    }
    console.log("PASS: an unknown family member id is denied with a clear reason.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== FAMILY-EXECUTION-CONTEXT TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
