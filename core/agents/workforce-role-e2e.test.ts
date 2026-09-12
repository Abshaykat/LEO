import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. WORKFORCE ROLE END-TO-END TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-workforce-e2e-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "workforce-e2e-test-key";

  const { execute } = await import("../execution/execution-engine.ts");
  const { approveRequest } = await import("../approvals/approval-engine.ts");
  const { assignTask } = await import("./supervisor.ts");
  const { getAgent } = await import("./agent-store.ts");
  const { AgentWorkforce } = await import("./agent-workforce.ts");

  const context = { source: "system" as const, ownerAuthenticated: true };
  const workforce = new AgentWorkforce();

  async function approveAndExecute(request: any) {
    const pending = await execute(request);
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);
    return execute({ ...request, approvalId: pending.approvalId });
  }

  // 1. Build the "system" role draft via the workforce template, then
  //    actually create it through the real agent.create dispatcher — using
  //    the role's own capabilities and its (advisory) recommended
  //    permissions, exactly as an owner reviewing the template would.
  const roleDraft = workforce.createRole(
    "system",
    "Run local health checks and keep L.E.O.'s own workspace tidy."
  );
  const recommendedPermissions = workforce.recommendedPermissions("system");

  let agentId = "";
  {
    const result = await approveAndExecute({
      toolName: "agent.create",
      parameters: {
        name: roleDraft.definition.name,
        purpose: roleDraft.definition.purpose,
        instructions: roleDraft.definition.instructions,
        capabilities: roleDraft.definition.capabilities,
        permissions: recommendedPermissions
      },
      reason: "Owner approved creating a system-role agent from the workforce template.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    agentId = (result.result as any).id;
    console.log("PASS: a workforce-templated system-role agent is created through the real agent.create dispatcher.");
  }

  // 2. Activate it through the real dispatcher.
  {
    const result = await approveAndExecute({
      toolName: "agent.activate",
      parameters: { id: agentId },
      reason: "Owner approves activating the system-role agent.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    const stored = await getAgent(agentId);
    if (stored?.status !== "active") throw new Error("Expected the agent to be active.");
    console.log("PASS: the workforce-templated agent activates through the real dispatcher.");
  }

  // 3. Supervisor delegates a real Layer 2 diagnostics tool to it — no
  //    approval needed for a read-only health check, so this should
  //    succeed directly, proving the role's granted permissions actually
  //    cover a real Layer 2 tool end to end.
  {
    const result = await assignTask({
      agentId,
      toolName: "diagnostics.run_health_check",
      parameters: {},
      reason: "Delegating a real health check to the system-role agent.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    if (!Array.isArray((result.result as any).checks)) {
      throw new Error("Expected a real diagnostic report with a checks array.");
    }
    console.log("PASS: the system-role agent performs a real Layer 2 diagnostics task via the Supervisor.");
  }

  // 4. It should NOT be authorized for something outside its granted scope
  //    (e.g. modifying permissions), even though it's active and otherwise capable.
  {
    const result = await assignTask({
      agentId,
      toolName: "permissions.modify",
      parameters: {},
      reason: "Should be denied: outside the system role's granted scope.",
      context
    });
    if (result.decision !== "deny") throw new Error("SAFETY FAILURE: the system-role agent was authorized outside its granted scope.");
    console.log("PASS: the system-role agent remains confined to its granted scope, even for other 'system-sounding' tools.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== WORKFORCE ROLE END-TO-END TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
