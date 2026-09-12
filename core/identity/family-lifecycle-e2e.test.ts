import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. FAMILY IDENTITY END-TO-END TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-family-e2e-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "family-e2e-test-key";

  const { execute } = await import("../execution/execution-engine.ts");
  const { approveRequest } = await import("../approvals/approval-engine.ts");
  const { requestAsFamilyMember } = await import("./family-gate.ts");
  const { getFamilyMember } = await import("./family-store.ts");

  const ownerContext = { source: "system" as const, ownerAuthenticated: true };

  async function ownerApproveAndExecute(request: any) {
    const pending = await execute(request);
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);
    return execute({ ...request, approvalId: pending.approvalId });
  }

  // 1. The OWNER creates a family member through the real user.create
  //    dispatcher (owner-approval-gated, like agent.create).
  let memberId = "";
  {
    const result = await ownerApproveAndExecute({
      toolName: "user.create",
      parameters: {
        name: "Rafi",
        role: "child",
        permissions: ["knowledge_management", "read_files"]
      },
      reason: "Owner adds a household member with a narrow, explicit scope.",
      context: ownerContext
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    memberId = (result.result as any).id;
    const stored = await getFamilyMember(memberId);
    if (stored?.status !== "active") throw new Error("Expected the new family member to start active.");
    console.log("PASS: the owner creates a family member through the real user.create dispatcher.");
  }

  // 2. The family member does real, in-scope work DIRECTLY — no approval
  //    needed, because knowledge.search is low-risk and within their scope.
  {
    const result = await requestAsFamilyMember({
      userId: memberId,
      toolName: "knowledge.search",
      parameters: { query: "homework help" },
      reason: "Rafi searches the local knowledge store.",
      context: ownerContext
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    console.log("PASS: the family member performs real, in-scope work directly through requestAsFamilyMember.");
  }

  // 3. The family member is refused a tool outside their granted scope —
  //    denied by the family gate itself, never even reaching the owner gate.
  {
    const result = await requestAsFamilyMember({
      userId: memberId,
      toolName: "pc.install_software",
      parameters: { id: "Some.Package" },
      reason: "Rafi tries to install software.",
      context: ownerContext
    });
    if (result.decision !== "deny") throw new Error(`SAFETY FAILURE: expected deny, got: ${JSON.stringify(result)}`);
    console.log("PASS: a tool outside the family member's granted scope is denied by the family gate.");
  }

  // 4. THE CRITICAL CHECK: the family member is granted write_files too,
  //    so knowledge.add_document is within their permission scope — but
  //    it's still an approval-required tool, so it must genuinely wait
  //    for the OWNER, not be silently allowed just because the member's
  //    scope covers it.
  {
    await execute({
      toolName: "user.update_permissions",
      parameters: { id: memberId, permissions: ["knowledge_management", "read_files", "write_files"] },
      reason: "Owner grants write scope.",
      context: ownerContext
    }).then(async pending => {
      if (pending.decision !== "require_approval" || !pending.approvalId) {
        throw new Error(`Expected require_approval for user.update_permissions, got: ${JSON.stringify(pending)}`);
      }
      await approveRequest(pending.approvalId);
      await execute({
        toolName: "user.update_permissions",
        parameters: { id: memberId, permissions: ["knowledge_management", "read_files", "write_files"] },
        reason: "Owner grants write scope.",
        context: ownerContext,
        approvalId: pending.approvalId
      });
    });

    const pending = await requestAsFamilyMember({
      userId: memberId,
      toolName: "knowledge.add_document",
      parameters: { title: "Rafi's note", content: "Something Rafi wants to save.", source: "rafi" },
      reason: "Rafi tries to add a knowledge document.",
      context: ownerContext
    });
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(
        `SAFETY FAILURE: expected require_approval even though the member has matching permissions, got: ${JSON.stringify(pending)}`
      );
    }
    console.log("PASS: an approval-required tool within the member's scope STILL waits for real owner approval, not a silent allow.");

    // The owner (and only the owner) approves it — proving the loop closes correctly.
    await approveRequest(pending.approvalId);
    const result = await requestAsFamilyMember({
      userId: memberId,
      toolName: "knowledge.add_document",
      parameters: { title: "Rafi's note", content: "Something Rafi wants to save.", source: "rafi" },
      reason: "Rafi tries to add a knowledge document.",
      context: ownerContext,
      approvalId: pending.approvalId
    });
    if (result.decision !== "allow") throw new Error(`Expected allow after real owner approval, got: ${JSON.stringify(result)}`);
    console.log("PASS: once the owner actually approves it, the family member's request completes correctly.");
  }

  // 5. Disabling the member (owner-approval-gated) immediately blocks
  //    further work, even for previously-authorized, in-scope tools.
  {
    const disableResult = await ownerApproveAndExecute({
      toolName: "user.disable",
      parameters: { id: memberId },
      reason: "Owner disables the family member.",
      context: ownerContext
    });
    if (disableResult.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(disableResult)}`);

    const denied = await requestAsFamilyMember({
      userId: memberId,
      toolName: "knowledge.search",
      parameters: { query: "anything" },
      reason: "Should be denied: member is disabled.",
      context: ownerContext
    });
    if (denied.decision !== "deny") throw new Error("SAFETY FAILURE: a disabled family member could still be delegated work.");
    console.log("PASS: user.disable (owner-approved) immediately blocks the family member from further work.");
  }

  // 6. The whole trail is traceable via userId in the audit log.
  {
    const { getAuditFilePath } = await import("../audit/audit-log.ts");
    const fs = await import("node:fs/promises");
    const lines = (await fs.readFile(getAuditFilePath(), "utf8")).split("\n").filter(Boolean);
    const events = lines.map(line => JSON.parse(line));
    const taggedForMember = events.filter(e => e.userId === memberId);
    if (taggedForMember.length === 0) throw new Error("Expected at least one audit event tagged with the family member's id.");
    console.log(`PASS: family-member actions leave a traceable, userId-tagged audit trail (${taggedForMember.length} events).`);
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== FAMILY IDENTITY END-TO-END TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
