import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. END-TO-END: CREATE -> ACTIVATE -> WORK TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-agent-e2e-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "agent-e2e-test-key";

  const { execute } = await import("./execution-engine.ts");
  const { approveRequest } = await import("../approvals/approval-engine.ts");
  const { assignTask } = await import("../agents/supervisor.ts");
  const { getAgent } = await import("../agents/agent-store.ts");

  const context = { source: "system" as const, ownerAuthenticated: true };

  async function approveAndExecute(request: any) {
    const pending = await execute(request);
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);
    return execute({ ...request, approvalId: pending.approvalId });
  }

  // 1. Create the agent through the REAL dispatcher (agent.create), not by
  //    calling agent-store's createAgent() directly.
  let agentId = "";
  {
    const result = await approveAndExecute({
      toolName: "agent.create",
      parameters: {
        name: "leo-knowledge-worker",
        purpose: "Search and add documents to the local knowledge store.",
        instructions: "Handle knowledge search/add tasks the owner delegates.",
        permissions: ["knowledge_management", "read_files", "write_files"]
      },
      reason: "Owner asked LEO to create a knowledge-management agent.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    agentId = (result.result as any).id;
    const stored = await getAgent(agentId);
    if (!stored || stored.status !== "draft") {
      throw new Error(`Expected the newly created agent to be in "draft" status, got: ${stored?.status}`);
    }
    console.log("PASS: agent.create works through the real execute() dispatcher and lands the agent in draft status.");
  }

  // 2. THE CRITICAL STEP: activate the agent through the real dispatcher.
  //    Before this fix, "agent.activate" had NO case in the executor switch
  //    at all — this call would have thrown "No executor is registered for
  //    tool: agent.activate", meaning a created agent could never actually
  //    become usable through the normal system.
  {
    const result = await approveAndExecute({
      toolName: "agent.activate",
      parameters: { id: agentId },
      reason: "Owner approved activating the new knowledge-management agent.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    const stored = await getAgent(agentId);
    if (!stored || stored.status !== "active") {
      throw new Error(`Expected the agent to now be "active", got: ${stored?.status}`);
    }
    console.log("PASS: agent.activate now works through the real execute() dispatcher — the agent is genuinely active.");
  }

  // 3. Now that the agent is genuinely active (verified via the real
  //    dispatch path, not a direct store call), the Supervisor can
  //    actually put it to work.
  {
    const created = await assignTask({
      agentId,
      toolName: "knowledge.add_document",
      parameters: {
        title: "End-to-end test document",
        content: "Proves create -> activate -> delegate-real-work all work through the real system.",
        source: "e2e-test"
      },
      reason: "Delegating a real task to the newly activated agent.",
      context
    });
    if (created.decision !== "require_approval" || !created.approvalId) {
      throw new Error(`Expected require_approval for the delegated task, got: ${JSON.stringify(created)}`);
    }
    await approveRequest(created.approvalId);

    const result = await assignTask({
      agentId,
      toolName: "knowledge.add_document",
      parameters: {
        title: "End-to-end test document",
        content: "Proves create -> activate -> delegate-real-work all work through the real system.",
        source: "e2e-test"
      },
      reason: "Delegating a real task to the newly activated agent.",
      context,
      approvalId: created.approvalId
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    console.log("PASS: the newly created-and-activated agent successfully does real, owner-approved work via the Supervisor.");
  }

  // 4. Disable and archive also now work through the real dispatcher.
  {
    const disableResult = await approveAndExecute({
      toolName: "agent.disable",
      parameters: { id: agentId },
      reason: "Owner disables the agent.",
      context
    });
    if (disableResult.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(disableResult)}`);
    const afterDisable = await getAgent(agentId);
    if (afterDisable?.status !== "disabled") throw new Error("Expected the agent to be disabled.");

    // A disabled agent can no longer be delegated work, even with the
    // correct permissions — this is the agent-scope guard from Layer 3.
    const denied = await assignTask({
      agentId,
      toolName: "knowledge.search",
      parameters: { query: "anything" },
      reason: "Should be denied: agent is disabled.",
      context
    });
    if (denied.decision !== "deny") throw new Error("SAFETY FAILURE: a disabled agent was still able to be delegated work.");

    const archiveResult = await approveAndExecute({
      toolName: "agent.archive",
      parameters: { id: agentId },
      reason: "Owner archives the agent.",
      context
    });
    if (archiveResult.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(archiveResult)}`);
    const afterArchive = await getAgent(agentId);
    if (afterArchive?.status !== "archived") throw new Error("Expected the agent to be archived.");

    console.log("PASS: agent.disable and agent.archive also now work through the real dispatcher, and a disabled agent is correctly refused further work.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== END-TO-END CREATE -> ACTIVATE -> WORK TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
